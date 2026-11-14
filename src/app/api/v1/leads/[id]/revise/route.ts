import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { authenticateRequest, logAuditEvent } from '@/lib/api-auth';
import { reviseItineraryWithDeepSeek } from '@/lib/deepseek';

import { ItineraryError, parseItineraryDays, assertItineraryReady } from '@/lib/itinerary-content';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { auth, errorResponse } = await authenticateRequest(req, 'operator');
  if (errorResponse) return errorResponse;

  const { id } = await params;
  const lead = await db.lead.findFirst({
    where: { id, organizationId: auth!.organizationId },
    include: {
      contact: true,
      call: {
        include: {
          recordings: true,
          transcriptions: true,
        },
      },
    },
  });

  if (!lead) {
    return NextResponse.json({ api_id: 'not_found', error: 'Lead not found' }, { status: 404 });
  }

  try {
    const body = await req.json();
    const notes = body.correctionNotes || body.revisionNotes;

    if (typeof notes !== 'string' || !notes.trim()) {
      return NextResponse.json(
        { api_id: 'val_err', error: 'Please enter revision or correction notes' },
        { status: 400 }
      );
    }

    if ((lead.metadata as any)?.itineraryNeedsRegeneration) throw new ItineraryError('Regenerate the itinerary using the updated trip parameters before revising it.');
    const revisedItinerary = await reviseItineraryWithDeepSeek(lead.itinerary, notes, auth!.organizationId);

    // Use the shared day parser, including plain/bold headings and single-day revisions.
    const detectedDays = parseItineraryDays(revisedItinerary).length;
    assertItineraryReady(revisedItinerary, detectedDays);

    const reviseData: any = {
      itinerary: revisedItinerary,
      revisionNotes: lead.revisionNotes
        ? `${lead.revisionNotes}\n---\n${notes}`
        : notes,
    };

    if (detectedDays && detectedDays >= 1 && detectedDays <= 60 && detectedDays !== lead.durationDays) {
      reviseData.durationDays = detectedDays;
      if (lead.title && /\b\d+-Day\b/i.test(lead.title)) {
        reviseData.title = lead.title.replace(/\b\d+-Day\b/i, `${detectedDays}-Day`);
      }
      if (lead.departureDate) {
        const ret = new Date(lead.departureDate);
        ret.setUTCDate(ret.getUTCDate() + Math.max(0, detectedDays - 1));
        reviseData.returnDate = ret;
      }
    }

    const updated = await db.lead.update({
      where: { id: lead.id, updatedAt: lead.updatedAt },
      data: reviseData,
      include: {
        contact: true,
        supplier: true,
        quotations: {
          orderBy: { version: 'desc' },
        },
        supplierQuotations: {
          include: { supplier: true },
          orderBy: { createdAt: 'desc' },
        },
        call: {
          include: {
            recordings: true,
            transcriptions: true,
          },
        },
      },
    });

    await logAuditEvent({
      organizationId: auth!.organizationId,
      actorUserId: auth!.userId,
      action: 'lead.revise_itinerary',
      targetType: 'Lead',
      targetId: lead.id,
      metadata: { notes },
    });

    return NextResponse.json({
      api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
      lead: updated,
      itinerary: updated.itinerary,
      revisionNotes: updated.revisionNotes,
      message: 'Itinerary revised successfully',
    });
  } catch (err: any) {
    if (err?.code === 'P2025') return NextResponse.json({ error: 'This lead changed while the itinerary was being revised. Reload it and retry.' }, { status: 409 });
    console.error('Error revising itinerary:', err);
    return NextResponse.json(
      { api_id: err instanceof ItineraryError ? err.code : 'server_err', error: err.message || 'Internal error revising itinerary' },
      { status: err instanceof ItineraryError ? err.status : 500 }
    );
  }
}
