import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { authenticateRequest } from '@/lib/api-auth';

export const runtime = 'nodejs';

// P2-05: GDS / Aggregator live flight search API
export async function GET(req: NextRequest) {
  const { auth, errorResponse } = await authenticateRequest(req, 'operator');
  if (errorResponse) return errorResponse;

  const url = new URL(req.url);
  const origin = (url.searchParams.get('origin') || 'JFK').toUpperCase();
  const destination = (url.searchParams.get('destination') || 'DXB').toUpperCase();
  const dateStr = url.searchParams.get('date') || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const cabin = url.searchParams.get('cabinClass') || 'business';

  // Realistic GDS schedules based on routes
  const baseDate = new Date(dateStr);
  const depTime1 = new Date(baseDate.getTime() + 10 * 3600 * 1000); // 10:00 AM
  const arrTime1 = new Date(depTime1.getTime() + 12.5 * 3600 * 1000); // 12h 30m direct

  const depTime2 = new Date(baseDate.getTime() + 18.5 * 3600 * 1000); // 18:30 PM
  const arrTime2 = new Date(depTime2.getTime() + 13 * 3600 * 1000);

  const depTime3 = new Date(baseDate.getTime() + 22 * 3600 * 1000); // 22:00 PM
  const arrTime3 = new Date(depTime3.getTime() + 14 * 3600 * 1000);

  const mockLiveFlights = [
    {
      airline: 'Emirates',
      airlineCode: 'EK',
      flightNumber: 'EK 202',
      origin,
      destination,
      departureTime: depTime1.toISOString(),
      arrivalTime: arrTime1.toISOString(),
      duration: '12h 30m (Non-stop)',
      cabinClass: cabin,
      baggageAllowance: cabin === 'business' || cabin === 'first' ? '2x 32kg check-in + 14kg cabin' : '2x 23kg check-in + 7kg cabin',
      fareRules: 'Refundable with $150 fee up to 24h before departure. Complimentary seat selection and chauffeur service included for business/first.',
      ticketCost: cabin === 'business' ? 3850.00 : cabin === 'first' ? 7400.00 : 920.00,
      availableSeats: 6,
      aircraft: 'Airbus A380-800',
    },
    {
      airline: 'Qatar Airways',
      airlineCode: 'QR',
      flightNumber: 'QR 702',
      origin,
      destination,
      departureTime: depTime2.toISOString(),
      arrivalTime: arrTime2.toISOString(),
      duration: '13h 15m (1 stop via DOH)',
      cabinClass: cabin,
      baggageAllowance: cabin === 'business' || cabin === 'first' ? '2x 32kg check-in + 14kg cabin' : '2x 23kg check-in + 7kg cabin',
      fareRules: 'Qsuite Business Class. 100% refundable up to 48 hours prior. Complimentary transit lounge in Doha.',
      ticketCost: cabin === 'business' ? 3620.00 : cabin === 'first' ? 6900.00 : 880.00,
      availableSeats: 4,
      aircraft: 'Boeing 777-300ER',
    },
    {
      airline: 'British Airways',
      airlineCode: 'BA',
      flightNumber: 'BA 178',
      origin,
      destination,
      departureTime: depTime3.toISOString(),
      arrivalTime: arrTime3.toISOString(),
      duration: '14h 00m (1 stop via LHR)',
      cabinClass: cabin,
      baggageAllowance: '2x 23kg check-in + 7kg cabin',
      fareRules: 'Club World Suite with sliding door. Date changes permitted with fare difference.',
      ticketCost: cabin === 'business' ? 3450.00 : cabin === 'first' ? 6500.00 : 810.00,
      availableSeats: 8,
      aircraft: 'Boeing 787-9 Dreamliner',
    },
  ];

  return NextResponse.json({
    api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
    searchParams: { origin, destination, date: dateStr, cabinClass: cabin },
    resultsCount: mockLiveFlights.length,
    flights: mockLiveFlights,
  });
}
