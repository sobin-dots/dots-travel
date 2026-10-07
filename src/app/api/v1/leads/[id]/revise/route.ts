import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { authenticateRequest, logAuditEvent } from '@/lib/api-auth';
import { reviseItineraryWithDeepSeek } from '@/lib/deepseek';

export const runtime = 'nodejs';

export async function POST(
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

  try {
    const body = await req.json();
    const notes = body.correctionNotes || body.revisionNotes;

    if (!notes) {
      return NextResponse.json(
        { api_id: 'val_err', error: 'Please enter revision or correction notes' },
        { status: 400 }
      );
    }

    const revisedItinerary = await reviseItineraryWithDeepSeek(lead.itinerary, notes);

    const updated = await db.lead.update({
      where: { id: lead.id },
      data: {
        itinerary: revisedItinerary,
        revisionNotes: lead.revisionNotes
          ? `${lead.revisionNotes}\n---\n${notes}`
          : notes,
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
      action: 'lead.revise_itinerary',
      targetType: 'Lead',
      targetId: lead.id,
      metadata: { notes },
    });

    return NextResponse.json({
      api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
      lead: updated,
      message: 'Itinerary revised with DeepSeek successfully',
    });
  } catch (err: any) {
    console.error('Error revising itinerary:', err);
    return NextResponse.json(
      { api_id: 'server_err', error: err.message || 'Internal error revising itinerary' },
      { status: 500 }
    );
  }
}
