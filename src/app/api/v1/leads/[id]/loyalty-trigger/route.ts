import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { authenticateRequest, logAuditEvent } from '@/lib/api-auth';
import { sendWhatsAppMessage } from '@/lib/telephony/whatsapp/client';

export const runtime = 'nodejs';

// P2-23: Repeat-Customer Marketing & Loyalty Triggers
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { auth, errorResponse } = await authenticateRequest(req, 'operator');
  if (errorResponse) return errorResponse;

  const { id: leadId } = await params;

  try {
    const body = await req.json().catch(() => ({}));
    const { campaignType = 'anniversary', promotionalDiscount = 500, suggestedDestination } = body;

    const lead = await db.lead.findFirst({
      where: { id: leadId, organizationId: auth!.organizationId },
      include: { contact: true },
    });

    if (!lead) {
      return NextResponse.json({ api_id: 'not_found', error: 'Lead not found' }, { status: 404 });
    }

    const recipientPhone = lead.contact?.phone || '+14155550199';
    const guestName = lead.contact?.name || 'Valued Member';
    const nextDestination = suggestedDestination || 'the Amalfi Coast & Capri';

    let marketingText = '';
    if (campaignType === 'anniversary') {
      marketingText = 
        `🥂 *Happy Travel Anniversary, ${guestName}!*\n\n` +
        `It has been almost a year since your bespoke journey to *${lead.destination}*.\n\n` +
        `As an esteemed VIP member, we have unlocked an exclusive *$${promotionalDiscount} Concierge Credit* toward your next private getaway.\n\n` +
        `🌟 Recommended next escape: *${nextDestination}*\n\n` +
        `Reply to this chat to explore curated dates, private villas, and personalized flight schedules!`;
    } else {
      marketingText = 
        `🌴 *Exclusive Holiday Season Preview for ${guestName}*\n\n` +
        `Planning your upcoming holiday retreat? We have secured private allocations in *${nextDestination}* with complimentary suite upgrades.\n\n` +
        `Enjoy an exclusive member credit of *$${promotionalDiscount}* on bookings made this month. Reply to connect with your private travel designer.`;
    }

    const waRes = await sendWhatsAppMessage({
      to: recipientPhone,
      text: marketingText,
      organizationId: auth!.organizationId,
    });

    const log = await db.automationLog.create({
      data: {
        organizationId: auth!.organizationId,
        leadId,
        type: `loyalty_${campaignType}`,
        channel: 'whatsapp',
        scheduledFor: new Date(),
        executedAt: new Date(),
        status: 'sent',
        recipient: recipientPhone,
        payload: {
          campaignType,
          promotionalDiscount,
          suggestedDestination: nextDestination,
          whatsappResult: waRes,
        },
      },
    });

    await logAuditEvent({
      organizationId: auth!.organizationId,
      actorUserId: auth!.userId,
      action: 'loyalty.trigger_campaign',
      targetType: 'Lead',
      targetId: leadId,
      metadata: { campaignType, promotionalDiscount, recipientPhone },
    });

    return NextResponse.json({
      api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
      message: `Loyalty ${campaignType} campaign triggered successfully`,
      campaignLogId: log.id,
      campaignType,
      recipientPhone,
    });
  } catch (err: any) {
    console.error('Error triggering loyalty campaign:', err);
    return NextResponse.json(
      { api_id: 'server_err', error: err.message || 'Internal error triggering loyalty campaign' },
      { status: 500 }
    );
  }
}
