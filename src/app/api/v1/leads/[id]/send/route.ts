import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { authenticateRequest, logAuditEvent } from '@/lib/api-auth';
import { generateItineraryPDF } from '@/lib/pdf-generator';
import { sendCustomerItineraryEmail, sendSupplierRfqEmail } from '@/lib/email';

export const runtime = 'nodejs';

export async function POST(
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
      organization: true,
      call: true,
    },
  });

  if (!lead) {
    return NextResponse.json({ api_id: 'not_found', error: 'Lead not found' }, { status: 404 });
  }

  try {
    const body = await req.json();
    const { customerEmail, supplierId } = body;

    let emailToSend = customerEmail || lead.customerEmail || lead.contact?.email;

    // If still missing, check if the call has a contact with email
    if (!emailToSend && lead.call) {
      const counterpart = lead.call.direction === 'outbound' ? lead.call.to : lead.call.from;
      if (counterpart) {
        const cleanPhone = counterpart.replace(/\D/g, '');
        const matched = await db.contact.findFirst({
          where: {
            organizationId: auth!.organizationId,
            OR: [
              { phone: counterpart },
              ...(cleanPhone ? [{ phone: `+${cleanPhone}` }, { phone: cleanPhone }] : []),
            ],
          },
        });
        if (matched?.email) {
          emailToSend = matched.email;
        }
      }
    }

    if (!emailToSend) {
      return NextResponse.json(
        { api_id: 'missing_email', error: 'Please provide an email address for the customer before sending' },
        { status: 400 }
      );
    }

    // Persist email if lead didn't have it saved
    if (!lead.customerEmail && emailToSend) {
      await db.lead.update({
        where: { id: lead.id },
        data: { customerEmail: emailToSend },
      }).catch(() => {});
    }

    // 1. Generate Customer Itinerary PDF
    const clientName = lead.contact?.name || 'Valued Client';
    const customerPdfBytes = await generateItineraryPDF({
      title: lead.title,
      recipientName: clientName,
      recipientEmail: emailToSend,
      recipientType: 'customer',
      itineraryText: lead.itinerary,
      organizationName: lead.organization.name,
    });

    // 2. Dispatch Customer Itinerary Email via Resend
    const customerEmailResult = await sendCustomerItineraryEmail({
      to: emailToSend,
      customerName: clientName,
      title: lead.title,
      destination: lead.destination || 'Bespoke Travel',
      pdfBuffer: customerPdfBytes,
    });

    let supplier: any = null;
    let supplierPdfBytes: Uint8Array | null = null;
    let supplierEmailResult: any = null;

    // 3. Generate & Dispatch Supplier RFQ PDF if supplier is selected
    if (supplierId) {
      supplier = await db.supplier.findFirst({
        where: { id: supplierId, organizationId: auth!.organizationId },
      });

      if (supplier) {
        supplierPdfBytes = await generateItineraryPDF({
          title: `Quotation Request: ${lead.title}`,
          recipientName: `${supplier.name} (${supplier.contactPerson || 'Reservations'})`,
          recipientEmail: supplier.email,
          recipientType: 'supplier',
          itineraryText: lead.itinerary,
          organizationName: lead.organization.name,
        });

        supplierEmailResult = await sendSupplierRfqEmail({
          to: supplier.email,
          supplierName: supplier.name,
          contactPerson: supplier.contactPerson || undefined,
          customerName: clientName,
          title: lead.title,
          destination: lead.destination || 'Bespoke Travel',
          pdfBuffer: supplierPdfBytes,
        });
      }
    }

    const now = new Date();

    // 4. Update Lead status and metadata
    const updated = await db.lead.update({
      where: { id: lead.id },
      data: {
        status: supplier ? 'sent_to_supplier' : 'sent_to_customer',
        customerEmail: emailToSend,
        customerSentAt: now,
        supplierSentAt: supplier ? now : undefined,
        selectedSupplierId: supplier?.id || lead.selectedSupplierId,
      },
      include: {
        contact: true,
        supplier: true,
      },
    });

    // Also update contact's email if contact had no email before
    if (lead.contact && !lead.contact.email && emailToSend) {
      await db.contact.update({
        where: { id: lead.contact.id },
        data: { email: emailToSend },
      });
    }

    await logAuditEvent({
      organizationId: auth!.organizationId,
      actorUserId: auth!.userId,
      action: 'lead.send_itinerary',
      targetType: 'Lead',
      targetId: lead.id,
      metadata: {
        customerEmail: emailToSend,
        supplierId: supplier?.id,
        supplierEmail: supplier?.email,
        customerPdfSize: customerPdfBytes.length,
        supplierPdfSize: supplierPdfBytes?.length,
        customerEmailId: customerEmailResult.id,
        supplierEmailId: supplierEmailResult?.id,
        simulated: customerEmailResult.simulated || supplierEmailResult?.simulated,
      },
    });

    return NextResponse.json({
      api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
      lead: updated,
      customerEmail: emailToSend,
      customerSent: customerEmailResult.success,
      customerEmailId: customerEmailResult.id,
      supplierSent: supplier ? supplierEmailResult?.success : false,
      supplierEmailId: supplierEmailResult?.id,
      supplierName: supplier?.name,
      simulated: customerEmailResult.simulated,
      message: supplier
        ? `Itinerary PDF dispatched via Resend to customer (${emailToSend}) and Quotation Request PDF sent to supplier (${supplier.email})`
        : `Itinerary PDF dispatched via Resend to customer (${emailToSend}) successfully`,
    });
  } catch (err: any) {
    console.error('Error sending itinerary:', err);
    return NextResponse.json(
      { api_id: 'server_err', error: err.message || 'Internal error sending itinerary' },
      { status: 500 }
    );
  }
}
