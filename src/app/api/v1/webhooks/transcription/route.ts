import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { processIncomingWebhook } from '@/lib/webhook-helper';
import { transcribeAudioFromUrl } from '@/lib/openai-transcribe';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const result = await processIncomingWebhook(req, 'transcription', (p) => {
    return p.transcription_id || p.recording_id || `tr_${Date.now()}`;
  });

  if (!result.valid) return result.errorResponse!;
  if (result.isDuplicate) {
    return NextResponse.json({ status: 'already_processed' }, { status: 200 });
  }

  const { params, webhookEventId } = result;
  const recordingId = params.recording_id || params.recordingId;

  try {
    // Plivo carrier transcription is disabled; ensure OpenAI transcription is generated directly from the recording URL if needed
    if (recordingId) {
      const recording = await db.recording.findUnique({
        where: { plivoRecordingId: recordingId },
      });
      if (recording?.recordingUrl && recording.organizationId) {
        const existingWhisper = await db.transcription.findFirst({
          where: {
            recordingId: recording.id,
            source: 'openai_whisper',
          },
        });
        if (!existingWhisper) {
          const whisperResult = await transcribeAudioFromUrl(recording.recordingUrl, {
            organizationId: recording.organizationId,
          });
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
                organizationId: recording.organizationId,
                recordingId: recording.id,
                callId: recording.callId,
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
        }
      }
    }

    if (webhookEventId) {
      await db.webhookEvent.update({
        where: { id: webhookEventId },
        data: { status: 'processed', processedAt: new Date() },
      });
    }
  } catch (err) {
    console.error('Error handling transcription webhook:', err);
  }

  return NextResponse.json({ status: 'ok' }, { status: 200 });
}
