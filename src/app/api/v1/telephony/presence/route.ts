import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-auth';
import { lockAgency } from '@/lib/lead-intake/service';

export async function POST(req: NextRequest) {
  const { auth, errorResponse } = await authenticateRequest(req, 'operator'); if (errorResponse) return errorResponse;
  const body = z.object({ ready: z.boolean(), busy: z.boolean() }).safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: 'Invalid phone presence' }, { status: 400 });
  await db.$transaction(async tx => {
    await lockAgency(tx, auth!.organizationId);
    const reserved = !body.data.busy && await tx.call.count({ where: { organizationId: auth!.organizationId, assignedToId: auth!.userId, endedAt: null, status: { in: ['ringing', 'in-progress'] }, startedAt: { gte: new Date(Date.now() - 2 * 60 * 60_000) } } });
    await tx.membership.update({ where: { organizationId_userId: { organizationId: auth!.organizationId, userId: auth!.userId } }, data: { voicePresenceAt: body.data.ready ? new Date() : null, voiceBusy: body.data.busy || !!reserved } });
  });
  return NextResponse.json({ success: true });
}
