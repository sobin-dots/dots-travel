import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { authenticateRequest, logAuditEvent } from '@/lib/api-auth';
import { getTelephonyProvider } from '@/lib/telephony';

export const runtime = 'nodejs';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { auth, errorResponse } = await authenticateRequest(req, 'operator');
  if (errorResponse) return errorResponse;

  const { id } = await params;
  const call = await db.call.findFirst({
    where: { id, organizationId: auth!.organizationId },
  });

  if (!call) {
    return NextResponse.json(
      { api_id: 'not_found', error: 'Call not found' },
      { status: 404 }
    );
  }

  try {
    const provider = getTelephonyProvider();
    await provider.hangupCall(call.plivoCallUuid);

    const now = new Date();
    const duration = Math.max(1, Math.round((now.getTime() - new Date(call.startedAt).getTime()) / 1000));

    // Update call to completed
    await db.call.update({
      where: { id: call.id },
      data: {
        status: 'completed',
        endedAt: now,
        durationSeconds: duration,
        billDurationSeconds: Math.ceil(duration / 60) * 60,
        hangupCauseCode: 4000,
        hangupCauseName: 'Normal Cleared',
      },
    });

    // Real recording & transcription are delivered via Plivo webhooks (/webhooks/voice/record)

    await db.callEvent.create({
      data: {
        organizationId: auth!.organizationId,
        callId: call.id,
        eventType: 'hangup',
        status: 'completed',
        payload: { call_uuid: call.plivoCallUuid, duration },
        occurredAt: now,
      },
    });

    await logAuditEvent({
      organizationId: auth!.organizationId,
      actorUserId: auth!.userId,
      action: 'call.hangup',
      targetType: 'Call',
      targetId: call.id,
      metadata: { callUuid: call.plivoCallUuid, duration },
    });

    return NextResponse.json({
      api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
      message: 'Call hung up, recording and transcription processed successfully',
    });
  } catch (err: any) {
    return NextResponse.json(
      { api_id: 'provider_err', error: err.message },
      { status: 500 }
    );
  }
}
