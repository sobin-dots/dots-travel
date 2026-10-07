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
  const { auth, errorResponse } = await authenticateRequest(req, 'admin');
  if (errorResponse) return errorResponse;

  const { id } = await params;
  const recording = await db.recording.findFirst({
    where: { id, organizationId: auth!.organizationId },
  });

  if (!recording) {
    return NextResponse.json(
      { api_id: 'not_found', error: 'Recording not found' },
      { status: 404 }
    );
  }

  try {
    const provider = getTelephonyProvider();
    await provider.deleteRecording(recording.plivoRecordingId);

    const updated = await db.recording.update({
      where: { id },
      data: {
        status: 'deleted',
        deletedAt: new Date(),
      },
    });

    await logAuditEvent({
      organizationId: auth!.organizationId,
      actorUserId: auth!.userId,
      action: 'recording.delete',
      targetType: 'Recording',
      targetId: id,
    });

    return NextResponse.json({
      api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
      message: 'Recording deleted successfully',
      recording: updated,
    });
  } catch (err: any) {
    return NextResponse.json(
      { api_id: 'provider_err', error: err.message },
      { status: 500 }
    );
  }
}
