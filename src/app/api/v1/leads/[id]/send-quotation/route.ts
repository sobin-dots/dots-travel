import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { authenticateRequest, logAuditEvent } from '@/lib/api-auth';
import { sendCustomerItineraryEmail } from '@/lib/email';
import { generateCustomerQuotationPDF } from '@/lib/pdf-generator';

export const runtime = 'nodejs';

// P2-12 & P2-13: Email Quotation Dispatch & Automated Follow-ups
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
      quotationId,
      sendEmail = true,
      scheduleAutomatedFollowUps = true,
    } = body;

    const lead = await db.lead.findFirst({
      where: { id: leadId, organizationId: auth!.organizationId },
      include: {
        contact: true,
        organization: true,
        call: true,
        tripFlights: {
          orderBy: { departureTime: 'asc' },
        },
      },
    });

    if (!lead) {
      return NextResponse.json({ api_id: 'not_found', error: 'Lead not found' }, { status: 404 });
    }

    // Resolve target quote
    let quote = null;
    if (quotationId) {
      quote = await db.customerQuotation.findFirst({
        where: { id: quotationId, leadId, organizationId: auth!.organizationId },
      });
    } else {
      quote = await db.customerQuotation.findFirst({
        where: { leadId, organizationId: auth!.organizationId },
        orderBy: { version: 'desc' },
      });
    }

    const recipientEmail = lead.customerEmail || lead.contact?.email || 'customer@voyages.test';
    const recipientName = lead.contact?.name || 'Valued Client';
    const version = quote?.version || 1;
    const finalPrice = quote ? Number(quote.finalSellingPrice) : Number(lead.targetBudget || 0);

    const results: Record<string, any> = {
      email: null,
      automatedFollowUpsScheduled: 0,
    };

    // 1. Email Dispatch with PDF Proposal (P2-11, P2-12)
    if (sendEmail) {
      const pdfBytes = await generateCustomerQuotationPDF({
        title: lead.title,
        recipientName,
        recipientEmail,
        destination: lead.destination || 'Curated Destination',
        version,
        finalSellingPrice: finalPrice,
        currency: quote?.currency || (lead.metadata as any)?.currency || 'INR',
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

      const emailRes = await sendCustomerItineraryEmail({
        to: recipientEmail,
        customerName: recipientName,
        title: lead.title,
        destination: lead.destination || 'Curated Destination',
        pdfBuffer: pdfBytes,
      });

      results.email = emailRes;
    }

    // Update Quotation Status
    if (quote) {
      await db.customerQuotation.update({
        where: { id: quote.id },
        data: {
          status: 'sent',
          sentViaEmail: Boolean(sendEmail),
          sentAt: new Date(),
        },
      });
    }

    // Advance Lead pipeline stage to quote_sent (P2-17)
    await db.lead.update({
      where: { id: leadId },
      data: {
        stage: 'quote_sent',
        status: 'approved',
      },
    });

    // 2. P2-13, P2-14, P2-15: Trigger Timed Follow-Up Sequences via Email
    if (scheduleAutomatedFollowUps) {
      const now = Date.now();
      const followUps = [
        {
          type: 'customer_drip_day1',
          channel: 'email',
          scheduledFor: new Date(now + 24 * 3600 * 1000), // Day 1 (+24h)
          recipient: recipientEmail,
          payload: {
            step: 1,
            subject: `Checking In: Your Quotation for ${lead.destination}`,
            message: `Hi ${recipientName}, just checking in to see if you had a chance to review the quotation for ${lead.destination}? Our concierge is available if you have questions!`,
          },
        },
        {
          type: 'customer_drip_day3',
          channel: 'email',
          scheduledFor: new Date(now + 3 * 24 * 3600 * 1000), // Day 3 (+72h)
          recipient: recipientEmail,
          payload: {
            step: 2,
            subject: `Availability Update: ${lead.title}`,
            message: `Hi ${recipientName}! Flights and preferred resort availability for ${lead.destination} are filling up quickly. Would you like us to hold the current rate for 48 hours?`,
          },
        },
        {
          type: 'customer_drip_day5',
          channel: 'email',
          scheduledFor: new Date(now + 5 * 24 * 3600 * 1000), // Day 5 (+120h)
          recipient: recipientEmail,
          payload: {
            step: 3,
            subject: `Quote Validity Notice: ${lead.title}`,
            message: `Dear ${recipientName},\n\nThis is a friendly reminder that your customized travel proposal for ${lead.destination} is valid for 48 more hours. Please let us know if you wish to confirm or adjust any itinerary details.\n\nWarm regards,\nConcierge Operations`,
          },
        },
      ];

      for (const fu of followUps) {
        await db.automationLog.create({
          data: {
            organizationId: auth!.organizationId,
            leadId,
            type: fu.type,
            channel: fu.channel,
            scheduledFor: fu.scheduledFor,
            status: 'scheduled',
            recipient: fu.recipient,
            payload: fu.payload,
          },
        });
      }
      results.automatedFollowUpsScheduled = followUps.length;
    }

    await logAuditEvent({
      organizationId: auth!.organizationId,
      actorUserId: auth!.userId,
      action: 'quotation.dispatch_email',
      targetType: 'CustomerQuotation',
      targetId: quote?.id || leadId,
      metadata: {
        leadId,
        sendEmail,
        recipientEmail,
        automatedFollowUpsCount: results.automatedFollowUpsScheduled,
      },
    });

    return NextResponse.json({
      api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
      message: 'Quotation successfully dispatched via Email with automated follow-ups scheduled',
      results,
    });
  } catch (err: any) {
    console.error('Error dispatching quotation:', err);
    return NextResponse.json(
      { api_id: 'server_err', error: err.message || 'Internal error dispatching quotation' },
      { status: 500 }
    );
  }
}
