import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-auth';
import { leadScope } from '@/lib/lead-access';
import { assertItineraryReady, ItineraryError, leadItineraryIssue } from '@/lib/itinerary-content';
import { reviseItineraryWithDeepSeek } from '@/lib/deepseek';

export const runtime = 'nodejs';
export const maxDuration = 300;
const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('revise'), expectedUpdatedAt: z.string().datetime(), notes: z.string().trim().min(1).max(5000) }),
  z.object({ action: z.literal('edit'), expectedUpdatedAt: z.string().datetime(), itinerary: z.string().min(1).max(200000) }),
  z.object({ action: z.literal('apply'), expectedUpdatedAt: z.string().datetime(), expectedLeadUpdatedAt: z.string().datetime() }),
]);
export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string; optionId: string }> }) {
  const { auth, errorResponse } = await authenticateRequest(req, 'operator'); if (errorResponse) return errorResponse;
  const { id, optionId } = await context.params;
  const parsed = schema.safeParse(await req.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: 'Invalid option request' }, { status: 400 });
  const lead = await db.lead.findFirst({ where: { id, ...leadScope(auth!) } });
  const option = lead && await db.itineraryOption.findFirst({ where: { id: optionId, leadId: id, organizationId: auth!.organizationId } });
  if (!lead || !option) return NextResponse.json({ error: 'Itinerary option not found' }, { status: 404 });
  if (option.updatedAt.toISOString() !== parsed.data.expectedUpdatedAt) return NextResponse.json({ error: 'This option changed. Reload before saving.' }, { status: 409 });
  try {
    const input = parsed.data;
    if (input.action === 'apply') {
      if (lead.updatedAt.toISOString() !== input.expectedLeadUpdatedAt || leadItineraryIssue(lead) || option.destination !== lead.destination || option.durationDays !== lead.durationDays || option.departureDate?.toISOString() !== lead.departureDate?.toISOString()) throw new ItineraryError('The trip has changed. Regenerate matching options before selecting one.', 409);
      const updated = await db.$transaction(async tx => {
        await tx.itineraryOption.update({ where: { id: option.id, updatedAt: option.updatedAt }, data: { updatedAt: new Date() } });
        // Preserve the programme being replaced as another option.
        await tx.itineraryOption.create({ data: { organizationId: auth!.organizationId, leadId: id, label: 'Previous main itinerary', budget: lead.targetBudget,
          currency: String((lead.metadata as Record<string, unknown>)?.currency || 'INR'), itinerary: lead.itinerary, durationDays: lead.durationDays!, destination: lead.destination!, departureDate: lead.departureDate } });
        const saved = await tx.lead.update({ where: { id, updatedAt: lead.updatedAt }, data: { itinerary: option.itinerary, targetBudget: option.budget,
          metadata: { ...((lead.metadata as Record<string, unknown>) || {}), currency: option.currency, itineraryNeedsRegeneration: false } } });
        await tx.auditLog.create({ data: { organizationId: auth!.organizationId, actorUserId: auth!.userId, action: 'itinerary.option.apply', targetType: 'Lead', targetId: id, metadata: { optionId } } });
        return saved;
      });
      return NextResponse.json({ lead: updated });
    }
    const itinerary = input.action === 'edit' ? input.itinerary : await reviseItineraryWithDeepSeek(option.itinerary, input.notes, auth!.organizationId, option.durationDays);
    assertItineraryReady(itinerary, option.durationDays);
    const saved = await db.$transaction(async tx => {
      const updated = await tx.itineraryOption.update({ where: { id: option.id, updatedAt: option.updatedAt }, data: { itinerary, ...(input.action === 'revise' ? { revisionNotes: input.notes } : {}) } });
      await tx.auditLog.create({ data: { organizationId: auth!.organizationId, actorUserId: auth!.userId, action: `itinerary.option.${input.action}`, targetType: 'ItineraryOption', targetId: option.id } });
      return updated;
    });
    return NextResponse.json({ option: saved });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not update option' }, { status: (e as { code?: string })?.code === 'P2025' ? 409 : e instanceof ItineraryError ? e.status : 502 }); }
}
