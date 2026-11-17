import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-auth';
import { leadScope, managesLeads } from '@/lib/lead-access';
import { lockAgency, pickAssignee } from '@/lib/lead-intake/service';

export const runtime = 'nodejs';
const schema = z.object({
  temperature: z.enum(['hot', 'warm', 'cold']).optional(), tags: z.array(z.string().trim().min(1).max(50)).max(30).optional(),
  assignedToId: z.string().uuid().nullable().optional(), autoAssign: z.boolean().optional(),
  contacted: z.literal(true).optional(), nextFollowUpAt: z.string().datetime().nullable().optional(),
}).strict();

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { auth, errorResponse } = await authenticateRequest(req, 'operator'); if (errorResponse) return errorResponse;
  const { id } = await context.params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid lead details' }, { status: 400 });
  const input = parsed.data;
  if ((input.assignedToId !== undefined || input.autoAssign !== undefined) && !managesLeads(auth!)) return NextResponse.json({ error: 'Only admins can reassign leads' }, { status: 403 });
  try {
    const lead = await db.$transaction(async tx => {
      await lockAgency(tx, auth!.organizationId);
      const existing = await tx.lead.findFirst({ where: { id, ...leadScope(auth!) } });
      if (!existing) throw new Error('not_found');
      let assignedToId = input.assignedToId;
      if (input.autoAssign) assignedToId = await pickAssignee(tx, auth!.organizationId);
      if (assignedToId && !await tx.membership.findFirst({ where: { organizationId: auth!.organizationId, userId: assignedToId, role: { in: ['owner', 'admin', 'operator', 'sales'] }, user: { status: 'active' } } })) throw new Error('invalid_assignee');
      const updated = await tx.lead.update({ where: { id }, data: {
        temperature: input.temperature, tags: input.tags ? [...new Set(input.tags)] : undefined,
        ...(assignedToId !== undefined ? { assignedToId, assignedAt: assignedToId ? new Date() : null } : {}),
        ...(input.contacted && !existing.firstContactAt ? { firstContactAt: new Date() } : {}),
        nextFollowUpAt: input.nextFollowUpAt === undefined ? undefined : input.nextFollowUpAt ? new Date(input.nextFollowUpAt) : null,
      } });
      await tx.auditLog.create({ data: { organizationId: auth!.organizationId, actorUserId: auth!.userId, action: 'lead.qualify', targetType: 'Lead', targetId: id, metadata: { ...input, previousAssignee: existing.assignedToId } } });
      return updated;
    });
    return NextResponse.json({ lead });
  } catch (e) {
    if (e instanceof Error && ['not_found', 'invalid_assignee'].includes(e.message)) return NextResponse.json({ error: e.message }, { status: e.message === 'not_found' ? 404 : 400 });
    throw e;
  }
}
