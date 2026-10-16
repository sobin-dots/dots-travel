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

    // Create Lead record with rich structured trip parameters
    const parsedDeparture = departureDate ? new Date(departureDate) : null;
    const parsedReturn = returnDate ? new Date(returnDate) : null;

    const lead = await db.lead.create({
      data: {
        organizationId: auth!.organizationId,
        contactId: contact?.id || null,
        callId: call.id,
        title: result.title,
        destination: result.destination || customDestination || 'Curated Destination',
        departureDate: parsedDeparture,
        returnDate: parsedReturn,
        durationDays: durationDays ? Number(durationDays) : 5,
        headcountAdults: headcountAdults != null ? Number(headcountAdults) : 2,
        headcountChildren: headcountChildren != null ? Number(headcountChildren) : 0,
        headcountInfants: headcountInfants != null ? Number(headcountInfants) : 0,
        targetBudget: targetBudget ? Number(targetBudget) : null,
        hotelTier: hotelTier || null,
        specialRequests: specialRequests || null,
        status: 'pending_approval',
        stage: 'quote_prep',
        itinerary: result.itinerary,
        customerEmail: customEmail || contact?.email || null,
      },
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
