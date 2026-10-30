import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { authenticateRequest, logAuditEvent } from '@/lib/api-auth';
import { UpdateItineraryRuleSchema } from '@/lib/schemas';

export const runtime = 'nodejs';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { auth, errorResponse } = await authenticateRequest(req, 'viewer');
  if (errorResponse) return errorResponse;

  const { id } = await params;
  const rule = await db.itineraryRule.findFirst({
    where: { id, organizationId: auth!.organizationId },
  });

  if (!rule) {
    return NextResponse.json({ api_id: 'not_found', error: 'Itinerary rule not found' }, { status: 404 });
  }

  return NextResponse.json({
    api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
    rule,
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { auth, errorResponse } = await authenticateRequest(req, 'operator');
  if (errorResponse) return errorResponse;

  const { id } = await params;
  const existing = await db.itineraryRule.findFirst({
    where: { id, organizationId: auth!.organizationId },
  });

  if (!existing) {
    return NextResponse.json({ api_id: 'not_found', error: 'Itinerary rule not found' }, { status: 404 });
  }

  try {
    const body = await req.json();
    const parsed = UpdateItineraryRuleSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          api_id: 'bad_req',
          error: parsed.error.issues[0]?.message || 'Invalid itinerary rule parameters',
          details: parsed.error.issues,
        },
        { status: 400 }
      );
    }

    const updateData: any = {};
    if (parsed.data.title !== undefined) updateData.title = parsed.data.title;
    if (parsed.data.description !== undefined) updateData.description = parsed.data.description;
    if (parsed.data.category !== undefined) updateData.category = parsed.data.category;
    if (parsed.data.rulePrompt !== undefined) updateData.rulePrompt = parsed.data.rulePrompt;
    if (parsed.data.condition !== undefined) updateData.condition = parsed.data.condition;
    if (parsed.data.priority !== undefined) updateData.priority = parsed.data.priority;
    if (parsed.data.isActive !== undefined) updateData.isActive = parsed.data.isActive;

    const updated = await db.itineraryRule.update({
      where: { id: existing.id },
      data: updateData,
    });

    await logAuditEvent({
      organizationId: auth!.organizationId,
      actorUserId: auth!.userId,
      action: 'settings.itinerary_rule.update',
      targetType: 'ItineraryRule',
      targetId: updated.id,
      metadata: { updatedFields: Object.keys(updateData), title: updated.title },
    });

    return NextResponse.json({
      api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
      message: 'Itinerary preparation rule updated successfully',
      rule: updated,
    });
  } catch (err: any) {
    console.error('Error updating itinerary rule:', err);
    return NextResponse.json(
      { api_id: 'server_err', error: err.message || 'Internal error updating itinerary rule' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { auth, errorResponse } = await authenticateRequest(req, 'operator');
  if (errorResponse) return errorResponse;

  const { id } = await params;
  const existing = await db.itineraryRule.findFirst({
    where: { id, organizationId: auth!.organizationId },
  });

  if (!existing) {
    return NextResponse.json({ api_id: 'not_found', error: 'Itinerary rule not found' }, { status: 404 });
  }

  try {
    await db.itineraryRule.delete({
      where: { id: existing.id },
    });

    await logAuditEvent({
      organizationId: auth!.organizationId,
      actorUserId: auth!.userId,
      action: 'settings.itinerary_rule.delete',
      targetType: 'ItineraryRule',
      targetId: existing.id,
      metadata: { title: existing.title },
    });

    return NextResponse.json({
      api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
      message: 'Itinerary preparation rule deleted successfully',
    });
  } catch (err: any) {
    console.error('Error deleting itinerary rule:', err);
    return NextResponse.json(
      { api_id: 'server_err', error: err.message || 'Internal error deleting itinerary rule' },
      { status: 500 }
    );
  }
}
