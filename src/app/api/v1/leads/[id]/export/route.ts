import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-auth';
import { leadScope } from '@/lib/lead-access';
import { assertItineraryReady, leadItineraryIssue } from '@/lib/itinerary-content';
import { itineraryWordDocument, comparisonPdf } from '@/lib/itinerary-documents';
import type { ComparisonOption } from '@/lib/itinerary-comparison';

export const runtime = 'nodejs';
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { auth, errorResponse } = await authenticateRequest(req, 'operator'); if (errorResponse) return errorResponse;
  const { id } = await context.params;
  const lead = await db.lead.findFirst({ where: { id, ...leadScope(auth!) }, include: { organization: true } });
  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
  const comparison = req.nextUrl.searchParams.get('layout') === 'comparison';
  const format = req.nextUrl.searchParams.get('format') || 'docx';
  if (!['pdf', 'docx'].includes(format)) return NextResponse.json({ error: 'Choose PDF or Word format' }, { status: 400 });
  const issue = leadItineraryIssue(lead); if (issue) return NextResponse.json({ error: issue }, { status: 422 });
  if (!comparison && format === 'pdf') {
    const url = new URL(req.url); url.pathname = `/api/v1/leads/${id}/pdf`; url.searchParams.delete('format'); url.searchParams.delete('layout');
    return NextResponse.redirect(url);
  }
  const options: ComparisonOption[] = [{ id: 'current', label: 'Current itinerary', budget: lead.targetBudget == null ? null : Number(lead.targetBudget), currency: String((lead.metadata as Record<string, unknown>)?.currency || 'INR'), itinerary: lead.itinerary,
    destination: lead.destination || '', durationDays: lead.durationDays!, departureDate: lead.departureDate }];
  if (comparison) {
    const alternatives = await db.itineraryOption.findMany({ where: { organizationId: auth!.organizationId, leadId: id }, orderBy: { createdAt: 'asc' } });
    options.push(...alternatives.map(o => ({ ...o, budget: o.budget == null ? null : Number(o.budget) })));
  }
  try {
    for (const option of options) assertItineraryReady(option.itinerary, option.durationDays);
    const title = comparison ? `${lead.title} — Budget comparison` : lead.title;
    const bytes = format === 'docx' ? await itineraryWordDocument(title, lead.organization.name, options, comparison) : await comparisonPdf(title, lead.organization.name, options);
    return new NextResponse(Buffer.from(bytes), { headers: {
      'Content-Type': format === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/pdf',
      'Content-Disposition': `attachment; filename="${lead.title.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80)}${comparison ? '_comparison' : ''}.${format}"`,
      'Cache-Control': 'private, no-store',
    } });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Export failed' }, { status: 422 }); }
}
