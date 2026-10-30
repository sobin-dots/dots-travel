import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { authenticateRequest, logAuditEvent } from '@/lib/api-auth';

export const runtime = 'nodejs';

// P2-05: Fetch Flight Details for Trip File
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { auth, errorResponse } = await authenticateRequest(req, 'operator');
  if (errorResponse) return errorResponse;

  const { id: leadId } = await params;

  try {
    const lead = await db.lead.findFirst({
      where: { id: leadId, organizationId: auth!.organizationId },
    });

    if (!lead) {
      return NextResponse.json({ api_id: 'not_found', error: 'Lead not found' }, { status: 404 });
    }

    const flights = await db.tripFlight.findMany({
      where: { leadId, organizationId: auth!.organizationId },
      orderBy: { departureTime: 'asc' },
    });

    return NextResponse.json({
      api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
      flights: flights.map((f) => ({
        ...f,
        ticketCost: f.ticketCost ? Number(f.ticketCost) : null,
      })),
    });
  } catch (err: any) {
    console.error('Error fetching trip flights:', err);
    return NextResponse.json(
      { api_id: 'server_err', error: err.message || 'Internal error fetching trip flights' },
      { status: 500 }
    );
  }
}

// P2-05: Add Flight Schedule / Manual PNR Lookup
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { auth, errorResponse } = await authenticateRequest(req, 'operator');
  if (errorResponse) return errorResponse;

  const { id: leadId } = await params;

  try {
    const body = await req.json();
    const {
      airline,
      airlineCode = 'XX',
      flightNumber,
      origin,
      destination,
      departureTime,
      arrivalTime,
      cabinClass = 'economy',
      baggageAllowance = '1x 23kg check-in + 7kg cabin',
      pnr,
      fareRules,
      ticketCost,
    } = body;

    if (!airline || !flightNumber || !origin || !destination || !departureTime || !arrivalTime) {
      return NextResponse.json(
        { api_id: 'val_err', error: 'airline, flightNumber, origin, destination, departureTime, and arrivalTime are required' },
        { status: 400 }
      );
    }

    const lead = await db.lead.findFirst({
      where: { id: leadId, organizationId: auth!.organizationId },
    });

    if (!lead) {
      return NextResponse.json({ api_id: 'not_found', error: 'Lead not found' }, { status: 404 });
    }

    if (!airline || !flightNumber) {
      return NextResponse.json(
        { api_id: 'val_err', error: 'airline and flightNumber are required' },
        { status: 400 }
      );
    }

    // Resilient fallback defaults for manual PNR entry
    const finalOrigin = (origin || 'JFK').toUpperCase();
    const finalDest = (destination || lead.destination?.slice(0, 3) || 'DXB').toUpperCase();

    // Default dates if not specified
    const baseDepDate = departureTime
      ? new Date(departureTime)
      : lead.departureDate
      ? new Date(lead.departureDate)
      : new Date(Date.now() + 14 * 86400000 + 10 * 3600000);
    const baseArrDate = arrivalTime
      ? new Date(arrivalTime)
      : new Date(baseDepDate.getTime() + 12.5 * 3600000);

    // Auto extract 2-letter airline code if default 'XX'
    let finalAirlineCode = airlineCode;
    if (finalAirlineCode === 'XX' && flightNumber) {
      const match = flightNumber.trim().match(/^([A-Za-z0-9]{2})/);
      if (match) finalAirlineCode = match[1].toUpperCase();
    }

    const finalPnr = (pnr && pnr.trim()) ? pnr.trim().toUpperCase() : `PNR${Date.now().toString().slice(-6)}`;

    const createdFlight = await db.tripFlight.create({
      data: {
        organizationId: auth!.organizationId,
        leadId,
        airline,
        airlineCode: finalAirlineCode,
        flightNumber,
        origin: finalOrigin,
        destination: finalDest,
        departureTime: baseDepDate,
        arrivalTime: baseArrDate,
        cabinClass: cabinClass || 'economy',
        baggageAllowance: baggageAllowance || '1x 23kg check-in + 7kg cabin',
        pnr: finalPnr,
        fareRules: fareRules || 'Standard fare rules apply. E-ticket issued under PNR ' + finalPnr,
        ticketCost: ticketCost !== undefined && ticketCost !== null && ticketCost !== '' ? Number(ticketCost) : null,
      },
    });

    await logAuditEvent({
      organizationId: auth!.organizationId,
      actorUserId: auth!.userId,
      action: 'trip_flight.add',
      targetType: 'TripFlight',
      targetId: createdFlight.id,
      metadata: { leadId, flightNumber, pnr: createdFlight.pnr, airline },
    });

    return NextResponse.json(
      {
        api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
        flight: {
          ...createdFlight,
          ticketCost: createdFlight.ticketCost ? Number(createdFlight.ticketCost) : null,
        },
        message: 'Flight details attached to trip successfully',
      },
      { status: 201 }
    );
  } catch (err: any) {
    console.error('Error adding trip flight:', err);
    return NextResponse.json(
      { api_id: 'server_err', error: err.message || 'Internal error adding trip flight' },
      { status: 500 }
    );
  }
}

// Detach / Delete Flight from Trip
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { auth, errorResponse } = await authenticateRequest(req, 'operator');
  if (errorResponse) return errorResponse;

  const { id: leadId } = await params;
  const url = new URL(req.url);
  const flightId = url.searchParams.get('flightId');

  if (!flightId) {
    return NextResponse.json({ api_id: 'val_err', error: 'flightId query parameter is required' }, { status: 400 });
  }

  try {
    const existing = await db.tripFlight.findFirst({
      where: { id: flightId, leadId, organizationId: auth!.organizationId },
    });

    if (!existing) {
      return NextResponse.json({ api_id: 'not_found', error: 'Flight not found for this trip' }, { status: 404 });
    }

    await db.tripFlight.delete({ where: { id: flightId } });

    await logAuditEvent({
      organizationId: auth!.organizationId,
      actorUserId: auth!.userId,
      action: 'trip_flight.delete',
      targetType: 'TripFlight',
      targetId: flightId,
      metadata: { leadId, pnr: existing.pnr, flightNumber: existing.flightNumber },
    });

    return NextResponse.json({
      api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
      success: true,
      message: 'Flight removed from trip',
    });
  } catch (err: any) {
    console.error('Error deleting trip flight:', err);
    return NextResponse.json(
      { api_id: 'server_err', error: err.message || 'Internal error deleting trip flight' },
      { status: 500 }
    );
  }
}
