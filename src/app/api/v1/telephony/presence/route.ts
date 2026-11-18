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
  const readiness = await db.$transaction(async tx => {
    await lockAgency(tx, auth!.organizationId);
    // A ready SDK with no active browser call can recover an unanswered ring whose
    // carrier callbacks were lost. Never clear a fresh reservation or an answered call.
    if (body.data.ready && !body.data.busy) {
      const expired = await tx.call.findMany({ where: { organizationId: auth!.organizationId, assignedToId: auth!.userId,
        direction: 'inbound', endedAt: null, status: 'ringing', agentAnsweredAt: null, agentOutcome: 'ringing',
        updatedAt: { lt: new Date(Date.now() - 90_000) } } });
      for (const call of expired) {
        await tx.call.update({ where: { id: call.id }, data: { status: 'missed', agentOutcome: 'missed',
          requestedParams: { ...callRoutingState(call.requestedParams), browserReservationExpiredAt: new Date().toISOString() } } });
        await tx.callEvent.create({ data: { organizationId: call.organizationId, callId: call.id,
          eventType: 'browser_ring_expired', status: 'missed', occurredAt: new Date(), payload: { reason: 'Browser is ready; unanswered ring exceeded 90 seconds without a completion callback' } } });
      }
    }
    const reserved = !body.data.busy && await tx.call.count({ where: { organizationId: auth!.organizationId, assignedToId: auth!.userId, endedAt: null, status: { in: ['ringing', 'in-progress'] }, startedAt: { gte: new Date(Date.now() - 2 * 60 * 60_000) } } });
    const member = await tx.membership.update({ where: { organizationId_userId: { organizationId: auth!.organizationId, userId: auth!.userId } },
      data: { voicePresenceAt: body.data.ready ? new Date() : null, voiceBusy: body.data.busy || !!reserved }, include: { user: { select: { status: true } } } });
    return phoneReadiness(member);
  });
  return NextResponse.json({ success: true, readiness }, { headers: { 'Cache-Control': 'no-store' } });
}
