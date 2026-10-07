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
  const recording = await db.recording.findFirst({
    where: { id, organizationId: auth!.organizationId },
    include: { call: true },
  });

  if (!recording) {
    return NextResponse.json(
      { api_id: 'not_found', error: 'Recording not found' },
      { status: 404 }
    );
  }

  try {
    const provider = getTelephonyProvider();
    const publicBase = process.env.PUBLIC_BASE_URL || 'http://localhost:3000';
    const transcriptionUrl = `${publicBase}/api/v1/webhooks/transcription`;

    const res = await provider.createTranscription(recording.plivoRecordingId, {
      transcriptionType: 'auto',
      transcriptionUrl,
    });

    const transcription = await db.transcription.create({
      data: {
        organizationId: auth!.organizationId,
        recordingId: recording.id,
        callId: recording.callId,
        plivoTranscriptionId: res.transcriptionId,
        recordingSid: recording.plivoRecordingId,
        status: res.status,
        source: 'on_demand',
      },
    });

    await logAuditEvent({
      organizationId: auth!.organizationId,
      actorUserId: auth!.userId,
      action: 'transcription.create_on_demand',
      targetType: 'Recording',
      targetId: recording.id,
      metadata: { recordingId: recording.plivoRecordingId, transcriptionId: res.transcriptionId },
    });

    return NextResponse.json({
      api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
      message: 'On-demand transcription requested successfully',
      transcription,
    });
  } catch (err: any) {
    return NextResponse.json(
      { api_id: 'provider_err', error: err.message },
      { status: 500 }
    );
  }
}
