import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-auth';
import { generateItineraryPDF } from '@/lib/pdf-generator';

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
      organization: true,
    },
  });

  if (!lead) {
    return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type') === 'supplier' ? 'supplier' : 'customer';

  const recipientName =
    type === 'supplier'
      ? lead.supplier?.name || 'Partner Supplier'
      : lead.contact?.name || 'Valued Client';

  const recipientEmail =
    type === 'supplier'
      ? lead.supplier?.email || undefined
      : lead.customerEmail || lead.contact?.email || undefined;

  const title = type === 'supplier' ? `RFQ: ${lead.title}` : lead.title;

  const pdfBytes = await generateItineraryPDF({
    title,
    recipientName,
    recipientEmail,
    recipientType: type,
    itineraryText: lead.itinerary,
    organizationName: lead.organization.name,
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
