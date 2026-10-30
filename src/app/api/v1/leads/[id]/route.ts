import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { authenticateRequest, logAuditEvent } from '@/lib/api-auth';

export const runtime = 'nodejs';

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

    const updated = await db.lead.update({
      where: { id: lead.id },
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
    return NextResponse.json(
      { api_id: 'internal_err', error: err.message || 'Failed to update lead' },
      { status: 500 }
    );
  }
}
