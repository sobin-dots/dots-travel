import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-auth';
import { generateCustomerQuotationPDF } from '@/lib/pdf-generator';

export const runtime = 'nodejs';

// P2-06: Final Customer Quotation Document Builder
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { auth, errorResponse } = await authenticateRequest(req, 'operator');
  if (errorResponse) return errorResponse;

  const { id: leadId } = await params;
  const url = new URL(req.url);
  const quoteId = url.searchParams.get('quoteId');

  try {
    const lead = await db.lead.findFirst({
      where: { id: leadId, organizationId: auth!.organizationId },
      include: {
        contact: true,
        organization: true,
        tripFlights: {
          orderBy: { departureTime: 'asc' },
        },
      },
    });

    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    // Fetch specified quote or latest quote
    let quote = null;
    if (quoteId) {
      quote = await db.customerQuotation.findFirst({
        where: { id: quoteId, leadId, organizationId: auth!.organizationId },
      });
    } else {
      quote = await db.customerQuotation.findFirst({
        where: { leadId, organizationId: auth!.organizationId },
        orderBy: { version: 'desc' },
      });
    }

    const recipientName = lead.contact?.name || 'Valued Client';
    const recipientEmail = lead.customerEmail || lead.contact?.email || undefined;
    const finalPrice = quote ? Number(quote.finalSellingPrice) : (lead.targetBudget ? Number(lead.targetBudget) : 5000);
    const version = quote?.version || 1;

    const leadMeta = (lead.metadata as Record<string, any>) || {};
    const currency = quote?.currency || leadMeta.currency || 'INR';

    const pdfBytes = await generateCustomerQuotationPDF({
      title: lead.title,
      recipientName,
      recipientEmail,
      destination: lead.destination || 'Curated Destination',
      version,
      finalSellingPrice: finalPrice,
      currency,
      taxAmount: quote ? Number(quote.taxAmount) : 0,
      marginAmount: quote ? Number(quote.marginAmount) : 0,
      itineraryText: lead.itinerary,
      flights: lead.tripFlights.map((f) => ({
        airline: f.airline,
        flightNumber: f.flightNumber,
        origin: f.origin,
        destination: f.destination,
        departureTime: f.departureTime,
        arrivalTime: f.arrivalTime,
        cabinClass: f.cabinClass,
        baggageAllowance: f.baggageAllowance,
        pnr: f.pnr || undefined,
      })),
      organizationName: lead.organization.name,
      organizationAddress: lead.organization.address || undefined,
      organizationPhone: lead.organization.phone || undefined,
      organizationWebsite: lead.organization.website || undefined,
      organizationLogo: lead.organization.logoUrl || undefined,
      organizationLetterhead: lead.organization.letterheadUrl || undefined,
      organizationLetterheadText: lead.organization.letterheadText || undefined,
      brandColor: lead.organization.brandColor || undefined,
      validUntil: quote?.validUntil || undefined,
    });

    const safeTitle = lead.title.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `${safeTitle}_Quotation_v${version}.pdf`;

    return new Response(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
        'Content-Length': pdfBytes.length.toString(),
      },
    });
  } catch (err: any) {
    console.error('Error generating quotation proposal PDF:', err);
    return NextResponse.json(
      { error: err.message || 'Internal error generating proposal PDF' },
      { status: 500 }
    );
  }
}
