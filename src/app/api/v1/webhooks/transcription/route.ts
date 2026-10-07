import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { processIncomingWebhook } from '@/lib/webhook-helper';

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
  const transcriptionId = params.transcription_id || params.transcriptionId;
  const recordingId = params.recording_id || params.recordingId;
  const status = (params.status || 'completed').toLowerCase();
  const text = (params.transcription || params.text || params.transcription_text || '').trim();
  const wordCount = text ? text.split(/\s+/).filter(Boolean).length : undefined;

  if (!recordingId && !transcriptionId) {
    return NextResponse.json({ status: 'ignored_missing_data' }, { status: 200 });
  }

  try {
    let recording: any = null;
    if (recordingId) {
      recording = await db.recording.findUnique({
        where: { plivoRecordingId: recordingId },
      });
    }

    const organizationId = recording?.organizationId || (await db.organization.findFirst())?.id;

    // Do not overwrite high-fidelity OpenAI Whisper transcription with Plivo voicemail snippet
    if (recording?.id) {
      const existingWhisper = await db.transcription.findFirst({
        where: {
          recordingId: recording.id,
          source: 'openai_whisper',
        },
      });
      if (existingWhisper && (existingWhisper.wordCount || 0) > 5) {
        console.log(`[Transcription Webhook] Retaining OpenAI Whisper transcription for recording ${recording.id}`);
        return NextResponse.json({ status: 'retained_whisper_transcript' }, { status: 200 });
      }
    }

    if (organizationId) {
      if (transcriptionId) {
        await db.transcription.upsert({
          where: { plivoTranscriptionId: transcriptionId },
          update: {
            status,
            text,
            wordCount,
          },
          create: {
            organizationId,
            recordingId: recording?.id,
            callId: recording?.callId,
            plivoTranscriptionId: transcriptionId,
            recordingSid: recordingId,
            status,
            text,
            wordCount,
          },
        });
      } else if (recording) {
        await db.transcription.create({
          data: {
            organizationId,
            recordingId: recording.id,
            callId: recording.callId,
            plivoTranscriptionId: `tr_callback_${Date.now()}`,
            recordingSid: recordingId,
            status,
            text,
            wordCount,
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
    console.error('Error handling transcription webhook:', err);
  }

  return NextResponse.json({ status: 'ok' }, { status: 200 });
}
