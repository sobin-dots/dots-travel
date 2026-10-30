import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { authenticateRequest, logAuditEvent } from '@/lib/api-auth';

export const runtime = 'nodejs';

const VALID_STAGES = ['new_inquiry', 'quote_prep', 'quote_sent', 'negotiation', 'confirmed', 'lost'];

// P2-17: Update Lead Stage & Qualification Score
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { auth, errorResponse } = await authenticateRequest(req, 'operator');
  if (errorResponse) return errorResponse;

  const { id: leadId } = await params;

  try {
    const body = await req.json();
    const { stage, qualificationScore, intentNotes } = body;

    if (!stage || !VALID_STAGES.includes(stage)) {
      return NextResponse.json(
        { api_id: 'val_err', error: `Invalid stage. Must be one of: ${VALID_STAGES.join(', ')}` },
        { status: 400 }
      );
    }

    const lead = await db.lead.findFirst({
      where: { id: leadId, organizationId: auth!.organizationId },
    });

    if (!lead) {
      return NextResponse.json({ api_id: 'not_found', error: 'Lead not found' }, { status: 404 });
    }

    const prevStage = lead.stage;
    const existingMeta = (lead.metadata as any) || {};

    const updatedLead = await db.lead.update({
      where: { id: leadId },
      data: {
        stage,
        metadata: {
          ...existingMeta,
          qualificationScore: qualificationScore !== undefined ? Number(qualificationScore) : existingMeta.qualificationScore || 75,
          intentNotes: intentNotes || existingMeta.intentNotes || null,
          lastStageChangeAt: new Date().toISOString(),
          stageHistory: [
            ...(existingMeta.stageHistory || []),
            { from: prevStage, to: stage, at: new Date().toISOString() },
          ],
        },
      },
      include: {
        contact: true,
        quotations: {
          orderBy: { version: 'desc' },
          take: 1,
        },
      },
    });

    await logAuditEvent({
      organizationId: auth!.organizationId,
      actorUserId: auth!.userId,
      action: 'lead.stage_update',
      targetType: 'Lead',
      targetId: leadId,
      metadata: { from: prevStage, to: stage, qualificationScore },
    });

    return NextResponse.json({
      api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
      lead: updatedLead,
      message: `Lead pipeline stage updated to ${stage}`,
    });
  } catch (err: any) {
    console.error('Error updating lead pipeline stage:', err);
    return NextResponse.json(
      { api_id: 'server_err', error: err.message || 'Internal error updating lead stage' },
      { status: 500 }
    );
  }
}
