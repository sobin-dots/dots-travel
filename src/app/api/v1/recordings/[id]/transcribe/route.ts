import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { authenticateRequest, logAuditEvent } from '@/lib/api-auth';
import { getTelephonyProvider } from '@/lib/telephony';
import {
  transcribeAudioFromUrl,
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
      if (!recording.recordingUrl || !recording.recordingUrl.startsWith('http')) {
        return NextResponse.json(
          {
            api_id: 'media_not_found',
            error: 'Recording does not have a valid HTTP recording URL',
            recordingUrl: recording.recordingUrl,
          },
          { status: 400 }
        );
      }

      let effectiveLanguage: string | undefined = undefined;
      if (body.language && body.language !== 'auto' && body.language !== 'mixed') {
        effectiveLanguage = normalizeToIso639_1(body.language);
      }

      const requestedModel = body.model || process.env.OPENAI_TRANSCRIPTION_MODEL || 'whisper-1';

      console.log(
        `[Transcription] Sending recording ${recording.id} (language: ${effectiveLanguage || 'auto-detect'}, model: ${requestedModel}) to OpenAI Whisper via Plivo URL`
      );

      // Call OpenAI Whisper API via convenience wrapper
      const result = await transcribeAudioFromUrl(recording.recordingUrl, {
        apiKey: body.apiKey,
        model: requestedModel,
        language: effectiveLanguage,
        prompt: body.prompt,
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
  // 2. PLIVO CARRIER TRANSCRIPTION REFETCH / FETCH
  // ─────────────────────────────────────────────────────────────
  try {
    const provider = getTelephonyProvider();

    // 1. First, attempt to fetch existing transcription directly from Plivo REST API
    let plivoData = await provider.getTranscription(recording.plivoRecordingId);

    // 2. If not available yet, request on-demand carrier transcription from Plivo
    if (!plivoData || !plivoData.text) {
      const publicBase = process.env.PUBLIC_BASE_URL || 'http://localhost:3000';
      const transcriptionUrl = `${publicBase}/api/v1/webhooks/transcription`;

      const createRes = await provider.createTranscription(recording.plivoRecordingId, {
        transcriptionType: 'auto',
        transcriptionUrl,
      });

      if (createRes.status === 'completed') {
        plivoData = await provider.getTranscription(recording.plivoRecordingId);
      }
    }

    if (plivoData && plivoData.text) {
      // Find existing Plivo transcription record for this recording
      let existingTranscription = await db.transcription.findFirst({
        where: {
          recordingId: recording.id,
          organizationId: auth!.organizationId,
          source: { in: ['plivo', 'callback', 'on_demand'] },
        },
      });

      if (!existingTranscription) {
        existingTranscription = await db.transcription.findUnique({
          where: { plivoTranscriptionId: recording.plivoRecordingId },
        });
      }

      let transcription;
      if (existingTranscription) {
        transcription = await db.transcription.update({
          where: { id: existingTranscription.id },
          data: {
            text: plivoData.text,
            status: 'completed',
            source: 'plivo',
            wordCount: (plivoData.text || '').split(/\s+/).filter(Boolean).length,
            rawPayload: plivoData.rawPayload || undefined,
            updatedAt: new Date(),
          },
        });
      } else {
        transcription = await db.transcription.create({
          data: {
            organizationId: auth!.organizationId,
            recordingId: recording.id,
            callId: recording.callId,
            plivoTranscriptionId: plivoData.transcriptionId || recording.plivoRecordingId,
            recordingSid: recording.plivoRecordingId,
            type: 'transcription',
            status: 'completed',
            language: 'en',
            text: plivoData.text,
            wordCount: (plivoData.text || '').split(/\s+/).filter(Boolean).length,
            source: 'plivo',
            rawPayload: plivoData.rawPayload || undefined,
          },
        });
      }

      // Mark transcription on call record
      if (recording.callId) {
        await db.call.update({
          where: { id: recording.callId },
          data: {
            transcriptionEnabled: true,
          },
        });
      }

      await logAuditEvent({
        organizationId: auth!.organizationId,
        actorUserId: auth!.userId,
        action: 'transcription.refetch_plivo',
        targetType: 'Recording',
        targetId: recording.id,
        metadata: {
          recordingId: recording.plivoRecordingId,
          transcriptionId: transcription.id,
          wordCount: transcription.wordCount,
          source: 'plivo',
        },
      });

      return NextResponse.json({
        api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
        message: 'Transcription refetched successfully from Plivo carrier',
        transcription,
      });
    }

    // If Plivo carrier is generating or queued
    const existingTranscription = await db.transcription.findFirst({
      where: {
        recordingId: recording.id,
        organizationId: auth!.organizationId,
      },
    });

    let transcription = existingTranscription;
    if (!transcription) {
      transcription = await db.transcription.create({
        data: {
          organizationId: auth!.organizationId,
          recordingId: recording.id,
          callId: recording.callId,
          plivoTranscriptionId: recording.plivoRecordingId,
          recordingSid: recording.plivoRecordingId,
          status: 'queued',
          source: 'plivo',
        },
      });
    }

    return NextResponse.json({
      api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
      message: 'Carrier transcription requested from Plivo. Please check back in a few moments.',
      transcription,
      status: 'queued',
    });
  } catch (err: any) {
    console.error('Plivo transcription refetch error:', err);
    return NextResponse.json(
      { api_id: 'provider_err', error: err.message || 'Failed to refetch transcription from Plivo' },
      { status: 500 }
    );
  }
}
