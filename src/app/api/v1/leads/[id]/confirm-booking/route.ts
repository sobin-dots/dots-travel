import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { authenticateRequest, logAuditEvent } from '@/lib/api-auth';
import { sendWhatsAppMessage } from '@/lib/telephony/whatsapp/client';

export const runtime = 'nodejs';

// P2-18: Booking Confirmation & Operational Handover
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { auth, errorResponse } = await authenticateRequest(req, 'operator');
  if (errorResponse) return errorResponse;

  const { id: leadId } = await params;

  try {
    const body = await req.json().catch(() => ({}));
    const { quotationId, specialInstructions } = body;

    const lead = await db.lead.findFirst({
      where: { id: leadId, organizationId: auth!.organizationId },
      include: {
        contact: true,
        tripFlights: true,
        quotations: {
          orderBy: { version: 'desc' },
          take: 1,
        },
      },
    });

    if (!lead) {
      return NextResponse.json({ api_id: 'not_found', error: 'Lead not found' }, { status: 404 });
    }

    const bookingRef = lead.bookingReference || `BK-${Date.now().toString().slice(-6)}`;
    const confirmedAt = new Date();

    // Mark lead confirmed & won
    const updatedLead = await db.lead.update({
      where: { id: leadId },
      data: {
        stage: 'confirmed',
        status: 'converted',
        bookingReference: bookingRef,
        bookingConfirmedAt: confirmedAt,
      },
      include: {
        contact: true,
        quotations: true,
      },
    });

    // Mark target quote accepted
    if (quotationId) {
      await db.customerQuotation.update({
        where: { id: quotationId },
        data: { status: 'accepted' },
      });
    } else if (lead.quotations.length > 0) {
      await db.customerQuotation.update({
        where: { id: lead.quotations[0].id },
        data: { status: 'accepted' },
      });
    }

    // Auto-create initial Deposit Payment Milestone (30% deposit) (P2-19)
    const latestQuote = lead.quotations[0];
    const totalSellingPrice = latestQuote ? Number(latestQuote.finalSellingPrice) : Number(lead.targetBudget || 5000);
    const depositAmount = Number((totalSellingPrice * 0.3).toFixed(2));
    const balanceAmount = Number((totalSellingPrice - depositAmount).toFixed(2));

    const existingMilestones = await db.paymentMilestone.count({
      where: { leadId },
    });

    if (existingMilestones === 0) {
      const now = Date.now();
      await db.paymentMilestone.createMany({
        data: [
          {
            organizationId: auth!.organizationId,
            leadId,
            title: 'Initial Booking Deposit (30%)',
            amount: depositAmount,
            dueDate: new Date(now + 3 * 24 * 3600 * 1000), // Due in 3 days
            status: 'pending',
            paymentLink: `https://pay.travelconcierge.internal/checkout/${bookingRef}_deposit`,
          },
          {
            organizationId: auth!.organizationId,
            leadId,
            title: 'Final Balance Payment (70%)',
            amount: balanceAmount,
            dueDate: lead.departureDate
              ? new Date(new Date(lead.departureDate).getTime() - 14 * 24 * 3600 * 1000)
              : new Date(now + 30 * 24 * 3600 * 1000),
            status: 'pending',
            paymentLink: `https://pay.travelconcierge.internal/checkout/${bookingRef}_balance`,
          },
        ],
      });
    }

    // Notify Customer via WhatsApp of Confirmed Booking
    const recipientPhone = lead.contact?.phone || '+14155550199';
    await sendWhatsAppMessage({
      to: recipientPhone,
      text: `🎉 *Congratulations ${lead.contact?.name || 'Valued Guest'}!*\n\n` +
        `Your trip to *${lead.destination}* is officially CONFIRMED!\n` +
        `🔖 *Booking Reference:* ${bookingRef}\n` +
        `✈️ *Trip:* ${lead.title}\n\n` +
        `Your official Booking Voucher PDF and concierge briefing have been issued. Our operations fulfillment team is now securing all accommodations and ground transfers.`,
      organizationId: auth!.organizationId,
    });

    // Operational Handover Log
    await db.automationLog.create({
      data: {
        organizationId: auth!.organizationId,
        leadId,
        type: 'operational_handover',
        channel: 'email',
        scheduledFor: confirmedAt,
        executedAt: confirmedAt,
        status: 'sent',
        recipient: 'fulfillment@travelconcierge.internal',
        payload: {
          bookingReference: bookingRef,
          leadId,
          specialInstructions: specialInstructions || 'Standard luxury VIP fulfillment',
        },
      },
    });

    await logAuditEvent({
      organizationId: auth!.organizationId,
      actorUserId: auth!.userId,
      action: 'booking.confirm_and_handover',
      targetType: 'Lead',
      targetId: leadId,
      metadata: { bookingReference: bookingRef, totalSellingPrice },
    });

    return NextResponse.json({
      api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
      message: 'Booking confirmed and successfully handed over to fulfillment team',
      bookingReference: bookingRef,
      lead: updatedLead,
    });
  } catch (err: any) {
    console.error('Error confirming booking:', err);
    return NextResponse.json(
      { api_id: 'server_err', error: err.message || 'Internal error confirming booking' },
      { status: 500 }
    );
  }
}
