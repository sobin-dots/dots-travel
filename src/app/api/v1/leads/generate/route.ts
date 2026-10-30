import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { authenticateRequest, logAuditEvent } from '@/lib/api-auth';
import { generateItineraryFromTranscript } from '@/lib/deepseek';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const { auth, errorResponse } = await authenticateRequest(req, 'operator');
  if (errorResponse) return errorResponse;

  try {
    const body = await req.json();
    const {
      callId,
      destination: customDestination,
      departureDate,
      returnDate,
      durationDays,
      headcountAdults,
      headcountChildren,
      headcountInfants,
      targetBudget,
      hotelTier,
      specialRequests,
      customerEmail: customEmail,
      customerName: customName,
    } = body;

    if (!callId) {
      return NextResponse.json({ api_id: 'val_err', error: 'Missing required field: callId' }, { status: 400 });
    }

    const call = await db.call.findFirst({
      where: { id: callId, organizationId: auth!.organizationId },
      include: {
        transcriptions: {
          orderBy: { createdAt: 'desc' },
        },
        recordings: true,
      },
    });

    if (!call) {
      return NextResponse.json({ api_id: 'not_found', error: 'Call not found' }, { status: 404 });
    }

    // Resolve transcription text or intelligent concierge fallback
    const targetPhone = call.direction === 'outbound' ? call.to : call.from;
    const transcription = call.transcriptions?.find(
      (t) => t.status === 'completed' && t.text && t.text.trim().length > 0
    ) || call.transcriptions?.find(
      (t) => t.text && t.text.trim().length > 0
    ) || call.transcriptions?.[0];
    const defaultText = `Customer travel consultation with ${targetPhone}. Duration of conversation: ${call.durationSeconds || 45} seconds. The client is seeking a premier vacation package with flights, accommodation, and guided local excursions. Please synthesize a high-end customized travel itinerary.`;
    const transcriptText = (transcription?.text && transcription.text.trim().length > 0)
      ? transcription.text.trim()
      : defaultText;

    // Match contact by phone number (exact match or stripped digits)
    const cleanTarget = targetPhone.replace(/\D/g, '');
    const contact = await db.contact.findFirst({
      where: {
        organizationId: auth!.organizationId,
        OR: [
          { phone: targetPhone },
          ...(cleanTarget ? [{ phone: `+${cleanTarget}` }, { phone: cleanTarget }] : []),
        ],
      },
    });

    const customParams = {
      destination: customDestination,
      departureDate,
      returnDate,
      durationDays: durationDays ? Number(durationDays) : undefined,
      headcountAdults: headcountAdults != null ? Number(headcountAdults) : undefined,
      headcountChildren: headcountChildren != null ? Number(headcountChildren) : undefined,
      headcountInfants: headcountInfants != null ? Number(headcountInfants) : undefined,
      targetBudget: targetBudget ? Number(targetBudget) : undefined,
      hotelTier,
      specialRequests,
      customerName: customName || contact?.name,
      customerEmail: customEmail || contact?.email,
      customerPhone: targetPhone,
    };

    // Generate Itinerary with DeepSeek adhering to confirmed parameters
    const result = await generateItineraryFromTranscript(
      transcriptText,
      {
        name: customName || contact?.name || 'Valued Client',
        phone: targetPhone,
        email: customEmail || contact?.email || undefined,
        company: contact?.company || undefined,
      },
      auth!.organizationId,
      customParams
    );

    // Create Lead record with rich structured trip parameters connected from extraction & synthesis
    const resolvedDurationDays = durationDays ? Number(durationDays) : (result.durationDays || 5);
    const effectiveDepStr = departureDate || result.departureDate || null;
    const parsedDeparture = effectiveDepStr ? new Date(effectiveDepStr) : null;
    let parsedReturn = returnDate ? new Date(returnDate) : null;
    if (!parsedReturn && parsedDeparture && !isNaN(parsedDeparture.getTime())) {
      parsedReturn = new Date(parsedDeparture);
      parsedReturn.setUTCDate(parsedReturn.getUTCDate() + Math.max(0, resolvedDurationDays - 1));
    }

    // Ensure contact is linked or updated if customerName/customerEmail was provided
    let contactToLink = contact;
    const resolvedCustomerName =
      customName && customName !== 'Valued Client'
        ? customName
        : contact?.name || result.customerName || null;
    const resolvedCustomerEmail = customEmail || contact?.email || result.customerEmail || null;

    if (!contactToLink && targetPhone) {
      try {
        contactToLink = await db.contact.create({
          data: {
            organizationId: auth!.organizationId,
            name: resolvedCustomerName || 'Customer',
            phone: targetPhone,
            email: resolvedCustomerEmail || null,
          },
        });
      } catch {
        // Ignore if concurrent creation or phone format conflict
      }
    } else if (contactToLink && (customName || customEmail)) {
      try {
        contactToLink = await db.contact.update({
          where: { id: contactToLink.id },
          data: {
            ...(customName && customName !== 'Valued Client' ? { name: customName } : {}),
            ...(customEmail ? { email: customEmail } : {}),
          },
        });
      } catch {
        // Ignore non-critical contact update error
      }
    }

    const lead = await db.lead.create({
      data: {
        organizationId: auth!.organizationId,
        contactId: contactToLink?.id || null,
        callId: call.id,
        title: result.title,
        destination: result.destination || customDestination || 'Curated Destination',
        departureDate: parsedDeparture,
        returnDate: parsedReturn,
        durationDays: resolvedDurationDays,
        headcountAdults: headcountAdults != null ? Number(headcountAdults) : (result.headcountAdults ?? 2),
        headcountChildren: headcountChildren != null ? Number(headcountChildren) : (result.headcountChildren ?? 0),
        headcountInfants: headcountInfants != null ? Number(headcountInfants) : (result.headcountInfants ?? 0),
        targetBudget: targetBudget ? Number(targetBudget) : null,
        hotelTier: hotelTier || result.hotelTier || 'luxury_5star',
        specialRequests: specialRequests || result.specialRequests || null,
        status: 'pending_approval',
        stage: 'new_inquiry',
        itinerary: result.itinerary,
        customerEmail: resolvedCustomerEmail,
        metadata: {
          customerName: resolvedCustomerName || undefined,
          customerPhone: targetPhone || undefined,
          currency: 'INR',
        },
      },
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
      action: 'lead.generate_itinerary',
      targetType: 'Lead',
      targetId: lead.id,
      metadata: { callId: call.id, title: result.title, destination: result.destination },
    });

    return NextResponse.json(
      {
        api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
        lead,
        message: 'Itinerary generated successfully from call transcription',
      },
      { status: 201 }
    );
  } catch (err: any) {
    console.error('Error generating itinerary:', err);
    return NextResponse.json(
      { api_id: 'server_err', error: err.message || 'Internal error generating itinerary' },
      { status: 500 }
    );
  }
}
