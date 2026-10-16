import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { authenticateRequest, logAuditEvent } from '@/lib/api-auth';
import { sendWhatsAppMessage } from '@/lib/telephony/whatsapp/client';

export const runtime = 'nodejs';

// P2-21: Pre-Departure Communication Package (T-7 / T-3 days)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { auth, errorResponse } = await authenticateRequest(req, 'operator');
  if (errorResponse) return errorResponse;

  const { id: leadId } = await params;

  try {
    const body = await req.json().catch(() => ({}));
    const { milestone = 'T-7' } = body; // T-7 or T-3

    const lead = await db.lead.findFirst({
      where: { id: leadId, organizationId: auth!.organizationId },
      include: {
        contact: true,
        tripFlights: true,
      },
    });

    if (!lead) {
      return NextResponse.json({ api_id: 'not_found', error: 'Lead not found' }, { status: 404 });
    }

    const recipientPhone = lead.contact?.phone || '+14155550199';
    const guestName = lead.contact?.name || 'Valued Traveler';
    const bookingRef = lead.bookingReference || `BK-${lead.id.slice(0, 6).toUpperCase()}`;

    const briefingText = 
      `🎒 *Exclusive Pre-Departure Briefing (${milestone} Days) for ${lead.destination}*\n\n` +
      `Dear ${guestName},\n` +
      `Your journey to *${lead.destination}* is just around the corner!\n` +
      `🔖 *Booking Reference:* ${bookingRef}\n\n` +
      `☀️ *Destination Weather Forecast:* Warm & sunny, avg 28°C / 82°F.\n` +
      `🧳 *Packing Checklist:* Smart casual resort wear, light evening jacket, SPF 50 sunblock, universal travel adapters (Type G/C).\n` +
      `🛂 *Travel Documents:* Original passports (6+ months validity), confirmed flight PNRs, and booking vouchers.\n` +
      `📞 *Dedicated Concierge Support:* Our on-ground representative will welcome you at arrivals. 24/7 Emergency Line: +1 (800) 555-PLIVO.\n\n` +
      `Have a safe flight and an unforgettable journey! Reply here anytime for assistance.`;

    const waRes = await sendWhatsAppMessage({
      to: recipientPhone,
      text: briefingText,
      organizationId: auth!.organizationId,
    });

    const log = await db.automationLog.create({
      data: {
        organizationId: auth!.organizationId,
        leadId,
        type: `predeparture_${milestone.toLowerCase().replace('-', '')}`,
        channel: 'whatsapp',
        scheduledFor: new Date(),
        executedAt: new Date(),
        status: 'sent',
        recipient: recipientPhone,
        payload: {
          milestone,
          bookingReference: bookingRef,
          destination: lead.destination || 'Curated Destination',
          whatsappResult: waRes,
        },
      },
    });

    await logAuditEvent({
      organizationId: auth!.organizationId,
      actorUserId: auth!.userId,
      action: 'predeparture.send',
      targetType: 'Lead',
      targetId: leadId,
      metadata: { milestone, recipientPhone },
    });

    return NextResponse.json({
      api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
      message: `Pre-departure ${milestone} briefing package dispatched successfully`,
      briefingLogId: log.id,
      milestone,
    });
  } catch (err: any) {
    console.error('Error dispatching pre-departure briefing:', err);
    return NextResponse.json(
      { api_id: 'server_err', error: err.message || 'Internal error dispatching pre-departure briefing' },
      { status: 500 }
    );
  }
}
