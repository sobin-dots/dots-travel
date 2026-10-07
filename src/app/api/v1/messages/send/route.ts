import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { authenticateRequest, logAuditEvent } from '@/lib/api-auth';
import { SendMessageRequestSchema } from '@/lib/schemas';
import { getTelephonyProvider } from '@/lib/telephony';
import { analyzeMessageEncoding } from '@/lib/telephony/messaging/encoder';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const { auth, errorResponse } = await authenticateRequest(req, 'operator');
  if (errorResponse) return errorResponse;

  try {
    const body = await req.json();
    const parsed = SendMessageRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { api_id: 'bad_req', error: parsed.error.issues[0]?.message || 'Invalid send message parameters' },
        { status: 400 }
      );
    }

    const { phoneNumberId, to, text, mediaIds, statusCallbackUrl } = parsed.data;

    // Verify phone number ownership
    const phoneNumber = await db.phoneNumber.findFirst({
      where: {
        id: phoneNumberId,
        organizationId: auth!.organizationId,
        status: 'active',
      },
      include: { organization: true },
    });

    if (!phoneNumber) {
      return NextResponse.json(
        { api_id: 'not_found', error: 'Active source phone number not found in organization' },
        { status: 404 }
      );
    }

    // Analyze message encoding
    const analysis = analyzeMessageEncoding(text);

    // Prepare status callback URL
    const publicBase = process.env.PUBLIC_BASE_URL || 'http://localhost:3000';
    const callbackUrl = statusCallbackUrl || `${publicBase}/api/v1/webhooks/messages/status`;

    // Invoke provider
    const provider = getTelephonyProvider();
    const sendResult = await provider.sendMessage({
      src: phoneNumber.e164,
      dst: to,
      text,
      url: callbackUrl,
    });

    const createdMessages = [];

    // Persist messages & threads for each destination
    for (let i = 0; i < to.length; i++) {
      const dst = to[i];
      const messageUuid = sendResult.messageUuids[i] || `msg_${crypto.randomBytes(12).toString('hex')}`;

      // Upsert conversation thread
      const thread = await db.messageThread.upsert({
        where: {
          organizationId_ownNumberE164_counterpartE164: {
            organizationId: auth!.organizationId,
            ownNumberE164: phoneNumber.e164,
            counterpartE164: dst,
          },
        },
        update: {
          lastMessageAt: new Date(),
        },
        create: {
          organizationId: auth!.organizationId,
          ownNumberE164: phoneNumber.e164,
          counterpartE164: dst,
          lastMessageAt: new Date(),
          unreadCount: 0,
        },
      });

      const msg = await db.message.create({
        data: {
          organizationId: auth!.organizationId,
          phoneNumberId: phoneNumber.id,
          threadId: thread.id,
          plivoMessageUuid: messageUuid,
          direction: 'outbound',
          type: mediaIds && mediaIds.length > 0 ? 'mms' : 'sms',
          from: phoneNumber.e164,
          to: dst,
          body: phoneNumber.organization.redactMessageContent ? '[REDACTED]' : text,
          status: 'queued',
          units: analysis.units,
          redacted: phoneNumber.organization.redactMessageContent,
          sentAt: new Date(),
        },
      });

      createdMessages.push(msg);
    }

    await logAuditEvent({
      organizationId: auth!.organizationId,
      actorUserId: auth!.userId,
      action: 'message.send',
      metadata: { from: phoneNumber.e164, destinationsCount: to.length, units: analysis.units, encoding: analysis.encoding },
    });

    return NextResponse.json({
      api_id: sendResult.apiId,
      message: sendResult.message,
      encoding: analysis,
      messages: createdMessages,
    }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json(
      { api_id: 'provider_err', error: err.message },
      { status: 500 }
    );
  }
}
