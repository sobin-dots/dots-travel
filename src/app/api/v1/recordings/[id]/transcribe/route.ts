import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { authenticateRequest, logAuditEvent } from '@/lib/api-auth';
import { getTelephonyProvider } from '@/lib/telephony';
import {
  transcribeAudioWithOpenAi,
  generateSyntheticWavBuffer,
  normalizeToIso639_1,
} from '@/lib/openai-transcribe';

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

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    // Body is optional
  }

  const url = new URL(req.url);
  const requestedProvider =
    body.provider ||
    url.searchParams.get('provider') ||
    (process.env.OPENAI_API_KEY ? 'openai' : 'plivo');

  // ─────────────────────────────────────────────────────────────
  // 1. OPENAI WHISPER TRANSCRIPTION
  // ─────────────────────────────────────────────────────────────
  if (requestedProvider === 'openai') {
    try {
      let audioBuffer: Buffer | null = null;
      let filename = `recording_${recording.id}.mp3`;
      let downloadError: string | null = null;
      let contentType = '';

      // Attempt to download the audio from the recording URL
      if (recording.recordingUrl && recording.recordingUrl.startsWith('http')) {
        try {
          const fetchHeaders: Record<string, string> = {
            'User-Agent': 'Pilvo-Downloader/1.0',
            'ngrok-skip-browser-warning': 'true',
          };
          let audioRes = await fetch(recording.recordingUrl, { headers: fetchHeaders });

          // If carrier requires basic auth, retry with Plivo credentials
          if (
            !audioRes.ok &&
            (audioRes.status === 401 || audioRes.status === 403) &&
            process.env.PLIVO_AUTH_ID &&
            process.env.PLIVO_AUTH_TOKEN
          ) {
            const basicAuth = Buffer.from(
              `${process.env.PLIVO_AUTH_ID}:${process.env.PLIVO_AUTH_TOKEN}`
            ).toString('base64');
            audioRes = await fetch(recording.recordingUrl, {
              headers: { ...fetchHeaders, Authorization: `Basic ${basicAuth}` },
            });
          }

          if (audioRes.ok) {
            contentType = audioRes.headers.get('content-type') || '';
            // Reject HTML/XML error pages served with 200 OK (e.g. ngrok interstitial or web portal errors)
            if (
              contentType.includes('text/html') ||
              contentType.includes('application/xhtml') ||
              contentType.includes('application/xml')
            ) {
              downloadError = `Carrier URL returned ${contentType} document instead of audio. If using ngrok, ensure ngrok warnings are bypassed.`;
            } else {
              const arrayBuf = await audioRes.arrayBuffer();
              if (arrayBuf.byteLength > 1000) {
                audioBuffer = Buffer.from(arrayBuf);
                if (contentType.includes('wav')) {
                  filename = `recording_${recording.id}.wav`;
                }
              } else {
                downloadError = `Downloaded audio file is suspiciously small (${arrayBuf.byteLength} bytes) or empty.`;
              }
            }
          } else {
            downloadError = `Carrier recording URL returned HTTP ${audioRes.status} ${audioRes.statusText}`;
          }
        } catch (fetchErr: any) {
          downloadError = `Failed to connect to carrier recording URL: ${fetchErr.message}`;
        }
      } else {
        downloadError = 'Recording does not have a valid HTTP recording URL';
      }

      // If audio file could not be downloaded, return error instead of sending a synthetic sine wave tone.
      // Feeding a 440Hz synthetic beep/silence to OpenAI Whisper triggers language misdetection and repetitive Tamil hallucinations!
      if (!audioBuffer) {
        return NextResponse.json(
          {
            api_id: 'media_not_found',
            error:
              downloadError ||
              'Could not retrieve recording audio file from carrier. The recording may still be encoding on Plivo servers.',
            recordingUrl: recording.recordingUrl,
          },
          { status: 400 }
        );
      }

      // Explicitly define target language in ISO-639-1 (e.g. 'ta', 'en', 'hi')
      const rawLanguage =
        body.language ||
        recording.call?.transcriptionLanguage ||
        'en';
      const effectiveLanguage = normalizeToIso639_1(rawLanguage) || 'en';

      const requestedModel = body.model || 'large-v3';

      console.log(
        `[Transcription] Sending recording ${recording.id} (${audioBuffer.length} bytes, type: ${contentType || 'audio/mpeg'}, language: ${effectiveLanguage}, model: ${requestedModel}) to OpenAI Whisper`
      );

      // Call OpenAI Whisper API
      const result = await transcribeAudioWithOpenAi(audioBuffer, filename, {
        apiKey: body.apiKey,
        model: requestedModel,
        language: effectiveLanguage,
        prompt: body.prompt || 'Customer and agent telephone travel consultation.',
      });

      // Upsert Transcription record in database
      const existingTranscription = await db.transcription.findFirst({
        where: {
          recordingId: recording.id,
          organizationId: auth!.organizationId,
        },
      });

      let transcription;
      if (existingTranscription) {
        transcription = await db.transcription.update({
          where: { id: existingTranscription.id },
          data: {
            text: result.text,
            status: 'completed',
            language: result.language || 'en',
            wordCount: (result.text || '').split(/\s+/).filter(Boolean).length,
            segments: result.segments as any || null,
            source: 'openai_whisper',
            rawPayload: result.rawPayload,
            updatedAt: new Date(),
          },
        });
      } else {
        transcription = await db.transcription.create({
          data: {
            organizationId: auth!.organizationId,
            recordingId: recording.id,
            callId: recording.callId,
            plivoTranscriptionId: `whisper_${crypto.randomBytes(8).toString('hex')}`,
            recordingSid: recording.plivoRecordingId,
            type: 'transcription',
            status: 'completed',
            language: result.language || 'en',
            text: result.text,
            segments: result.segments as any || null,
            wordCount: (result.text || '').split(/\s+/).filter(Boolean).length,
            source: 'openai_whisper',
            rawPayload: result.rawPayload,
          },
        });
      }

      // Mark transcription on call record
      if (recording.callId) {
        await db.call.update({
          where: { id: recording.callId },
          data: {
            transcriptionEnabled: true,
            transcriptionLanguage: result.language || 'en',
          },
        });
      }

      await logAuditEvent({
        organizationId: auth!.organizationId,
        actorUserId: auth!.userId,
        action: 'transcription.create_openai',
        targetType: 'Recording',
        targetId: recording.id,
        metadata: {
          recordingId: recording.plivoRecordingId,
          transcriptionId: transcription.id,
          wordCount: transcription.wordCount,
          language: transcription.language,
        },
      });

      return NextResponse.json({
        api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
        message: 'Transcription generated successfully with OpenAI Whisper',
        transcription,
      });
    } catch (err: any) {
      console.error('OpenAI transcription error:', err);
      return NextResponse.json(
        {
          api_id: 'openai_err',
          error: err.message || 'Failed to generate transcription with OpenAI',
        },
        { status: 500 }
      );
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 2. PLIVO NATIVE TRANSCRIPTION FALLBACK
  // ─────────────────────────────────────────────────────────────
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
      message: 'On-demand Plivo transcription requested successfully',
      transcription,
    });
  } catch (err: any) {
    return NextResponse.json(
      { api_id: 'provider_err', error: err.message },
      { status: 500 }
    );
  }
}
