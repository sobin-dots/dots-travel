import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { authenticateRequest, logAuditEvent } from '@/lib/api-auth';
import { generateItineraryFromTranscript } from '@/lib/deepseek';

import { ItineraryError, assertTripInput, assertItineraryReady } from '@/lib/itinerary-content';

export const runtime = 'nodejs';
export const maxDuration = 300;

const inFlightLeadGenerationByKey = new Map<string, { signature: string; promise: Promise<any> }>();

export async function POST(req: NextRequest) {
  const { auth, errorResponse } = await authenticateRequest(req, 'operator');
  if (errorResponse) return errorResponse;

  try {
    const body = await req.json();
    assertTripInput(body);
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

    const dedupeKey = `${auth!.organizationId}:${callId}`;
    const signature = JSON.stringify(Object.fromEntries(Object.entries(body).sort(([a], [b]) => a.localeCompare(b))));
    const existingInFlight = inFlightLeadGenerationByKey.get(dedupeKey);
    if (existingInFlight) {
      if (existingInFlight.signature !== signature) return NextResponse.json({ error: 'An itinerary is already being generated for this call. Wait for it to finish before changing the parameters.' }, { status: 409 });
      const lead = await existingInFlight.promise;
      return NextResponse.json(
        {
          api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
          lead,
          message: 'Itinerary generated successfully from call transcription',
        },
        { status: 201 }
      );
    }

    const generateAndPersistLead = async () => {
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
        throw new ItineraryError('Call not found', 404, 'not_found');
      }

      // Resolve transcription text strictly from call transcriptions (no synthetic fallback text)
      const targetPhone = call.direction === 'outbound' ? call.to : call.from;
      const transcription = call.transcriptions?.find(
        (t) => t.status === 'completed' && t.text && t.text.trim().length > 0
      ) || call.transcriptions?.find(
        (t) => t.text && t.text.trim().length > 0
      ) || call.transcriptions?.[0];
      const transcriptText = (transcription?.text && transcription.text.trim().length > 0)
        ? transcription.text.trim()
        : '';

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
        durationDays: durationDays != null && durationDays !== '' ? Number(durationDays) : undefined,
        headcountAdults: headcountAdults != null && headcountAdults !== '' ? Number(headcountAdults) : undefined,
        headcountChildren: headcountChildren != null && headcountChildren !== '' ? Number(headcountChildren) : undefined,
        headcountInfants: headcountInfants != null && headcountInfants !== '' ? Number(headcountInfants) : undefined,
        targetBudget: targetBudget ? Number(targetBudget) : undefined,
        hotelTier,
        specialRequests,
        customerName: customName || contact?.name,
        customerEmail: customEmail || contact?.email,
        customerPhone: targetPhone,
      };

      // Generate Itinerary with DeepSeek adhering to confirmed parameters (no fallback defaults)
      const result = await generateItineraryFromTranscript(
        transcriptText,
        {
          name: customName || contact?.name || undefined,
          phone: targetPhone,
          email: customEmail || contact?.email || undefined,
          company: contact?.company || undefined,
          referenceDate: call.startedAt,
        },
        auth!.organizationId,
        customParams
      );

      // Create or update Lead record with only extracted or user-supplied parameters (no fallback defaults)
      const resolvedDurationDays =
        durationDays != null && durationDays !== ''
          ? Number(durationDays)
          : result.durationDays ?? null;
      assertItineraryReady(result.itinerary, resolvedDurationDays);
      const effectiveDepStr = departureDate || result.departureDate || null;
      const parsedDeparture = effectiveDepStr ? new Date(effectiveDepStr) : null;
      let parsedReturn = returnDate ? new Date(returnDate) : null;
      if (!parsedReturn && parsedDeparture && !isNaN(parsedDeparture.getTime()) && resolvedDurationDays) {
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

      if (!contactToLink && targetPhone && (resolvedCustomerName || resolvedCustomerEmail)) {
        try {
          contactToLink = await db.contact.create({
            data: {
              organizationId: auth!.organizationId,
              name: resolvedCustomerName || '',
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

      const resolvedDestination = result.destination || customDestination || '';
      const resolvedTitle =
        result.title ||
        (resolvedDestination
          ? resolvedDurationDays
            ? `Bespoke ${resolvedDurationDays}-Day Journey to ${resolvedDestination}`
            : `${resolvedDestination} Itinerary`
          : '');

      const leadDataPayload = {
        contactId: contactToLink?.id || null,
        title: resolvedTitle,
        destination: resolvedDestination,
        departureDate: parsedDeparture,
        returnDate: parsedReturn,
        durationDays: resolvedDurationDays,
        headcountAdults:
          headcountAdults != null && headcountAdults !== ''
            ? Number(headcountAdults)
            : (result.headcountAdults ?? 0),
        headcountChildren:
          headcountChildren != null && headcountChildren !== ''
            ? Number(headcountChildren)
            : (result.headcountChildren ?? 0),
        headcountInfants:
          headcountInfants != null && headcountInfants !== ''
            ? Number(headcountInfants)
            : (result.headcountInfants ?? 0),
        targetBudget: targetBudget ? Number(targetBudget) : null,
        hotelTier: hotelTier || result.hotelTier || null,
        specialRequests: specialRequests || result.specialRequests || null,
        itinerary: result.itinerary,
        customerEmail: resolvedCustomerEmail,
        metadata: {
          customerName: resolvedCustomerName || undefined,
          customerPhone: targetPhone || undefined,
          currency: 'INR',
          itineraryNeedsRegeneration: false,
        },
      };

      const leadInclude = {
        contact: true,
        supplier: true,
        quotations: {
          orderBy: { version: 'desc' as const },
        },
        supplierQuotations: {
          include: { supplier: true },
          orderBy: { createdAt: 'desc' as const },
        },
        call: {
          include: {
            recordings: true,
            transcriptions: true,
          },
        },
      };

      // Deduplicate: If a lead already exists for this call in this organization, update it instead of creating a duplicate
      const existingLeadForCall = await db.lead.findFirst({
        where: {
          organizationId: auth!.organizationId,
          callId: call.id,
        },
        orderBy: { createdAt: 'desc' },
      });

      const savedLead = existingLeadForCall
        ? await db.lead.update({
            where: { id: existingLeadForCall.id },
            data: leadDataPayload,
            include: leadInclude,
          })
        : await db.lead.create({
            data: {
              organizationId: auth!.organizationId,
              callId: call.id,
              status: 'pending_approval',
              stage: 'new_inquiry',
              ...leadDataPayload,
            },
            include: leadInclude,
          });

      await logAuditEvent({
        organizationId: auth!.organizationId,
        actorUserId: auth!.userId,
        action: 'lead.generate_itinerary',
        targetType: 'Lead',
        targetId: savedLead.id,
        metadata: { callId: call.id, title: result.title, destination: result.destination },
      });

      return savedLead;
    };

    const genPromise = generateAndPersistLead().finally(() => {
      inFlightLeadGenerationByKey.delete(dedupeKey);
    });
    inFlightLeadGenerationByKey.set(dedupeKey, { signature, promise: genPromise });
    const lead = await genPromise;

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
      { api_id: err instanceof ItineraryError ? err.code : 'server_err', error: err.message || 'Internal error generating itinerary' },
      { status: err instanceof ItineraryError ? err.status : 500 }
    );
  }
}
