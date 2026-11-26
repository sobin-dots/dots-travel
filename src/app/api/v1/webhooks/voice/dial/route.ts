import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { processIncomingWebhook } from '@/lib/webhook-helper';
import { recordInboundAnswer } from '@/lib/telephony/agent-routing';
import { lockAgency } from '@/lib/lead-intake/service';
import { parseDialBLegOutcome } from '@/lib/telephony/outbound-browser-call';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  return POST(req);
}

export async function POST(req: NextRequest) {
  const attempt = Number(req.nextUrl.searchParams.get('attempt') || '0');
  if (!Number.isSafeInteger(attempt) || attempt < 0) {
    return NextResponse.json({ error: 'Invalid call attempt' }, { status: 400 });
  }
  const result = await processIncomingWebhook(
    req,
    'voice',
    (p) => `${p.DialALegUUID || p.CallUUID}_dial_${attempt}_${p.DialAction}_${p.DialBLegUUID}`
  );
  if (!result.valid) return result.errorResponse!;
  if (result.isDuplicate) {
    return NextResponse.json({ success: true, duplicate: true });
  }

  const { params, webhookEventId } = result;
  const callUuid = params.DialALegUUID || params.CallUUID;
  const call = callUuid && (await db.call.findUnique({ where: { plivoCallUuid: callUuid } }));
  const orgId = req.nextUrl.searchParams.get('orgId');
  if (!call || (orgId && orgId !== call.organizationId)) {
    return NextResponse.json({ error: 'Call not found' }, { status: 404 });
  }

  const dialAction = String(params.DialAction || '').trim().toLowerCase();

  if (call.direction === 'outbound') {
    await db.$transaction(
      async (tx) => {
        await lockAgency(tx, call.organizationId);
        const current = await tx.call.findUnique({ where: { id: call.id } });
        if (!current) return;

        const existingParams =
          current.requestedParams &&
          typeof current.requestedParams === 'object' &&
          !Array.isArray(current.requestedParams)
            ? (current.requestedParams as Record<string, unknown>)
            : {};

        if (dialAction === 'answer' || dialAction === 'connected') {
          const answeredAt = current.answeredAt || new Date();
          const nextParams: Record<string, unknown> = {
            ...existingParams,
            ...(params.DialBLegUUID ? { bLegUuid: String(params.DialBLegUUID) } : {}),
            bLegAnsweredAt:
              typeof existingParams.bLegAnsweredAt === 'string'
                ? existingParams.bLegAnsweredAt
                : answeredAt.toISOString(),
            bLegStatus: String(params.DialBLegStatus || 'in-progress'),
          };
          await tx.call.update({
            where: { id: current.id },
            data: {
              status: current.endedAt ? 'completed' : 'in-progress',
              answeredAt,
              requestedParams: nextParams as Prisma.InputJsonValue,
            },
          });
          await tx.callEvent.create({
            data: {
              organizationId: current.organizationId,
              callId: current.id,
              eventType: 'dial_answer',
              status: current.endedAt ? 'completed' : 'in-progress',
              payload: params,
              occurredAt: new Date(),
              webhookEventId,
            },
          });
        } else if (dialAction === 'hangup') {
          const outcome = parseDialBLegOutcome(params, current.answeredAt);
          const nextParams: Record<string, unknown> = {
            ...existingParams,
            ...(params.DialBLegUUID ? { bLegUuid: String(params.DialBLegUUID) } : {}),
            ...(outcome.answered && !existingParams.bLegAnsweredAt
              ? { bLegAnsweredAt: (current.answeredAt || new Date()).toISOString() }
              : {}),
            bLegStatus: String(params.DialBLegStatus || outcome.status),
            ...(outcome.hangupCauseName ? { bLegHangupCause: outcome.hangupCauseName } : {}),
          };

          await tx.call.update({
            where: { id: current.id },
            data: {
              status: outcome.status,
              endedAt: current.endedAt || new Date(),
              ...(outcome.answered
                ? {
                    answeredAt: current.answeredAt || new Date(),
                    ...(outcome.durationSeconds !== undefined ? { durationSeconds: outcome.durationSeconds } : {}),
                  }
                : {
                    durationSeconds: 0,
                  }),
              ...(outcome.hangupCauseName && !current.hangupCauseName
                ? { hangupCauseName: outcome.hangupCauseName }
                : {}),
              requestedParams: nextParams as Prisma.InputJsonValue,
            },
          });
          await tx.callEvent.create({
            data: {
              organizationId: current.organizationId,
              callId: current.id,
              eventType: 'dial_hangup',
              status: outcome.status,
              payload: params,
              occurredAt: new Date(),
              webhookEventId,
            },
          });
        }
      },
      { timeout: 15_000 }
    );
  } else if (['answer', 'connected'].includes(dialAction)) {
    await recordInboundAnswer({ organizationId: call.organizationId, callUuid, attempt });
  } else if (
    dialAction === 'hangup' &&
    (String(params.DialBLegStatus).toLowerCase() === 'completed' ||
      Number(params.DialBLegDuration) > 0 ||
      call.agentAnsweredAt)
  ) {
    // The browser leg can end before the parent hangup/action callback arrives.
    const duration = String(params.DialBLegDuration ?? '');
    await recordInboundAnswer({
      organizationId: call.organizationId,
      callUuid,
      attempt,
      completed: true,
      durationSeconds: /^\d+$/.test(duration) ? Number(duration) : undefined,
    });
  }

  if (webhookEventId) {
    await db.webhookEvent.update({
      where: { id: webhookEventId },
      data: { status: 'processed', processedAt: new Date() },
    });
  }
  return NextResponse.json({ success: true });
}
