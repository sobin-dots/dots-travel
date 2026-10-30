import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-auth';
import { getTenantIntegration } from '@/lib/integrations/credentials-manager';
import { transcribeAudioFromUrl } from '@/lib/openai-transcribe';

import * as plivo from 'plivo';

export const runtime = 'nodejs';

function getHangupExplanation(code?: number | null): string {
  if (!code) return 'Call ended or not yet completed';
  if (code >= 4000 && code < 4100) return 'Normal Call Completion: The call was cleanly terminated by caller or callee.';
  if (code === 5030) return 'Concurrency Limit Exceeded: Account reached maximum concurrent call channels.';
  if (code === 8011) return 'Invalid Answer XML: The answer URL returned invalid or unparseable Plivo XML.';
  if (code >= 1000 && code < 2000) return 'Account / Billing: Insufficient credits or account permissions.';
  if (code >= 2000 && code < 3000) return 'Invalid Destination: The destination number is unallocated, invalid, or barred.';
  if (code >= 3000 && code < 4000) return 'User Busy / No Answer: The recipient declined or did not answer within timeout.';
  return `Plivo Hangup Code ${code}`;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { auth, errorResponse } = await authenticateRequest(req, 'viewer');
  if (errorResponse) return errorResponse;

  const { id } = await params;
  let call = await db.call.findFirst({
    where: {
      id,
      organizationId: auth!.organizationId,
    },
    include: {
      phoneNumber: true,
      events: {
        orderBy: { occurredAt: 'asc' },
      },
      recordings: {
        include: {
          transcriptions: true,
        },
      },
      transcriptions: true,
    },
  });

  if (!call) {
    return NextResponse.json(
      { api_id: 'not_found', error: 'Call record not found' },
      { status: 404 }
    );
  }

  // Carrier Realtime Sync: If call has no recordings yet, query Plivo API for any pending recordings
  if (call.recordings.length === 0 && call.plivoCallUuid) {
    let plivoAuthId = process.env.PLIVO_AUTH_ID;
    let plivoAuthToken = process.env.PLIVO_AUTH_TOKEN;

    try {
      const tenantPlivo = await getTenantIntegration(call.organizationId, 'plivo');
      if (tenantPlivo?.credentials?.authId && tenantPlivo?.credentials?.authToken) {
        plivoAuthId = tenantPlivo.credentials.authId;
        plivoAuthToken = tenantPlivo.credentials.authToken;
      }
    } catch {}

    if (plivoAuthId && plivoAuthToken) {
      try {
        const client = new (plivo as any).Client(plivoAuthId, plivoAuthToken);
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
          // Reload updated call
          call = await db.call.findFirst({
            where: { id: call.id },
            include: {
              phoneNumber: true,
              events: { orderBy: { occurredAt: 'asc' } },
              recordings: { include: { transcriptions: true } },
              transcriptions: true,
            },
          });
        }
      } catch (err: any) {
        console.warn('Live recording sync notice:', err.message);
      }
    }
  }

  // Direct OpenAI Auto-Transcription: If call has a recording and no OpenAI transcription yet, transcribe directly using OpenAI
  if (
    call &&
    call.recordings.length > 0 &&
    !call.transcriptions.some((t) => t.source === 'openai_whisper' && t.text && t.text.trim().length > 0)
  ) {
    const latestRec = call.recordings[0];
    if (latestRec?.recordingUrl && latestRec.recordingUrl.startsWith('http')) {
      try {
        const result = await transcribeAudioFromUrl(latestRec.recordingUrl, {
          organizationId: call.organizationId,
        });
        if (result.text) {
          const existingTr = await db.transcription.findFirst({
            where: {
              recordingId: latestRec.id,
              organizationId: call.organizationId,
            },
          });
          if (existingTr) {
            await db.transcription.update({
              where: { id: existingTr.id },
              data: {
                text: result.text,
                status: 'completed',
                language: result.language || 'en',
                wordCount: result.text.split(/\s+/).filter(Boolean).length,
                source: 'openai_whisper',
                rawPayload: result.rawPayload,
                updatedAt: new Date(),
              },
            });
          } else {
            await db.transcription.create({
              data: {
                organizationId: call.organizationId,
                recordingId: latestRec.id,
                callId: call.id,
                plivoTranscriptionId: `whisper_${latestRec.plivoRecordingId || crypto.randomBytes(6).toString('hex')}`,
                recordingSid: latestRec.plivoRecordingId,
                type: 'transcription',
                status: 'completed',
                language: result.language || 'en',
                text: result.text,
                wordCount: result.text.split(/\s+/).filter(Boolean).length,
                source: 'openai_whisper',
                rawPayload: result.rawPayload,
              },
            });
          }
          call = await db.call.findFirst({
            where: { id: call.id },
            include: {
              phoneNumber: true,
              events: { orderBy: { occurredAt: 'asc' } },
              recordings: { include: { transcriptions: true } },
              transcriptions: true,
            },
          });
        }
      } catch (err: any) {
        console.warn('[Auto OpenAI Transcription] Sync notice:', err.message);
      }
    }
  }

  if (!call) {
    return NextResponse.json({ api_id: 'not_found', error: 'Call not found' }, { status: 404 });
  }

  const isRecordingProcessing =
    call.recordings.length === 0 &&
    (call.status === 'in-progress' || call.recordingEnabled || call.status === 'completed');

  const isTranscriptionProcessing =
    call.transcriptions.length === 0 &&
    (call.status === 'in-progress' || call.transcriptionEnabled || call.status === 'completed');

  return NextResponse.json({
    api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
    call: {
      ...call,
      recordings: call.recordings.map((rec) => ({
        ...rec,
        streamUrl: `/api/v1/recordings/${rec.id}/stream`,
      })),
      isRecordingProcessing,
      isTranscriptionProcessing,
      hangupExplanation: getHangupExplanation(call.hangupCauseCode),
    },
  });
}
