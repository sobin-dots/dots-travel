import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { processIncomingWebhook } from '@/lib/webhook-helper';
import { transcribeAudioFromUrl } from '@/lib/openai-transcribe';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const result = await processIncomingWebhook(req, 'recording', (p) => {
    return p.recording_id || p.RecordingID || p.recording_url || `rec_${Date.now()}`;
  });

  if (!result.valid) return result.errorResponse!;
  if (result.isDuplicate) {
    return NextResponse.json({ status: 'already_processed' }, { status: 200 });
  }

  const { params, webhookEventId } = result;
  const recordingId = params.recording_id || params.RecordingID || params.recordingId;
  const recordingUrl = params.record_url || params.recording_url || params.RecordUrl;
  const duration = params.recording_duration ? Number(params.recording_duration) : undefined;
  const callUuid = params.call_uuid || params.CallUUID;

  if (!recordingId || !recordingUrl) {
    return NextResponse.json({ status: 'ignored_missing_data' }, { status: 200 });
  }

  try {
    let call: any = null;
    let organizationId: string | null = null;

    if (callUuid) {
      call = await db.call.findUnique({
        where: { plivoCallUuid: callUuid },
      });
      if (call) organizationId = call.organizationId;
    }

    if (!organizationId) {
      const firstOrg = await db.organization.findFirst();
      organizationId = firstOrg?.id || null;
    }

    if (organizationId) {
      const recRecord = await db.recording.upsert({
        where: { plivoRecordingId: recordingId },
        update: {
          recordingUrl,
          durationSeconds: duration,
          status: 'completed',
        },
        create: {
          organizationId,
          callId: call?.id,
          plivoRecordingId: recordingId,
          recordingUrl,
          durationSeconds: duration,
          status: 'completed',
        },
      });

      // Automatically trigger OpenAI Whisper transcription for full-call fidelity
      if (process.env.OPENAI_API_KEY && recordingUrl) {
        transcribeAudioFromUrl(recordingUrl)
          .then(async (whisperResult) => {
            if (whisperResult.text) {
              const whisperId = `whisper_${recordingId}`;
              await db.transcription.upsert({
                where: { plivoTranscriptionId: whisperId },
                update: {
                  text: whisperResult.text,
                  status: 'completed',
                  wordCount: whisperResult.text.split(/\s+/).filter(Boolean).length,
                  source: 'openai_whisper',
                  rawPayload: whisperResult.rawPayload,
                },
                create: {
                  organizationId,
                  recordingId: recRecord.id,
                  callId: call?.id,
                  plivoTranscriptionId: whisperId,
                  recordingSid: recordingId,
                  status: 'completed',
                  text: whisperResult.text,
                  wordCount: whisperResult.text.split(/\s+/).filter(Boolean).length,
                  source: 'openai_whisper',
                  rawPayload: whisperResult.rawPayload,
                },
              });
            }
          })
          .catch((e) => console.warn('[Auto-Whisper] Notice:', e.message));
      }

      if (call) {
        await db.callEvent.create({
          data: {
            organizationId,
            callId: call.id,
            eventType: 'recording',
            payload: params,
            occurredAt: new Date(),
            webhookEventId,
          },
        });
      }
    }

    if (webhookEventId) {
      await db.webhookEvent.update({
        where: { id: webhookEventId },
        data: { status: 'processed', processedAt: new Date() },
      });
    }
  } catch (err) {
    console.error('Error handling recording webhook:', err);
  }

  return NextResponse.json({ status: 'ok' }, { status: 200 });
}
