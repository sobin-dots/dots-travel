import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { authenticateRequest, logAuditEvent } from '@/lib/api-auth';

export const runtime = 'nodejs';

export async function GET(
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
      supplier: true,
      call: {
        include: {
          recordings: true,
          transcriptions: true,
        },
      },
    },
  });

  if (!lead) {
    return NextResponse.json({ api_id: 'not_found', error: 'Lead not found' }, { status: 404 });
  }

  return NextResponse.json({
    api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
    lead,
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { auth, errorResponse } = await authenticateRequest(req, 'operator');
  if (errorResponse) return errorResponse;

  const { id } = await params;
  const lead = await db.lead.findFirst({
    where: { id, organizationId: auth!.organizationId },
  });

  if (!lead) {
    return NextResponse.json({ api_id: 'not_found', error: 'Lead not found' }, { status: 404 });
  }

  try {
    const body = await req.json();
    const { status, customerEmail, title, selectedSupplierId } = body;

    const updated = await db.lead.update({
      where: { id: lead.id },
      data: {
        ...(status !== undefined ? { status } : {}),
        ...(customerEmail !== undefined ? { customerEmail } : {}),
        ...(title !== undefined ? { title } : {}),
        ...(selectedSupplierId !== undefined ? { selectedSupplierId: selectedSupplierId || null } : {}),
      },
      include: {
        contact: true,
        supplier: true,
        call: {
          include: {
            recordings: true,
            transcriptions: true,
          },
        },
      },
    });

    await logAuditEvent({
      organizationId: auth!.organizationId,
      actorUserId: auth!.userId,
      action: 'lead.update',
      targetType: 'Lead',
      targetId: lead.id,
      metadata: { previousStatus: lead.status, newStatus: status, changes: body },
    });

    return NextResponse.json({
      api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
      success: true,
      lead: updated,
    });
  } catch (err: any) {
    return NextResponse.json(
      { api_id: 'internal_err', error: err.message || 'Failed to update lead' },
      { status: 500 }
    );
  }
}
