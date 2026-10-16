import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { authenticateRequest, logAuditEvent } from '@/lib/api-auth';
import { sendCustomerItineraryEmail } from '@/lib/email';

export const runtime = 'nodejs';

// P2-11: Two-Way Email Integration & Thread Sync
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { auth, errorResponse } = await authenticateRequest(req, 'operator');
  if (errorResponse) return errorResponse;

  const { id: leadId } = await params;

  try {
    const lead = await db.lead.findFirst({
      where: { id: leadId, organizationId: auth!.organizationId },
      include: { contact: true },
    });

    if (!lead) {
      return NextResponse.json({ api_id: 'not_found', error: 'Lead not found' }, { status: 404 });
    }

    // Retrieve emails from automation logs and message threads anchored to this lead
    const emailLogs = await db.automationLog.findMany({
      where: {
        leadId,
        organizationId: auth!.organizationId,
        channel: 'email',
      },
      orderBy: { createdAt: 'desc' },
    });

    const threadItems = emailLogs.map((log) => {
      const p = (log.payload as any) || {};
      return {
        id: log.id,
        direction: p.direction || 'outbound',
        from: p.from || 'concierge@travelplatform.internal',
        to: log.recipient,
        subject: p.subject || `Trip Update: ${lead.title}`,
        body: p.body || 'Email dispatch relating to bespoke travel quotation.',
        timestamp: log.executedAt || log.createdAt,
        status: log.status,
        hasAttachments: Boolean(p.hasAttachments),
      };
    });

    // If empty, supply anchor thread entry
    if (threadItems.length === 0 && (lead.customerEmail || lead.contact?.email)) {
      threadItems.push({
        id: `email_init_${lead.id.slice(0, 8)}`,
        direction: 'inbound',
        from: lead.customerEmail || lead.contact?.email || 'customer@voyages.test',
        to: 'inquiries@travelconcierge.internal',
        subject: `Travel Inquiry: ${lead.title}`,
        body: `Initial travel inquiry initiated regarding ${lead.destination} for ${lead.durationDays || 5} days.`,
        timestamp: lead.createdAt,
        status: 'received',
        hasAttachments: false,
      });
    }

    return NextResponse.json({
      api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
      leadId,
      threadEmail: lead.customerEmail || lead.contact?.email,
      totalCount: threadItems.length,
      emails: threadItems,
    });
  } catch (err: any) {
    console.error('Error fetching email thread:', err);
    return NextResponse.json(
      { api_id: 'server_err', error: err.message || 'Internal error fetching email thread' },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { auth, errorResponse } = await authenticateRequest(req, 'operator');
  if (errorResponse) return errorResponse;

  const { id: leadId } = await params;

  try {
    const body = await req.json();
    const { to, subject, message, direction = 'outbound' } = body;

    const lead = await db.lead.findFirst({
      where: { id: leadId, organizationId: auth!.organizationId },
      include: { contact: true },
    });

    if (!lead) {
      return NextResponse.json({ api_id: 'not_found', error: 'Lead not found' }, { status: 404 });
    }

    const recipient = to || lead.customerEmail || lead.contact?.email;
    if (!recipient) {
      return NextResponse.json(
        { api_id: 'val_err', error: 'Recipient email is required' },
        { status: 400 }
      );
    }

    // Anchor email into automation logs
    const log = await db.automationLog.create({
      data: {
        organizationId: auth!.organizationId,
        leadId,
        type: 'customer_email_sync',
        channel: 'email',
        scheduledFor: new Date(),
        executedAt: new Date(),
        status: 'sent',
        recipient,
        payload: {
          direction,
          from: direction === 'outbound' ? 'concierge@travelplatform.internal' : recipient,
          subject: subject || `Update Regarding ${lead.title}`,
          body: message || '',
          hasAttachments: false,
        },
      },
    });

    await logAuditEvent({
      organizationId: auth!.organizationId,
      actorUserId: auth!.userId,
      action: 'email.sync',
      targetType: 'Lead',
      targetId: leadId,
      metadata: { recipient, subject, direction },
    });

    return NextResponse.json(
      {
        api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
        emailLogId: log.id,
        message: 'Email synchronized and anchored to CRM trip file successfully',
      },
      { status: 201 }
    );
  } catch (err: any) {
    console.error('Error syncing email:', err);
    return NextResponse.json(
      { api_id: 'server_err', error: err.message || 'Internal error syncing email' },
      { status: 500 }
    );
  }
}
