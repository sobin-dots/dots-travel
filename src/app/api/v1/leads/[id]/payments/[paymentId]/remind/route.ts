import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { authenticateRequest, logAuditEvent } from '@/lib/api-auth';
import { sendWhatsAppMessage } from '@/lib/telephony/whatsapp/client';

export const runtime = 'nodejs';

// P2-19: Payment Reminder Dispatch
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; paymentId: string }> }
) {
  const { auth, errorResponse } = await authenticateRequest(req, 'operator');
  if (errorResponse) return errorResponse;

  const { id: leadId, paymentId } = await params;

  try {
    const lead = await db.lead.findFirst({
      where: { id: leadId, organizationId: auth!.organizationId },
      include: { contact: true },
    });

    if (!lead) {
      return NextResponse.json({ api_id: 'not_found', error: 'Lead not found' }, { status: 404 });
    }

    const milestone = await db.paymentMilestone.findFirst({
      where: { id: paymentId, leadId, organizationId: auth!.organizationId },
    });

    if (!milestone) {
      return NextResponse.json({ api_id: 'not_found', error: 'Payment milestone not found' }, { status: 404 });
    }

    const recipientPhone = lead.contact?.phone || '+14155550199';
    const amountStr = `$${Number(milestone.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
    const dueDateStr = new Date(milestone.dueDate).toLocaleDateString();

    const waText = 
      `💳 *Payment Reminder for your Upcoming Trip to ${lead.destination}*\n\n` +
      `Hello ${lead.contact?.name || 'Valued Guest'},\n` +
      `This is a friendly reminder regarding your milestone payment for *${milestone.title}*.\n\n` +
      `💵 *Amount Due:* ${amountStr} USD\n` +
      `📅 *Due Date:* ${dueDateStr}\n` +
      `🔗 *Secure Payment Link:* ${milestone.paymentLink}\n\n` +
      `Click the secure link above to complete payment. If you have already processed this, please reply to let your travel concierge know!`;

    const waRes = await sendWhatsAppMessage({
      to: recipientPhone,
      text: waText,
      organizationId: auth!.organizationId,
    });

    // Update reminder counters
    const updated = await db.paymentMilestone.update({
      where: { id: paymentId },
      data: {
        reminderSentCount: milestone.reminderSentCount + 1,
        lastReminderSentAt: new Date(),
      },
    });

    await db.automationLog.create({
      data: {
        organizationId: auth!.organizationId,
        leadId,
        type: 'payment_reminder',
        channel: 'whatsapp',
        scheduledFor: new Date(),
        executedAt: new Date(),
        status: 'sent',
        recipient: recipientPhone,
        payload: {
          milestoneId: paymentId,
          title: milestone.title,
          amount: Number(milestone.amount),
          whatsappResult: waRes,
        },
      },
    });

    await logAuditEvent({
      organizationId: auth!.organizationId,
      actorUserId: auth!.userId,
      action: 'payment.remind',
      targetType: 'PaymentMilestone',
      targetId: paymentId,
      metadata: { leadId, title: milestone.title, recipientPhone },
    });

    return NextResponse.json({
      api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
      message: `Automated payment reminder dispatched for ${milestone.title}`,
      milestone: {
        ...updated,
        amount: Number(updated.amount),
      },
    });
  } catch (err: any) {
    console.error('Error dispatching payment reminder:', err);
    return NextResponse.json(
      { api_id: 'server_err', error: err.message || 'Internal error dispatching payment reminder' },
      { status: 500 }
    );
  }
}
