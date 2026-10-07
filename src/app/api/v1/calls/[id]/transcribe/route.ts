import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-auth';
import * as plivo from 'plivo';

export const runtime = 'nodejs';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { auth, errorResponse } = await authenticateRequest(req, 'operator');
  if (errorResponse) return errorResponse;

  const { id } = await params;
  let call = await db.call.findFirst({
    where: { id, organizationId: auth!.organizationId },
    include: {
      recordings: {
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!call) {
    return NextResponse.json(
      { api_id: 'not_found', error: 'Call record not found' },
      { status: 404 }
    );
  }

  // If no recording in DB yet, try to discover recordings from Plivo carrier
  if (call.recordings.length === 0 && call.plivoCallUuid) {
    if (process.env.PLIVO_AUTH_ID && process.env.PLIVO_AUTH_TOKEN) {
      try {
        const client = new (plivo as any).Client(process.env.PLIVO_AUTH_ID, process.env.PLIVO_AUTH_TOKEN);
        const plivoRecs = await client.recordings.list({ call_uuid: call.plivoCallUuid });
        if (plivoRecs && Array.isArray(plivoRecs) && plivoRecs.length > 0) {
          for (const rec of plivoRecs) {
            await db.recording.upsert({
              where: { plivoRecordingId: rec.recordingId },
              update: {
                recordingUrl: rec.recordingUrl,
                durationSeconds: Number(rec.recordingDuration || 0),
                status: 'completed',
              },
              create: {
                organizationId: call.organizationId,
                callId: call.id,
                plivoRecordingId: rec.recordingId,
                recordingUrl: rec.recordingUrl,
                durationSeconds: Number(rec.recordingDuration || 0),
                status: 'completed',
              },
            });
          }
          call = await db.call.findFirst({
            where: { id: call.id },
            include: { recordings: { orderBy: { createdAt: 'desc' } } },
          });
        }
      } catch (err: any) {
        console.warn('[Call Transcribe] Recording sync note:', err.message);
      }
    }
  }

  if (!call || call.recordings.length === 0) {
    return NextResponse.json(
      { api_id: 'no_recording', error: 'No recording found for this call yet to transcribe.' },
      { status: 400 }
    );
  }

  const latestRecording = call.recordings[0];

  // Forward the request body to the recording transcription route handler
  let body: any = {};
  try {
    body = await req.json();
  } catch {}

  const url = new URL(req.url);
  const provider = body.provider || url.searchParams.get('provider') || 'plivo';

  const recUrl = new URL(`/api/v1/recordings/${latestRecording.id}/transcribe`, req.url);
  const authHeader = req.headers.get('authorization') || '';
  const response = await fetch(recUrl.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(authHeader ? { Authorization: authHeader } : {}),
    },
    body: JSON.stringify({ ...body, provider }),
  });
  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}
