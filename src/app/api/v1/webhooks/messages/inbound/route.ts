import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { processIncomingWebhook } from '@/lib/webhook-helper';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const result = await processIncomingWebhook(req, 'message', (p) => {
    return p.MessageUUID || p.message_uuid || `msg_${Date.now()}`;
  });

  if (!result.valid) return result.errorResponse!;
  if (result.isDuplicate) {
    return NextResponse.json({ status: 'already_processed' }, { status: 200 });
  }

  const { params, webhookEventId } = result;
  const messageUuid = params.MessageUUID || params.message_uuid;
  const from = params.From || params.from;
  const to = params.To || params.to;
  const text = params.Text || params.text || '';
  const type = (params.Type || params.type || 'sms').toLowerCase();

  if (!messageUuid || !from || !to) {
    return NextResponse.json({ status: 'ignored_missing_data' }, { status: 200 });
  }

  try {
    // Lookup which organization owns the 'To' number
    const phoneNumber = await db.phoneNumber.findFirst({
      where: { e164: to, status: 'active' },
      include: { organization: true },
    });

    let organizationId: string;
    if (phoneNumber) {
      organizationId = phoneNumber.organizationId;
    } else {
      const fallbackOrg = await db.organization.findFirst();
      if (!fallbackOrg) return NextResponse.json({ status: 'no_org' }, { status: 200 });
      organizationId = fallbackOrg.id;
    }

    // Upsert conversation thread
    const thread = await db.messageThread.upsert({
      where: {
        organizationId_ownNumberE164_counterpartE164: {
          organizationId,
          ownNumberE164: to,
          counterpartE164: from,
        },
      },
      update: {
        lastMessageAt: new Date(),
        unreadCount: { increment: 1 },
      },
      create: {
        organizationId,
        ownNumberE164: to,
        counterpartE164: from,
        lastMessageAt: new Date(),
        unreadCount: 1,
      },
    });

    // Create Inbound Message record
    await db.message.create({
      data: {
        organizationId,
        phoneNumberId: phoneNumber?.id,
        threadId: thread.id,
        plivoMessageUuid: messageUuid,
        direction: 'inbound',
        type,
        from,
        to,
        body: text,
        status: 'received',
        units: 1,
        rawPayload: params,
        sentAt: new Date(),
        deliveredAt: new Date(),
      },
    });

    if (webhookEventId) {
      await db.webhookEvent.update({
        where: { id: webhookEventId },
        data: { status: 'processed', processedAt: new Date() },
      });
    }
  } catch (err) {
    console.error('Error handling inbound message webhook:', err);
  }

  // Always return 200 fast to avoid Plivo retry/undelivered marking
  return NextResponse.json({ status: 'ok' }, { status: 200 });
}
