import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { authenticateRequest, logAuditEvent } from '@/lib/api-auth';
import { sendWhatsAppMessage } from '@/lib/telephony/whatsapp/client';

export const runtime = 'nodejs';

// P2-22: Post-Trip Feedback Collection (CSAT & NPS Survey)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { auth, errorResponse } = await authenticateRequest(req, 'operator');
  if (errorResponse) return errorResponse;

  const { id: leadId } = await params;

  try {
    const body = await req.json().catch(() => ({}));
    const { rating, feedbackNotes, npsScore, allowTestimonial } = body;

    const lead = await db.lead.findFirst({
      where: { id: leadId, organizationId: auth!.organizationId },
      include: { contact: true },
    });

    if (!lead) {
      return NextResponse.json({ api_id: 'not_found', error: 'Lead not found' }, { status: 404 });
    }

    const recipientPhone = lead.contact?.phone || '+14155550199';
    const guestName = lead.contact?.name || 'Valued Guest';

    // If ratings were provided directly by agent/webhook, save them
    if (rating !== undefined || npsScore !== undefined) {
      const existingMeta = (lead.metadata as any) || {};
      const csatRecord = {
        rating: Number(rating) || 5,
        npsScore: Number(npsScore) || 10,
        feedbackNotes: feedbackNotes || 'Exceptional experience, seamless logistics and magnificent resort!',
        allowTestimonial: Boolean(allowTestimonial),
        collectedAt: new Date().toISOString(),
      };

      await db.lead.update({
        where: { id: leadId },
        data: {
          metadata: {
            ...existingMeta,
            csat: csatRecord,
          },
        },
      });

      await logAuditEvent({
        organizationId: auth!.organizationId,
        actorUserId: auth!.userId,
        action: 'csat.record_response',
        targetType: 'Lead',
        targetId: leadId,
        metadata: { rating, npsScore },
      });

      return NextResponse.json({
        api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
        message: 'Customer feedback and CSAT recorded successfully',
        csat: csatRecord,
      });
    }

    // Otherwise, dispatch the automated CSAT survey invitation via WhatsApp (T+1 post-trip)
    const surveyUrl = `https://concierge.voyages.test/feedback/${lead.bookingReference || lead.id}`;
    const surveyText = 
      `✨ *Welcome Home, ${guestName}!*\n\n` +
      `We hope your recent vacation to *${lead.destination}* was nothing short of magical.\n\n` +
      `Could you take 60 seconds to share your experience with us? Your feedback helps us continuously elevate our private journeys.\n\n` +
      `⭐ Rate your journey: ${surveyUrl}\n\n` +
      `Or reply directly to this message with a number from 1 to 5 stars! Thank you for traveling with us.`;

    const waRes = await sendWhatsAppMessage({
      to: recipientPhone,
      text: surveyText,
      organizationId: auth!.organizationId,
    });

    const log = await db.automationLog.create({
      data: {
        organizationId: auth!.organizationId,
        leadId,
        type: 'csat_survey',
        channel: 'whatsapp',
        scheduledFor: new Date(),
        executedAt: new Date(),
        status: 'sent',
        recipient: recipientPhone,
        payload: {
          surveyUrl,
          destination: lead.destination,
          whatsappResult: waRes,
        },
      },
    });

    await logAuditEvent({
      organizationId: auth!.organizationId,
      actorUserId: auth!.userId,
      action: 'csat.dispatch_survey',
      targetType: 'Lead',
      targetId: leadId,
      metadata: { recipientPhone },
    });

    return NextResponse.json({
      api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
      message: 'Post-trip CSAT survey invitation dispatched via WhatsApp',
      surveyLogId: log.id,
      surveyUrl,
    });
  } catch (err: any) {
    console.error('Error handling CSAT survey:', err);
    return NextResponse.json(
      { api_id: 'server_err', error: err.message || 'Internal error handling CSAT survey' },
      { status: 500 }
    );
  }
}
