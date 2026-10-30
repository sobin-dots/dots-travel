import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-auth';
import { generateItineraryPDF, resolveCustomerNameForPdf } from '@/lib/pdf-generator';

export const runtime = 'nodejs';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { auth, errorResponse } = await authenticateRequest(req, 'operator');
  if (errorResponse) return errorResponse;

  const { id } = await params;
  const [lead, consultantUser] = await Promise.all([
    db.lead.findFirst({
      where: { id, organizationId: auth!.organizationId },
      include: {
        contact: true,
        supplier: true,
        organization: true,
      },
    }),
    db.user.findUnique({
      where: { id: auth!.userId },
      select: { name: true, email: true },
    }),
  ]);

  if (!lead) {
    return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type') === 'supplier' ? 'supplier' : 'customer';

  const leadMeta = (lead.metadata as Record<string, any>) || {};
  const rawCustomerName = lead.contact?.name || leadMeta.customerName || 'Guest';

  const recipientEmail =
    type === 'supplier'
      ? lead.supplier?.email || undefined
      : lead.customerEmail || lead.contact?.email || undefined;

  const recipientName =
    type === 'supplier'
      ? lead.supplier?.name || 'Partner Supplier'
      : resolveCustomerNameForPdf(
          {
            title: lead.title,
            recipientName: rawCustomerName,
            recipientEmail,
            recipientType: 'customer',
            itineraryText: lead.itinerary,
          },
          lead.itinerary
        );

  const title = type === 'supplier' ? `RFQ: ${lead.title}` : lead.title;

  const currency = leadMeta.currency || 'INR';
  const targetBudget = lead.targetBudget ? Number(lead.targetBudget) : undefined;

  let travelDates: string | undefined;
  if (lead.departureDate) {
    const dep = new Date(lead.departureDate);
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    if (lead.returnDate) {
      const ret = new Date(lead.returnDate);
      if (dep.getMonth() === ret.getMonth() && dep.getFullYear() === ret.getFullYear()) {
        travelDates = `${dep.getDate()}–${ret.getDate()} ${months[dep.getMonth()]} ${dep.getFullYear()}`;
      } else {
        travelDates = `${dep.getDate()} ${months[dep.getMonth()].slice(0, 3)} – ${ret.getDate()} ${months[ret.getMonth()].slice(0, 3)} ${ret.getFullYear()}`;
      }
    } else {
      travelDates = `${dep.getDate()} ${months[dep.getMonth()]} ${dep.getFullYear()}`;
    }
  }

  const pdfBytes = await generateItineraryPDF({
    title,
    recipientName,
    recipientEmail,
    recipientType: type,
    itineraryText: lead.itinerary,
    organizationName: lead.organization.name || 'LGT Holidays',
    organizationAddress: lead.organization.address || undefined,
    organizationPhone: lead.organization.phone || undefined,
    organizationWebsite: lead.organization.website || undefined,
    organizationLogo: lead.organization.logoUrl || undefined,
    organizationLetterhead: lead.organization.letterheadUrl || undefined,
    organizationLetterheadText: lead.organization.letterheadText || undefined,
    brandColor: lead.organization.brandColor || '#ed1b24',
    destination: lead.destination || undefined,
    durationDays: lead.durationDays || undefined,
    travelDates,
    departureDate: lead.departureDate,
    returnDate: lead.returnDate,
    headcountAdults: lead.headcountAdults || 2,
    headcountChildren: lead.headcountChildren || 0,
    hotelTier: lead.hotelTier || undefined,
    specialRequests: lead.specialRequests || undefined,
    targetBudget,
    currency,
    consultantName: leadMeta.consultantName || consultantUser?.name || undefined,
    consultantPhone: leadMeta.consultantPhone || lead.organization.phone || undefined,
    consultantEmail: leadMeta.consultantEmail || consultantUser?.email || lead.organization.notificationEmail || undefined,
    bookingReference: lead.bookingReference || `FIT/${new Date(lead.createdAt).getFullYear()}/${lead.id.slice(0, 4).toUpperCase()}`,
    preparedDate: lead.updatedAt || lead.createdAt,
  });

  const filename = `${lead.title.replace(/[^a-zA-Z0-9_-]/g, '_')}_${type}.pdf`;

  return new Response(Buffer.from(pdfBytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
      'Content-Length': pdfBytes.length.toString(),
    },
  });
}
