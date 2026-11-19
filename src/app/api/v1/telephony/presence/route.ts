import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-auth';
import { lockAgency } from '@/lib/lead-intake/service';
import { callRoutingState } from '@/lib/telephony/agent-routing';
import { phoneReadiness } from '@/lib/telephony/phone-readiness';

export async function POST(req: NextRequest) {
  const { auth, errorResponse } = await authenticateRequest(req, 'operator'); if (errorResponse) return errorResponse;
  const body = z.object({ ready: z.boolean(), busy: z.boolean() }).safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: 'Invalid phone presence' }, { status: 400 });

  // Only acquire the organization-wide lock when this browser actually has a >90s stale ring to expire.
  const expiredCandidate = body.data.ready && !body.data.busy
    ? await db.call.findFirst({
        where: {
          organizationId: auth!.organizationId,
          assignedToId: auth!.userId,
          direction: 'inbound',
          endedAt: null,
          status: 'ringing',
          agentAnsweredAt: null,
          agentOutcome: 'ringing',
          updatedAt: { lt: new Date(Date.now() - 90_000) },
        },
        select: { id: true },
      })
    : null;

  const readiness = await db.$transaction(async tx => {
    if (expiredCandidate) {
      await lockAgency(tx, auth!.organizationId);
      // A ready SDK with no active browser call can recover an unanswered ring whose
      // carrier callbacks were lost. Never clear a fresh reservation or an answered call.
      const expired = await tx.call.findMany({
        where: {
          organizationId: auth!.organizationId,
          assignedToId: auth!.userId,
          direction: 'inbound',
          endedAt: null,
          status: 'ringing',
          agentAnsweredAt: null,
          agentOutcome: 'ringing',
          updatedAt: { lt: new Date(Date.now() - 90_000) },
        },
      });
      for (const call of expired) {
        await tx.call.update({
          where: { id: call.id },
          data: {
            status: 'missed',
            agentOutcome: 'missed',
            requestedParams: { ...callRoutingState(call.requestedParams), browserReservationExpiredAt: new Date().toISOString() },
          },
        });
        await tx.callEvent.create({
          data: {
            organizationId: call.organizationId,
            callId: call.id,
            eventType: 'browser_ring_expired',
            status: 'missed',
            occurredAt: new Date(),
            payload: { reason: 'Browser is ready; unanswered ring exceeded 90 seconds without a completion callback' },
          },
        });
      }
    } else {
      // Lock only this user's membership row so concurrent staff heartbeats and inbound call routing never queue behind one another.
      await tx.$queryRaw`SELECT id FROM memberships WHERE "organizationId" = ${auth!.organizationId} AND "userId" = ${auth!.userId} FOR NO KEY UPDATE`;
    }
    const reserved = !body.data.busy && await tx.call.count({
      where: {
        organizationId: auth!.organizationId,
        assignedToId: auth!.userId,
        endedAt: null,
        status: { in: ['ringing', 'in-progress'] },
        startedAt: { gte: new Date(Date.now() - 2 * 60 * 60_000) },
      },
    });
    const member = await tx.membership.update({
      where: { organizationId_userId: { organizationId: auth!.organizationId, userId: auth!.userId } },
      data: { voicePresenceAt: body.data.ready ? new Date() : null, voiceBusy: body.data.busy || !!reserved },
      include: { user: { select: { status: true } } },
    });
    return phoneReadiness(member);
  }, { timeout: 15_000 });
  return NextResponse.json({ success: true, readiness }, { headers: { 'Cache-Control': 'no-store' } });
}
