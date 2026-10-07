import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { processIncomingWebhook } from '@/lib/webhook-helper';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const result = await processIncomingWebhook(req, 'voice', (p) => {
    return `${p.CallUUID || p.call_uuid || 'unknown'}_${p.CallStatus || p.call_status || 'status'}`;
  });

  if (!result.valid) return result.errorResponse!;
  if (result.isDuplicate) {
    return NextResponse.json({ status: 'already_processed' }, { status: 200 });
  }

  const { params, webhookEventId } = result;
  const callUuid = params.CallUUID || params.call_uuid;
  const callStatus = params.CallStatus || params.call_status || 'ringing';

  if (!callUuid) {
    return NextResponse.json({ status: 'ignored_no_uuid' }, { status: 200 });
  }

  try {
    const existingCall = await db.call.findUnique({
      where: { plivoCallUuid: callUuid },
    });

    if (existingCall) {
      await db.call.update({
        where: { id: existingCall.id },
        data: { status: callStatus },
      });

      await db.callEvent.create({
        data: {
          organizationId: existingCall.organizationId,
          callId: existingCall.id,
          eventType: 'ring',
          status: callStatus,
          payload: params,
          occurredAt: new Date(),
          webhookEventId,
        },
      });
    }

    if (webhookEventId) {
      await db.webhookEvent.update({
        where: { id: webhookEventId },
        data: { status: 'processed', processedAt: new Date() },
      });
    }
  } catch (err) {
    console.error('Error handling voice status webhook:', err);
  }

  return NextResponse.json({ status: 'ok' }, { status: 200 });
}
