import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { processIncomingWebhook } from '@/lib/webhook-helper';
import { lockAgency } from '@/lib/lead-intake/service';
import { inboundFinalStatus, releaseCallAgentInTransaction } from '@/lib/telephony/agent-routing';

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
  const callStatus = String(params.CallStatus || params.call_status || 'ringing').toLowerCase();

  if (!callUuid) {
    return NextResponse.json({ status: 'ignored_no_uuid' }, { status: 200 });
  }

  try {
    const existingCall = await db.call.findUnique({
      where: { plivoCallUuid: callUuid },
    });

    const orgId = req.nextUrl.searchParams.get('orgId');
    if (existingCall && (!orgId || existingCall.organizationId === orgId)) await db.$transaction(async tx => {
      await lockAgency(tx, existingCall.organizationId);
      const current = await tx.call.findUniqueOrThrow({ where: { id: existingCall.id } });
      const terminal = ['completed', 'failed', 'busy', 'no-answer', 'timeout', 'canceled'].includes(callStatus);
      if (current.endedAt || (!terminal && ['completed', 'missed', 'failed', 'busy', 'no-answer', 'timeout', 'canceled'].includes(current.status))) return;
      const status = terminal ? inboundFinalStatus({ ...current, status: callStatus })
        : current.direction === 'inbound' && current.agentOutcome && current.agentOutcome !== 'answered' && callStatus === 'in-progress' ? 'ringing' : callStatus;
      await tx.call.update({ where: { id: current.id }, data: { status,
        ...(terminal ? { endedAt: new Date(), ...(current.direction === 'inbound' && status === 'missed' && current.agentOutcome && current.agentOutcome !== 'declined' ? { agentOutcome: 'missed' } : {}) } : {}) } });
      if (terminal) await releaseCallAgentInTransaction(tx, current);

      await tx.callEvent.create({
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
    });

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
