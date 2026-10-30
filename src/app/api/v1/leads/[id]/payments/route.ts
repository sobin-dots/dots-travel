import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { authenticateRequest, logAuditEvent } from '@/lib/api-auth';

export const runtime = 'nodejs';

// P2-19: Fetch and Create Payment Milestones
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
    });

    if (!lead) {
      return NextResponse.json({ api_id: 'not_found', error: 'Lead not found' }, { status: 404 });
    }

    const milestones = await db.paymentMilestone.findMany({
      where: { leadId, organizationId: auth!.organizationId },
      orderBy: { dueDate: 'asc' },
    });

    let totalAmount = 0;
    let totalPaid = 0;

    const formatted = milestones.map((m) => {
      const amt = Number(m.amount);
      totalAmount += amt;
      if (m.status === 'paid') totalPaid += amt;

      return {
        ...m,
        amount: amt,
      };
    });

    const outstandingBalance = Math.max(0, totalAmount - totalPaid);

    return NextResponse.json({
      api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
      leadId,
      totalAmount,
      totalPaid,
      outstandingBalance,
      isFullyPaid: totalAmount > 0 && totalPaid >= totalAmount,
      milestones: formatted,
    });
  } catch (err: any) {
    console.error('Error fetching payment milestones:', err);
    return NextResponse.json(
      { api_id: 'server_err', error: err.message || 'Internal error fetching payment milestones' },
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
    const { title, amount, dueDate, status = 'pending', paymentLink } = body;

    if (!title || amount === undefined || !dueDate) {
      return NextResponse.json(
        { api_id: 'val_err', error: 'title, amount, and dueDate are required' },
        { status: 400 }
      );
    }

    const lead = await db.lead.findFirst({
      where: { id: leadId, organizationId: auth!.organizationId },
    });

    if (!lead) {
      return NextResponse.json({ api_id: 'not_found', error: 'Lead not found' }, { status: 404 });
    }

    const link = paymentLink || `https://pay.travelconcierge.internal/checkout/${lead.bookingReference || lead.id}_${Date.now().toString().slice(-4)}`;

    const created = await db.paymentMilestone.create({
      data: {
        organizationId: auth!.organizationId,
        leadId,
        title,
        amount: Number(amount),
        dueDate: new Date(dueDate),
        status,
        paymentLink: link,
      },
    });

    await logAuditEvent({
      organizationId: auth!.organizationId,
      actorUserId: auth!.userId,
      action: 'payment_milestone.create',
      targetType: 'PaymentMilestone',
      targetId: created.id,
      metadata: { leadId, title, amount: Number(amount) },
    });

    return NextResponse.json(
      {
        api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
        milestone: {
          ...created,
          amount: Number(created.amount),
        },
        message: 'Payment milestone created successfully',
      },
      { status: 201 }
    );
  } catch (err: any) {
    console.error('Error creating payment milestone:', err);
    return NextResponse.json(
      { api_id: 'server_err', error: err.message || 'Internal error creating payment milestone' },
      { status: 500 }
    );
  }
}
