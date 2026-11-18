import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-auth';
import { leadScope } from '@/lib/lead-access';
import { assertItineraryReady, ItineraryError, leadItineraryIssue } from '@/lib/itinerary-content';
import { generateBudgetItineraryOption } from '@/lib/deepseek';

export const runtime = 'nodejs';
export const maxDuration = 300;
type Context = { params: Promise<{ id: string }> };
export async function GET(req: NextRequest, context: Context) {
  const { auth, errorResponse } = await authenticateRequest(req, 'operator'); if (errorResponse) return errorResponse;
  const { id } = await context.params;
  const lead = await db.lead.findFirst({ where: { id, ...leadScope(auth!) } });
  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
  const options = await db.itineraryOption.findMany({ where: { leadId: id, organizationId: auth!.organizationId }, orderBy: { createdAt: 'asc' } });
  return NextResponse.json({ options: options.map(o => ({ ...o, budget: o.budget == null ? null : Number(o.budget) })) });
}
const createSchema = z.object({
  expectedUpdatedAt: z.string().datetime(), currency: z.string().regex(/^[A-Z]{3}$/),
  instructions: z.string().trim().max(5000).default(''),
  options: z.array(z.object({ label: z.string().trim().min(1).max(100), budget: z.number().positive().max(9999999999).multipleOf(0.01) })).min(1).max(3),
});
export async function POST(req: NextRequest, context: Context) {
  const { auth, errorResponse } = await authenticateRequest(req, 'operator'); if (errorResponse) return errorResponse;
  const { id } = await context.params;
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid budget options' }, { status: 400 });
  const lead = await db.lead.findFirst({ where: { id, ...leadScope(auth!) }, include: { call: { include: { transcriptions: { where: { status: 'completed' }, orderBy: { createdAt: 'desc' }, take: 1 } } } } });
  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
  if (lead.updatedAt.toISOString() !== parsed.data.expectedUpdatedAt) return NextResponse.json({ error: 'The itinerary changed. Reopen it before creating alternatives.' }, { status: 409 });
  const issue = leadItineraryIssue(lead); if (issue) return NextResponse.json({ error: issue }, { status: 422 });
  if (!lead.destination || !lead.durationDays) return NextResponse.json({ error: 'Confirm the destination and duration first' }, { status: 422 });
  try {
    const generated = await Promise.allSettled(parsed.data.options.map(async option => {
      const itinerary = await generateBudgetItineraryOption({ organizationId: auth!.organizationId, itinerary: lead.itinerary, destination: lead.destination!, durationDays: lead.durationDays!,
        budget: option.budget, currency: parsed.data.currency, instructions: parsed.data.instructions, transcript: lead.call?.transcriptions[0]?.text || undefined });
      assertItineraryReady(itinerary, lead.durationDays);
      return { ...option, itinerary };
    }));
    const results: { label: string; budget: number; itinerary: string }[] = [];
    for (const result of generated) { if (result.status === 'rejected') throw result.reason; results.push(result.value); }
    const saved = await db.$transaction(async tx => {
      // Lock the lead and recheck after AI generation; never attach options to a changed trip.
      const claimed = await tx.lead.updateMany({ where: { id, ...leadScope(auth!), updatedAt: lead.updatedAt }, data: { updatedAt: new Date() } });
      if (!claimed.count) throw new ItineraryError('The trip changed while alternatives were being created. Reload and retry.', 409);
      const options = [];
      for (const result of results) options.push(await tx.itineraryOption.create({ data: { ...result, organizationId: auth!.organizationId, leadId: id, currency: parsed.data.currency,
        destination: lead.destination!, durationDays: lead.durationDays!, departureDate: lead.departureDate, revisionNotes: parsed.data.instructions } }));
      await tx.auditLog.create({ data: { organizationId: auth!.organizationId, actorUserId: auth!.userId, action: 'itinerary.options.create', targetType: 'Lead', targetId: id, metadata: { optionIds: options.map(o => o.id) } } });
      return { options, lead: await tx.lead.findUniqueOrThrow({ where: { id } }) };
    });
    return NextResponse.json(saved, { status: 201 });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not generate alternatives' }, { status: e instanceof ItineraryError ? e.status : 502 }); }
}
