import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { authenticateRequest, logAuditEvent } from '@/lib/api-auth';
import { getTelephonyProvider } from '@/lib/telephony';

export const runtime = 'nodejs';

export async function POST(
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
    const transcriptionType = call.transcriptionEnabled ? 'auto' : undefined;
    const res = await provider.startCallRecording(call.plivoCallUuid, {
      transcriptionType,
    });

    await db.call.update({
      where: { id },
      data: { recordingEnabled: true },
    });

    await logAuditEvent({
      organizationId: auth!.organizationId,
      actorUserId: auth!.userId,
      action: 'call.record_start',
      targetType: 'Call',
      targetId: id,
    });

    return NextResponse.json({
      api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
      message: 'Call recording started',
      recordingId: res.recordingId,
    });
  } catch (err: any) {
    return NextResponse.json(
      { api_id: 'provider_err', error: err.message },
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
    await provider.stopCallRecording(call.plivoCallUuid);

    await logAuditEvent({
      organizationId: auth!.organizationId,
      actorUserId: auth!.userId,
      action: 'call.record_stop',
      targetType: 'Call',
      targetId: id,
    });

    return NextResponse.json({
      api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
      message: 'Call recording stopped',
    });
  } catch (err: any) {
    return NextResponse.json(
      { api_id: 'provider_err', error: err.message },
      { status: 500 }
    );
  }
}
