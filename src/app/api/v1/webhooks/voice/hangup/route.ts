import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { processIncomingWebhook } from '@/lib/webhook-helper';
import { inboundFinalStatus, releaseCallAgentInTransaction } from '@/lib/telephony/agent-routing';
import { lockAgency } from '@/lib/lead-intake/service';
import {
  createRecoveredHangupCallInTx,
  inferHangupTerminalStatus,
  resolveHangupOrganizationId,
} from '@/lib/telephony/plivo-call-sync';
import { resolveOutboundBrowserFinalStatus } from '@/lib/telephony/outbound-browser-call';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  return POST(req);
}

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

  const parsedDuration = params.Duration !== undefined && params.Duration !== '' ? Number(params.Duration) : NaN;
  const duration = Number.isFinite(parsedDuration) ? parsedDuration : undefined;
  const parsedBillDuration =
    params.BillDuration !== undefined && params.BillDuration !== '' ? Number(params.BillDuration) : NaN;
  const billDuration = Number.isFinite(parsedBillDuration) ? parsedBillDuration : undefined;
  const parsedTotalCost = params.TotalCost !== undefined && params.TotalCost !== '' ? Number(params.TotalCost) : NaN;
  const totalCost = Number.isFinite(parsedTotalCost) ? parsedTotalCost : undefined;
  const rawHangup = params.HangupCauseCode ?? params.HangupCause;
  const hangupCause =
    rawHangup !== undefined && /^\d+$/.test(String(rawHangup).trim())
      ? Number(String(rawHangup).trim())
      : undefined;
  const hangupCauseName =
    params.HangupCauseName ||
    (hangupCause === undefined && params.HangupCause ? String(params.HangupCause) : undefined) ||
    'Hangup';

  try {
    const orgId = req.nextUrl.searchParams.get('orgId');
    const existingLookup = await db.call.findUnique({
      where: { plivoCallUuid: callUuid },
      select: { organizationId: true },
    });
    const resolvedOrgId =
      existingLookup?.organizationId ||
      (await resolveHangupOrganizationId({ orgIdParam: orgId, params }));
    if (!resolvedOrgId || (orgId && resolvedOrgId !== orgId)) {
      return NextResponse.json({ status: 'ignored_unknown_call' });
    }
    let unknownRecovered = false;
    await db.$transaction(async tx => {
      await lockAgency(tx, resolvedOrgId);
      let existingCall = await tx.call.findUnique({ where: { plivoCallUuid: callUuid } });
      if (!existingCall) {
        existingCall = await createRecoveredHangupCallInTx(tx, {
          organizationId: resolvedOrgId,
          callUuid,
          params,
        });
      }
      if (!existingCall || (orgId && existingCall.organizationId !== orgId)) {
        unknownRecovered = true;
        return null;
      }
      const reqParams = existingCall.requestedParams as Record<string, unknown> | null;
      const isRecoveredFromHangup = Boolean(reqParams?.recoveredFromHangup);
      const isOutboundBrowserCall =
        existingCall.direction === 'outbound' && existingCall.requestedMode === 'browser';
      const hangupSource = params.HangupSource ? String(params.HangupSource) : undefined;
      const finalStatus = isRecoveredFromHangup
        ? inferHangupTerminalStatus({
            direction: existingCall.direction,
            durationSeconds: duration,
            billDurationSeconds: billDuration,
            hangupCauseCode: hangupCause,
            hangupCauseName,
          })
        : isOutboundBrowserCall
          ? resolveOutboundBrowserFinalStatus(existingCall, {
              hangupCauseCode: hangupCause,
              hangupCauseName,
              hangupSource,
            })
          : inboundFinalStatus(existingCall);
      const resolvedDuration =
        isOutboundBrowserCall && !existingCall.answeredAt
          ? 0
          : duration !== undefined
            ? duration
            : existingCall.durationSeconds;
      await tx.call.update({
        where: { id: existingCall.id },
        data: {
          status: finalStatus,
          ...(existingCall.direction === 'inbound' && existingCall.agentOutcome && finalStatus === 'missed' && existingCall.agentOutcome !== 'declined' ? { agentOutcome: 'missed' } : {}),
          endedAt: existingCall.endedAt || new Date(),
          durationSeconds: resolvedDuration,
          billDurationSeconds: billDuration !== undefined ? billDuration : existingCall.billDurationSeconds,
          totalCost: totalCost !== undefined ? totalCost : existingCall.totalCost,
          hangupCauseCode: hangupCause,
          hangupCauseName,
          ...(hangupSource ? { hangupSource } : {}),
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
    }, { timeout: 15_000 });
    if (unknownRecovered) {
      return NextResponse.json({ status: 'ignored_unknown_call' });
    }

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
