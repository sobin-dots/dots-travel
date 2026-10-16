import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-auth';
import { generateBookingVoucherPDF } from '@/lib/pdf-generator';

export const runtime = 'nodejs';

// P2-18: Booking Confirmation Voucher Document Builder
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
      include: {
        contact: true,
        organization: true,
        tripFlights: {
          orderBy: { departureTime: 'asc' },
        },
        quotations: {
          orderBy: { version: 'desc' },
          take: 1,
        },
      },
    });

    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    const bookingReference = lead.bookingReference || `BK-${lead.id.slice(0, 6).toUpperCase()}`;
    const latestQuote = lead.quotations[0];
    const totalSellingPrice = latestQuote ? Number(latestQuote.finalSellingPrice) : undefined;

    const pdfBytes = await generateBookingVoucherPDF({
      bookingReference,
      leadTitle: lead.title,
      customerName: lead.contact?.name || 'Valued Client',
      customerEmail: lead.customerEmail || lead.contact?.email || undefined,
      customerPhone: lead.contact?.phone || undefined,
      destination: lead.destination || 'Curated Destination',
      departureDate: lead.departureDate || undefined,
      returnDate: lead.returnDate || undefined,
      headcountAdults: lead.headcountAdults || 2,
      headcountChildren: lead.headcountChildren || 0,
      hotelTier: lead.hotelTier || undefined,
      flights: lead.tripFlights.map((f) => ({
        airline: f.airline,
        flightNumber: f.flightNumber,
        origin: f.origin,
        destination: f.destination,
        departureTime: f.departureTime,
        pnr: f.pnr || undefined,
      })),
      totalSellingPrice,
      currency: latestQuote?.currency || 'USD',
      organizationName: lead.organization.name,
    });

    const safeRef = bookingReference.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `Voucher_${safeRef}.pdf`;

    return new Response(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
        'Content-Length': pdfBytes.length.toString(),
      },
    });
  } catch (err: any) {
    console.error('Error generating booking voucher PDF:', err);
    return NextResponse.json(
      { error: err.message || 'Internal error generating voucher PDF' },
      { status: 500 }
    );
  }
}
