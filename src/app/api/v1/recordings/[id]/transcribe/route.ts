import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { authenticateRequest, logAuditEvent } from '@/lib/api-auth';
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
  const rawModel = body.model || url.searchParams.get('model');

  // ─────────────────────────────────────────────────────────────
  // DIRECT OPENAI SPEECH-TO-TEXT TRANSCRIPTION
  // ─────────────────────────────────────────────────────────────
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

    const isExplicitModel = Boolean(rawModel && rawModel !== 'configured' && rawModel !== 'default');
    const requestedModel = isExplicitModel ? rawModel : undefined;

    console.log(
      `[Transcription] Sending recording ${recording.id} (language: ${effectiveLanguage || 'auto-detect'}, model: ${requestedModel || 'tenant-configured'}) directly to OpenAI STT`
    );

    const result = await transcribeAudioFromUrl(recording.recordingUrl, {
      organizationId: auth!.organizationId,
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
          segments: (result.segments as any) || null,
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
          segments: (result.segments as any) || null,
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
        model: result.model,
      },
    });

    return NextResponse.json({
      api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
      message: `Transcription generated successfully with OpenAI (${result.model || 'configured model'})`,
      transcription,
      model: result.model,
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
