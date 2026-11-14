import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { authenticateRequest, logAuditEvent } from '@/lib/api-auth';

import { generateItineraryFromTranscript } from '@/lib/deepseek';
import { assertTripInput, assertItineraryReady, ItineraryError } from '@/lib/itinerary-content';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(
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

  if (!lead) {
    return NextResponse.json({ api_id: 'not_found', error: 'Lead not found' }, { status: 404 });
  }

  return NextResponse.json({
    api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
    lead,
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { auth, errorResponse } = await authenticateRequest(req, 'operator');
  if (errorResponse) return errorResponse;

  const { id } = await params;
  const lead = await db.lead.findFirst({
    where: { id, organizationId: auth!.organizationId },
  });

  if (!lead) {
    return NextResponse.json({ api_id: 'not_found', error: 'Lead not found' }, { status: 404 });
  }

  try {
    const body = await req.json();
    assertTripInput(body);
    const {
      status,
      customerEmail,
      title,
      selectedSupplierId,
      targetBudget,
      departureDate,
      returnDate,
      durationDays,
      destination,
      headcountAdults,
      headcountChildren,
      hotelTier,
      itinerary,
      specialRequests,
      currency,
    } = body;

    const dataToUpdate: any = {};
    if (status !== undefined) dataToUpdate.status = status;
    if (customerEmail !== undefined) dataToUpdate.customerEmail = customerEmail;
    if (title !== undefined) dataToUpdate.title = title;
    if (selectedSupplierId !== undefined) dataToUpdate.selectedSupplierId = selectedSupplierId || null;
    if (destination !== undefined) dataToUpdate.destination = destination;
    if (hotelTier !== undefined) dataToUpdate.hotelTier = hotelTier;
    if (itinerary !== undefined) dataToUpdate.itinerary = itinerary;
    if (specialRequests !== undefined) dataToUpdate.specialRequests = specialRequests;

    if (targetBudget !== undefined) {
      dataToUpdate.targetBudget =
        targetBudget === null || targetBudget === '' ? null : Number(targetBudget);
    }
    if (departureDate !== undefined) {
      dataToUpdate.departureDate = departureDate ? new Date(departureDate) : null;
    }
    if (returnDate !== undefined) {
      dataToUpdate.returnDate = returnDate ? new Date(returnDate) : null;
    }
    if (durationDays !== undefined && durationDays !== null && durationDays !== '') {
      const parsedDuration = Math.max(1, parseInt(String(durationDays), 10));
      dataToUpdate.durationDays = parsedDuration;
      // Keep title day-count synchronized if title was not explicitly overridden
      if (title === undefined && lead.title && /\b\d+-Day\b/i.test(lead.title)) {
        dataToUpdate.title = lead.title.replace(/\b\d+-Day\b/i, `${parsedDuration}-Day`);
      }
    }
    // Auto-calculate returnDate if departureDate or durationDays changed (or returnDate is missing) and returnDate was not explicitly passed
    const effectiveDep = dataToUpdate.departureDate !== undefined ? dataToUpdate.departureDate : lead.departureDate;
    const effectiveDur = dataToUpdate.durationDays !== undefined ? dataToUpdate.durationDays : lead.durationDays;
    if (
      effectiveDep &&
      effectiveDur &&
      dataToUpdate.returnDate === undefined &&
      (!lead.returnDate || dataToUpdate.durationDays !== undefined || dataToUpdate.departureDate !== undefined)
    ) {
      const ret = new Date(effectiveDep);
      ret.setUTCDate(ret.getUTCDate() + Math.max(0, Number(effectiveDur) - 1));
      dataToUpdate.returnDate = ret;
    }
    if (headcountAdults !== undefined && headcountAdults !== null && headcountAdults !== '') {
      dataToUpdate.headcountAdults = parseInt(String(headcountAdults), 10);
    }
    if (headcountChildren !== undefined && headcountChildren !== null && headcountChildren !== '') {
      dataToUpdate.headcountChildren = parseInt(String(headcountChildren), 10);
    }
    if (currency !== undefined) {
      const existingMeta = (lead.metadata as Record<string, any>) || {};
      dataToUpdate.metadata = { ...existingMeta, currency };
    }

    const tripFields = ['destination', 'durationDays', 'departureDate', 'returnDate', 'headcountAdults', 'headcountChildren', 'hotelTier', 'specialRequests'];
    const comparable = (value: any) => value instanceof Date ? value.toISOString().slice(0, 10) : (value ?? '');
    const tripChanged = tripFields.some(field => dataToUpdate[field] !== undefined && comparable(dataToUpdate[field]) !== comparable((lead as any)[field]));
    const metadata = { ...((lead.metadata as Record<string, any>) || {}), ...(dataToUpdate.metadata || {}) };
    if (body.regenerateItinerary === true) {
      const params = { ...lead, ...dataToUpdate };
      assertTripInput({ ...params, departureDate: params.departureDate?.toISOString().slice(0, 10), returnDate: params.returnDate?.toISOString().slice(0, 10) });
      const call = lead.callId ? await db.call.findFirst({
        where: { id: lead.callId, organizationId: auth!.organizationId },
        include: { transcriptions: { where: { status: 'completed' }, orderBy: { createdAt: 'desc' } } },
      }) : null;
      const result = await generateItineraryFromTranscript(
        call?.transcriptions.find(t => t.text?.trim())?.text || '',
        { name: metadata.customerName, email: params.customerEmail || undefined },
        auth!.organizationId,
        {
          destination: params.destination || undefined,
          durationDays: params.durationDays || undefined,
          departureDate: params.departureDate?.toISOString().slice(0, 10),
          returnDate: params.returnDate?.toISOString().slice(0, 10),
          headcountAdults: params.headcountAdults,
          headcountChildren: params.headcountChildren,
          headcountInfants: params.headcountInfants,
          hotelTier: params.hotelTier || undefined,
          specialRequests: params.specialRequests || undefined,
          targetBudget: params.targetBudget != null ? Number(params.targetBudget) : undefined,
        }
      );
      assertItineraryReady(result.itinerary, params.durationDays);
      dataToUpdate.itinerary = result.itinerary;
      dataToUpdate.title = result.title;
      metadata.itineraryNeedsRegeneration = false;
    } else if (itinerary !== undefined) {
      assertItineraryReady(itinerary, dataToUpdate.durationDays ?? lead.durationDays);
      metadata.itineraryNeedsRegeneration = false;
    } else if (tripChanged) {
      metadata.itineraryNeedsRegeneration = true;
    }
    dataToUpdate.metadata = metadata;

    const updated = await db.lead.update({
      where: { id: lead.id, updatedAt: lead.updatedAt },
      data: dataToUpdate,
      include: {
        contact: true,
        supplier: true,
        organization: true,
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
      action: 'lead.update',
      targetType: 'Lead',
      targetId: lead.id,
      metadata: { previousStatus: lead.status, newStatus: status, changes: body },
    });

    return NextResponse.json({
      api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
      success: true,
      lead: updated,
    });
  } catch (err: any) {
    if (err?.code === 'P2025') return NextResponse.json({ error: 'This lead changed while the itinerary was being generated. Reload it and retry.' }, { status: 409 });
    return NextResponse.json(
      { api_id: err instanceof ItineraryError ? err.code : 'internal_err', error: err.message || 'Failed to update lead' },
      { status: err instanceof ItineraryError ? err.status : 500 }
    );
  }
}
