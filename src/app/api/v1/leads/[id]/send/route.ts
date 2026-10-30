import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { authenticateRequest, logAuditEvent } from '@/lib/api-auth';
import { generateItineraryPDF, resolveCustomerNameForPdf } from '@/lib/pdf-generator';
import { sendCustomerItineraryEmail, sendSupplierRfqEmail } from '@/lib/email';

export const runtime = 'nodejs';

export async function POST(
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
        organization: true,
        call: true,
      },
    }),
    db.user.findUnique({
      where: { id: auth!.userId },
      select: { name: true, email: true },
    }),
  ]);

  if (!lead) {
    return NextResponse.json({ api_id: 'not_found', error: 'Lead not found' }, { status: 404 });
  }

  try {
    const body = await req.json();
    const { customerEmail, supplierId, target } = body;

    const shouldSendCustomer = target === 'supplier' ? false : true;
    const shouldSendSupplier = target === 'customer' ? false : Boolean(supplierId);

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

    if (shouldSendCustomer && !emailToSend) {
      return NextResponse.json(
        { api_id: 'missing_email', error: 'Please provide an email address for the customer before sending' },
        { status: 400 }
      );
    }

    if (shouldSendSupplier && !supplierId) {
      return NextResponse.json(
        { api_id: 'missing_supplier', error: 'Please select a partner supplier to send the itinerary for quotation' },
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

    const leadMeta = (lead.metadata as Record<string, any>) || {};
    const currency = leadMeta.currency || 'INR';
    const targetBudget = lead.targetBudget ? Number(lead.targetBudget) : undefined;

    let formattedTravelDates: string | undefined;
    if (lead.departureDate) {
      const dep = new Date(lead.departureDate);
      const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      if (lead.returnDate) {
        const ret = new Date(lead.returnDate);
        if (dep.getMonth() === ret.getMonth() && dep.getFullYear() === ret.getFullYear()) {
          formattedTravelDates = `${dep.getDate()}–${ret.getDate()} ${months[dep.getMonth()]} ${dep.getFullYear()}`;
        } else {
          formattedTravelDates = `${dep.getDate()} ${months[dep.getMonth()].slice(0, 3)} – ${ret.getDate()} ${months[ret.getMonth()].slice(0, 3)} ${ret.getFullYear()}`;
        }
      } else {
        formattedTravelDates = `${dep.getDate()} ${months[dep.getMonth()]} ${dep.getFullYear()}`;
      }
    }

    const rawClientName = body.customerName || lead.contact?.name || leadMeta.customerName || 'Guest';
    const clientName = resolveCustomerNameForPdf(
      {
        title: lead.title,
        recipientName: rawClientName,
        recipientEmail: emailToSend,
        recipientType: 'customer',
        itineraryText: lead.itinerary,
      },
      lead.itinerary
    );
    let customerPdfBytes: Uint8Array | null = null;
    let customerEmailResult: any = null;

    // 1. Generate & Dispatch Customer Itinerary PDF if requested
    if (shouldSendCustomer && emailToSend) {
      customerPdfBytes = await generateItineraryPDF({
        title: lead.title,
        recipientName: clientName,
        recipientEmail: emailToSend,
        recipientType: 'customer',
        itineraryText: lead.itinerary,
        organizationName: lead.organization.name,
        organizationAddress: lead.organization.address || undefined,
        organizationPhone: lead.organization.phone || undefined,
        organizationWebsite: lead.organization.website || undefined,
        organizationLogo: lead.organization.logoUrl || undefined,
        organizationLetterhead: lead.organization.letterheadUrl || undefined,
        organizationLetterheadText: lead.organization.letterheadText || undefined,
        brandColor: lead.organization.brandColor || undefined,
        destination: lead.destination || undefined,
        durationDays: lead.durationDays || undefined,
        travelDates: formattedTravelDates,
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

      customerEmailResult = await sendCustomerItineraryEmail({
        to: emailToSend,
        customerName: clientName,
        title: lead.title,
        destination: lead.destination || 'Bespoke Travel',
        pdfBuffer: customerPdfBytes,
      });
    }

    let supplier: any = null;
    let supplierPdfBytes: Uint8Array | null = null;
    let supplierEmailResult: any = null;

    // 2. Generate & Dispatch Supplier RFQ PDF if supplier is selected
    if (shouldSendSupplier && supplierId) {
      supplier = await db.supplier.findFirst({
        where: { id: supplierId, organizationId: auth!.organizationId },
      });

      if (!supplier && target === 'supplier') {
        return NextResponse.json(
          { api_id: 'supplier_not_found', error: 'Selected supplier not found' },
          { status: 404 }
        );
      }

      if (supplier) {
        supplierPdfBytes = await generateItineraryPDF({
          title: `Quotation Request: ${lead.title}`,
          recipientName: `${supplier.name} (${supplier.contactPerson || 'Reservations'})`,
          recipientEmail: supplier.email,
          recipientType: 'supplier',
          itineraryText: lead.itinerary,
          organizationName: lead.organization.name,
          organizationAddress: lead.organization.address || undefined,
          organizationPhone: lead.organization.phone || undefined,
          organizationWebsite: lead.organization.website || undefined,
          organizationLogo: lead.organization.logoUrl || undefined,
          organizationLetterhead: lead.organization.letterheadUrl || undefined,
          organizationLetterheadText: lead.organization.letterheadText || undefined,
          brandColor: lead.organization.brandColor || undefined,
          destination: lead.destination || undefined,
          durationDays: lead.durationDays || undefined,
          travelDates: formattedTravelDates,
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

    // 3. Update Lead status and metadata
    const updated = await db.lead.update({
      where: { id: lead.id },
      data: {
        status: supplier ? 'sent_to_supplier' : 'sent_to_customer',
        ...(supplier && lead.stage === 'new_inquiry' ? { stage: 'quote_prep' } : {}),
        ...(emailToSend ? { customerEmail: emailToSend } : {}),
        ...(shouldSendCustomer ? { customerSentAt: now } : {}),
        ...(supplier ? { supplierSentAt: now, selectedSupplierId: supplier.id } : {}),
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
        target: target || 'both',
        customerEmail: shouldSendCustomer ? emailToSend : undefined,
        supplierId: supplier?.id,
        supplierEmail: supplier?.email,
        customerPdfSize: customerPdfBytes?.length,
        supplierPdfSize: supplierPdfBytes?.length,
        customerEmailId: customerEmailResult?.id,
        supplierEmailId: supplierEmailResult?.id,
      },
    });

    let responseMessage = '';
    if (shouldSendCustomer && supplier) {
      responseMessage = `Itinerary PDF dispatched via email to customer (${emailToSend}) and Quotation Request PDF sent to supplier (${supplier.email})`;
    } else if (supplier) {
      responseMessage = `Itinerary PDF attached and sent via email to supplier ${supplier.name} (${supplier.email}) to request quote`;
    } else {
      responseMessage = `Revised/new Itinerary PDF attached and sent via email to customer (${emailToSend})`;
    }

    return NextResponse.json({
      api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
      lead: updated,
      customerEmail: emailToSend,
      customerSent: Boolean(customerEmailResult?.success),
      customerEmailId: customerEmailResult?.id,
      supplierSent: supplier ? Boolean(supplierEmailResult?.success) : false,
      supplierEmailId: supplierEmailResult?.id,
      supplierName: supplier?.name,
      supplierEmail: supplier?.email,
      message: responseMessage,
    });
  } catch (err: any) {
    console.error('Error sending itinerary:', err);
    return NextResponse.json(
      { api_id: 'server_err', error: err.message || 'Internal error sending itinerary' },
      { status: 500 }
    );
  }
}
