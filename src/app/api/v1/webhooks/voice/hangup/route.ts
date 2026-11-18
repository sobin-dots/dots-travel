import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { processIncomingWebhook } from '@/lib/webhook-helper';
import { inboundFinalStatus, releaseCallAgentInTransaction } from '@/lib/telephony/agent-routing';
import { lockAgency } from '@/lib/lead-intake/service';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const result = await processIncomingWebhook(req, 'voice', (p) => {
    return `${p.CallUUID || p.call_uuid || 'unknown'}_hangup`;
  });

  if (!result.valid) return result.errorResponse!;
  if (result.isDuplicate) {
    return NextResponse.json({ status: 'already_processed' }, { status: 200 });
  }

  const { params, webhookEventId } = result;
  const callUuid = params.CallUUID || params.call_uuid;

  if (!callUuid) {
    return NextResponse.json({ status: 'ignored_no_uuid' }, { status: 200 });
  }

  const duration = params.Duration ? Number(params.Duration) : undefined;
  const billDuration = params.BillDuration ? Number(params.BillDuration) : undefined;
  const totalCost = params.TotalCost ? params.TotalCost.toString() : undefined;
  const hangupCause = params.HangupCause ? Number(params.HangupCause) : undefined;

  try {
    const call = await db.call.findUnique({ where: { plivoCallUuid: callUuid }, select: { organizationId: true } });
    const orgId = req.nextUrl.searchParams.get('orgId');
    if (!call || (orgId && call.organizationId !== orgId)) return NextResponse.json({ status: 'ignored_unknown_call' });
    await db.$transaction(async tx => {
      await lockAgency(tx, call.organizationId);
      const existingCall = await tx.call.findUnique({ where: { plivoCallUuid: callUuid } });
      if (!existingCall) return null;
      const finalStatus = inboundFinalStatus(existingCall);
      await tx.call.update({
        where: { id: existingCall.id },
        data: {
          status: finalStatus,
          ...(existingCall.direction === 'inbound' && existingCall.agentOutcome && finalStatus === 'missed' && existingCall.agentOutcome !== 'declined' ? { agentOutcome: 'missed' } : {}),
          endedAt: existingCall.endedAt || new Date(),
          durationSeconds: duration !== undefined ? duration : existingCall.durationSeconds,
          billDurationSeconds: billDuration !== undefined ? billDuration : existingCall.billDurationSeconds,
          totalCost: totalCost ? Number(totalCost) : existingCall.totalCost,
          hangupCauseCode: hangupCause,
          hangupCauseName: params.HangupCauseName || 'Hangup',
        },
      });

      // Real recordings and transcriptions are received via /webhooks/voice/record and /webhooks/transcription

      await tx.callEvent.create({
        data: {
          organizationId: existingCall.organizationId,
          callId: existingCall.id,
          eventType: 'hangup',
          status: finalStatus,
          payload: params,
          occurredAt: new Date(),
          webhookEventId,
        },
      });
      await releaseCallAgentInTransaction(tx, existingCall);
    });

    if (webhookEventId) {
      await db.webhookEvent.update({
        where: { id: webhookEventId },
        data: { status: 'processed', processedAt: new Date() },
      });
    }
  } catch (err) {
    console.error('Error handling voice hangup webhook:', err);
  }

  return NextResponse.json({ status: 'ok' }, { status: 200 });
}
