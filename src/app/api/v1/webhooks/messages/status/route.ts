import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { processIncomingWebhook } from '@/lib/webhook-helper';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const result = await processIncomingWebhook(req, 'message', (p) => {
    const uuid = p.MessageUUID || p.message_uuid || 'unknown';
    const status = p.Status || p.status || 'status';
    return `${uuid}_${status}`;
  });

  if (!result.valid) return result.errorResponse!;
  if (result.isDuplicate) {
    return NextResponse.json({ status: 'already_processed' }, { status: 200 });
  }

  const { params, webhookEventId } = result;
  const messageUuid = params.MessageUUID || params.message_uuid;
  const status = (params.Status || params.status || 'sent').toLowerCase();
  const units = params.Units ? Number(params.Units) : undefined;
  const totalRate = params.TotalRate ? Number(params.TotalRate) : undefined;
  const totalAmount = params.TotalAmount ? Number(params.TotalAmount) : undefined;
  const errorCode = params.ErrorCode || params.error_code;
  const mcc = params.MCC || params.mcc;
  const mnc = params.MNC || params.mnc;

  if (!messageUuid) {
    return NextResponse.json({ status: 'ignored_no_uuid' }, { status: 200 });
  }

  try {
    const existingMessage = await db.message.findUnique({
      where: { plivoMessageUuid: messageUuid },
    });

    if (existingMessage) {
      const isDelivered = status === 'delivered';
      await db.message.update({
        where: { id: existingMessage.id },
        data: {
          status,
          units: units !== undefined ? units : existingMessage.units,
          totalRate: totalRate !== undefined ? totalRate : existingMessage.totalRate,
          totalAmount: totalAmount !== undefined ? totalAmount : existingMessage.totalAmount,
          errorCode: errorCode || existingMessage.errorCode,
          mcc: mcc || existingMessage.mcc,
          mnc: mnc || existingMessage.mnc,
          deliveredAt: isDelivered ? new Date() : existingMessage.deliveredAt,
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
    console.error('Error handling message status webhook:', err);
  }

  return NextResponse.json({ status: 'ok' }, { status: 200 });
}
