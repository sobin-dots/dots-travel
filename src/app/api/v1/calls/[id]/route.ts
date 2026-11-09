import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-auth';
import { getTenantIntegration } from '@/lib/integrations/credentials-manager';
import { transcribeAudioFromUrl } from '@/lib/openai-transcribe';

import * as plivo from 'plivo';

export const runtime = 'nodejs';

const inFlightCallSyncs = new Map<string, Promise<void>>();

interface CallSyncState {
  recordingChecked: boolean;
  recordingError?: string;
  transcriptionAttempted: boolean;
  transcriptionError?: string;
  updatedAt: number;
}

const callSyncStateByCallId = new Map<string, CallSyncState>();

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

  const url = new URL(req.url);
  const fastMode = url.searchParams.get('fast') === 'true';
  const retryMode = url.searchParams.get('retry') === 'true';

  if (retryMode) {
    callSyncStateByCallId.delete(call.id);
  }

  const getOrInitSyncState = (callId: string): CallSyncState => {
    const existing = callSyncStateByCallId.get(callId);
    if (existing) return existing;
    const init: CallSyncState = {
      recordingChecked: false,
      transcriptionAttempted: false,
      updatedAt: Date.now(),
    };
    callSyncStateByCallId.set(callId, init);
    return init;
  };

  const runCarrierAndOpenAiSync = async (targetCall: NonNullable<typeof call>) => {
    let currentCall: typeof call = targetCall;
    const state = getOrInitSyncState(currentCall.id);
    state.updatedAt = Date.now();

    // Carrier Realtime Sync: If call has no recordings yet, query Plivo API once (or when in-progress / manual retry)
    if (
      currentCall.recordings.length === 0 &&
      currentCall.plivoCallUuid &&
      (retryMode || currentCall.status === 'in-progress' || !state.recordingChecked)
    ) {
      let plivoAuthId = process.env.PLIVO_AUTH_ID;
      let plivoAuthToken = process.env.PLIVO_AUTH_TOKEN;

      try {
        const tenantPlivo = await getTenantIntegration(currentCall.organizationId, 'plivo');
        if (tenantPlivo?.credentials?.authId && tenantPlivo?.credentials?.authToken) {
          plivoAuthId = tenantPlivo.credentials.authId;
          plivoAuthToken = tenantPlivo.credentials.authToken;
        }
      } catch {}

      if (plivoAuthId && plivoAuthToken) {
        try {
          const client = new (plivo as any).Client(plivoAuthId, plivoAuthToken);
          const plivoRecs = await client.recordings.list({ call_uuid: currentCall.plivoCallUuid });
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
                  organizationId: currentCall.organizationId,
                  callId: currentCall.id,
                  plivoRecordingId: rec.recordingId,
                  recordingUrl: rec.recordingUrl,
                  durationSeconds: Number(rec.recordingDuration || 0),
                  status: 'completed',
                },
              });
            }
            currentCall = await db.call.findFirst({
              where: { id: currentCall.id },
              include: {
                phoneNumber: true,
                events: { orderBy: { occurredAt: 'asc' } },
                recordings: { include: { transcriptions: true } },
                transcriptions: true,
              },
            });
            state.recordingError = undefined;
          }
          if (currentCall && currentCall.status !== 'in-progress') {
            state.recordingChecked = true;
          }
        } catch (err: any) {
          console.warn('Live recording sync notice:', err.message);
          state.recordingChecked = true;
          state.recordingError = err.message || 'Failed to sync recording from carrier';
        }
      } else {
        state.recordingChecked = true;
      }
    } else if (currentCall.recordings.length === 0 && !currentCall.plivoCallUuid) {
      state.recordingChecked = true;
    }

    // Direct OpenAI Auto-Transcription: Attempt once per call (unless manual retry)
    if (
      currentCall &&
      currentCall.recordings.length > 0 &&
      !currentCall.transcriptions.some(
        (t) => t.source === 'openai_whisper' && t.text && t.text.trim().length > 0
      ) &&
      (retryMode || !state.transcriptionAttempted)
    ) {
      state.transcriptionAttempted = true;
      const latestRec = currentCall.recordings[0];
      if (latestRec?.recordingUrl && latestRec.recordingUrl.startsWith('http')) {
        try {
          const result = await transcribeAudioFromUrl(latestRec.recordingUrl, {
            organizationId: currentCall.organizationId,
          });
          if (result.text && result.text.trim().length > 0) {
            const existingTr = await db.transcription.findFirst({
              where: {
                recordingId: latestRec.id,
                organizationId: currentCall.organizationId,
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
                  organizationId: currentCall.organizationId,
                  recordingId: latestRec.id,
                  callId: currentCall.id,
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
            state.transcriptionError = undefined;
          } else {
            state.transcriptionError = 'No speech detected in audio recording.';
          }
        } catch (err: any) {
          console.warn('[Auto OpenAI Transcription] Sync notice:', err.message);
          state.transcriptionError = err.message || 'OpenAI transcription failed.';
        }
      } else {
        state.transcriptionError = 'Audio recording URL is unavailable or invalid.';
      }
    }
  };

  const currentSyncState = callSyncStateByCallId.get(call.id);
  const shouldSyncRecording =
    call.recordings.length === 0 &&
    Boolean(call.plivoCallUuid) &&
    (retryMode || call.status === 'in-progress' || !currentSyncState?.recordingChecked);

  const shouldSyncTranscription =
    call.recordings.length > 0 &&
    !call.transcriptions.some(
      (t) => t.source === 'openai_whisper' && t.text && t.text.trim().length > 0
    ) &&
    (retryMode || !currentSyncState?.transcriptionAttempted);

  const needsSync = shouldSyncRecording || shouldSyncTranscription;

  if (needsSync) {
    let syncPromise = inFlightCallSyncs.get(call.id);
    if (!syncPromise) {
      syncPromise = runCarrierAndOpenAiSync(call).finally(() => {
        inFlightCallSyncs.delete(call!.id);
      });
      inFlightCallSyncs.set(call.id, syncPromise);
    }

    if (!fastMode) {
      await syncPromise;
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
  }

  if (!call) {
    return NextResponse.json({ api_id: 'not_found', error: 'Call not found' }, { status: 404 });
  }

  const finalSyncState = callSyncStateByCallId.get(call.id);

  const isRecordingProcessing =
    call.recordings.length === 0 &&
    call.status === 'in-progress' &&
    !finalSyncState?.recordingError;

  const isTranscriptionProcessing =
    call.recordings.length > 0 &&
    call.transcriptions.length === 0 &&
    !finalSyncState?.transcriptionAttempted &&
    !finalSyncState?.transcriptionError;

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
      recordingError: finalSyncState?.recordingError || null,
      transcriptionError: finalSyncState?.transcriptionError || null,
      hangupExplanation: getHangupExplanation(call.hangupCauseCode),
    },
  });
}
