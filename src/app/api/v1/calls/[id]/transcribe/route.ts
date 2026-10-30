import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { authenticateRequest, logAuditEvent } from '@/lib/api-auth';
import { getTenantIntegration } from '@/lib/integrations/credentials-manager';
import {
  transcribeAudioFromUrl,
  normalizeToIso639_1,
} from '@/lib/openai-transcribe';
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

  // If no recording in DB yet, try to discover recordings from Plivo carrier (supporting tenant BYOK credentials)
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

  let body: any = {};
  try {
    body = await req.json();
  } catch {}

  const url = new URL(req.url);
  const rawModel = body.model || url.searchParams.get('model');
  const isExplicitModel = Boolean(rawModel && rawModel !== 'configured' && rawModel !== 'default');
  const requestedModel = isExplicitModel ? rawModel : undefined;

  let effectiveLanguage: string | undefined = undefined;
  if (body.language && body.language !== 'auto' && body.language !== 'mixed') {
    effectiveLanguage = normalizeToIso639_1(body.language);
  }

  try {
    if (!latestRecording.recordingUrl || !latestRecording.recordingUrl.startsWith('http')) {
      return NextResponse.json(
        {
          api_id: 'media_not_found',
          error: 'Recording does not have a valid HTTP recording URL',
        },
        { status: 400 }
      );
    }

    const result = await transcribeAudioFromUrl(latestRecording.recordingUrl, {
      organizationId: auth!.organizationId,
      apiKey: body.apiKey,
      model: requestedModel,
      language: effectiveLanguage,
      prompt: body.prompt,
    });

    const existingTranscription = await db.transcription.findFirst({
      where: {
        recordingId: latestRecording.id,
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
          recordingId: latestRecording.id,
          callId: call.id,
          plivoTranscriptionId: `whisper_${crypto.randomBytes(8).toString('hex')}`,
          recordingSid: latestRecording.plivoRecordingId,
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

    await db.call.update({
      where: { id: call.id },
      data: {
        transcriptionEnabled: true,
        transcriptionLanguage: result.language || 'en',
      },
    });

    await logAuditEvent({
      organizationId: auth!.organizationId,
      actorUserId: auth!.userId,
      action: 'transcription.create_openai',
      targetType: 'Call',
      targetId: call.id,
      metadata: {
        recordingId: latestRecording.plivoRecordingId,
        transcriptionId: transcription.id,
        wordCount: transcription.wordCount,
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
    console.error('OpenAI call transcription error:', err);
    return NextResponse.json(
      {
        api_id: 'openai_err',
        error: err.message || 'Failed to generate transcription with OpenAI',
      },
      { status: 500 }
    );
  }
}
