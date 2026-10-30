import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { authenticateRequest } from '@/lib/api-auth';

export const runtime = 'nodejs';

// P2-05: GDS PNR Lookup Engine (Sabre / Amadeus GDS emulator)
export async function GET(req: NextRequest) {
  const { auth, errorResponse } = await authenticateRequest(req, 'operator');
  if (errorResponse) return errorResponse;

  const url = new URL(req.url);
  const rawPnr = url.searchParams.get('pnr') || '';
  const pnr = rawPnr.trim().toUpperCase();

  if (!pnr) {
    return NextResponse.json({ api_id: 'val_err', error: 'PNR query parameter is required' }, { status: 400 });
  }

  // Generate realistic flight schedule matching PNR prefix or mock record
  const now = Date.now();
  const depTime = new Date(now + 14 * 86400000 + 10 * 3600000);
  const arrTime = new Date(depTime.getTime() + 12.5 * 3600000);

  let airline = 'Emirates';
  let airlineCode = 'EK';
  let flightNumber = 'EK 202';
  let origin = 'JFK';
  let destination = 'DXB';
  let cabinClass = 'business';
  let baggageAllowance = '2x 32kg check-in + 14kg cabin';
  let ticketCost = 3850;
  let fareRules = 'Confirmed GDS PNR record (HK1). Chauffeur-drive service included. Changes permitted with $150 penalty.';

  if (pnr.startsWith('QR') || pnr.includes('QAT')) {
    airline = 'Qatar Airways';
    airlineCode = 'QR';
    flightNumber = 'QR 702';
    origin = 'JFK';
    destination = 'DOH';
    cabinClass = 'business';
    ticketCost = 3620;
    baggageAllowance = '2x 32kg check-in + 14kg cabin';
    fareRules = 'Qsuite Business Class confirmed. Complimentary Al Mourjan lounge access in Doha.';
  } else if (pnr.startsWith('BA') || pnr.includes('BRIT')) {
    airline = 'British Airways';
    airlineCode = 'BA';
    flightNumber = 'BA 178';
    origin = 'JFK';
    destination = 'LHR';
    cabinClass = 'business';
    ticketCost = 3450;
    baggageAllowance = '2x 32kg check-in + 7kg cabin';
    fareRules = 'Club World Suite confirmed. Fully flexible with fare difference.';
  } else if (pnr.startsWith('SQ') || pnr.includes('SIA')) {
    airline = 'Singapore Airlines';
    airlineCode = 'SQ';
    flightNumber = 'SQ 25';
    origin = 'JFK';
    destination = 'SIN';
    cabinClass = 'first';
    ticketCost = 7200;
    baggageAllowance = '50kg check-in + 2x 7kg cabin';
    fareRules = 'Singapore Airlines Suites class. Dom Pérignon service. Private Room lounge access.';
  } else if (pnr.startsWith('AI') || pnr.includes('IND')) {
    airline = 'Air India';
    airlineCode = 'AI';
    flightNumber = 'AI 102';
    origin = 'DEL';
    destination = 'JFK';
    cabinClass = 'economy';
    ticketCost = 980;
    baggageAllowance = '2x 23kg check-in + 7kg cabin';
    fareRules = 'Economy Saver. Changes allowed with $100 fee up to 24 hours before flight.';
  } else {
    // Custom / Generic PNR
    const code = pnr.slice(0, 2);
    flightNumber = `${code || 'FL'} ${pnr.slice(-3) || '101'}`;
  }

  return NextResponse.json({
    api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
    found: true,
    pnr,
    flight: {
      pnr,
      airline,
      airlineCode,
      flightNumber,
      origin,
      destination,
      departureTime: depTime.toISOString(),
      arrivalTime: arrTime.toISOString(),
      cabinClass,
      baggageAllowance,
      ticketCost,
      fareRules,
      status: 'CONFIRMED (HK1)',
      gdsProvider: 'Amadeus / Sabre Global Distribution System',
    },
  });
}
