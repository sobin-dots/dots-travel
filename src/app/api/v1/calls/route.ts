import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { authenticateRequest, logAuditEvent } from '@/lib/api-auth';
import { CreateCallRequestSchema } from '@/lib/schemas';
import { getTelephonyProvider, getTenantTelephonyProvider } from '@/lib/telephony';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const { auth, errorResponse } = await authenticateRequest(req, 'viewer');
  if (errorResponse) return errorResponse;

  const url = new URL(req.url);
  const status = url.searchParams.get('status') || undefined;
  const direction = url.searchParams.get('direction') || undefined;
  const phoneNumberId = url.searchParams.get('phoneNumberId') || undefined;
  const limit = Math.min(Number(url.searchParams.get('limit') || '20'), 50);
  const offset = Number(url.searchParams.get('offset') || '0');

  const where: any = { organizationId: auth!.organizationId };
  if (status) where.status = status;
  if (direction) where.direction = direction;
  if (phoneNumberId) where.phoneNumberId = phoneNumberId;

  const [calls, totalCount] = await Promise.all([
    db.call.findMany({
      where,
      include: {
        phoneNumber: {
          select: {
            id: true,
            e164: true,
            friendlyName: true,
          },
        },
        recordings: {
          select: {
            id: true,
            plivoRecordingId: true,
            durationSeconds: true,
            status: true,
          },
        },
        transcriptions: {
          select: {
            id: true,
            status: true,
            text: true,
          },
        },
      },
      orderBy: { startedAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    db.call.count({ where }),
  ]);

  return NextResponse.json({
    api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
    totalCount,
    limit,
    offset,
    objects: calls,
  });
}

export async function POST(req: NextRequest) {
  const { auth, errorResponse } = await authenticateRequest(req, 'operator');
  if (errorResponse) return errorResponse;

  let createdCallId: string | null = null;

  try {
    const body = await req.json();
    const parsed = CreateCallRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { api_id: 'bad_req', error: parsed.error.issues[0]?.message || 'Invalid call request parameters' },
        { status: 400 }
      );
    }

    const {
      phoneNumberId,
      to,
      mode,
      xml,
      forwardTo,
      url,
      record,
      transcribe,
      transcriptionLanguage,
      machineDetection,
      timeLimit,
    } = parsed.data;

    // Verify phone number ownership
    const phoneNumber = await db.phoneNumber.findFirst({
      where: {
        id: phoneNumberId,
        organizationId: auth!.organizationId,
        status: 'active',
      },
      include: {
        organization: true,
      },
    });

    if (!phoneNumber) {
      return NextResponse.json(
        { api_id: 'not_found', error: 'Active source phone number not found in organization' },
        { status: 404 }
      );
    }

    // Resolve transcription policy cascade:
    // Org default -> PhoneNumber setting -> Per-call request override
    const resolvedTranscription =
      transcribe !== undefined
        ? transcribe
        : phoneNumber.transcribeEnabled !== undefined
        ? phoneNumber.transcribeEnabled
        : phoneNumber.organization.transcriptionDefaultEnabled;

    const resolvedLanguage = transcriptionLanguage || phoneNumber.transcriptionLanguage || 'en-US';

    // Construct Answer URL and Webhook URLs from DB-stored Plivo webhookUrls or request origin
    const { getTenantIntegration, buildOrgWebhookUrls } = await import('@/lib/integrations/credentials-manager');
    const plivoInteg = await getTenantIntegration(auth!.organizationId, 'plivo');
    const proto = req.headers.get('x-forwarded-proto') || (req.url.startsWith('https') ? 'https' : 'http');
    const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
    const requestBase = host ? `${proto}://${host}` : 'http://localhost:3000';
    const effectiveBase = (
      plivoInteg?.metadata?.webhookBaseUrl ||
      requestBase
    ).trim().replace(/\/+$/, '');
    const dbWebhookUrls = plivoInteg?.metadata?.webhookUrls || buildOrgWebhookUrls(effectiveBase, auth!.organizationId);

    let answerUrl: string;

    if (mode === 'url' && url) {
      answerUrl = url;
    } else {
      const baseAnswerUrl = dbWebhookUrls.voiceAnswer || `${effectiveBase}/api/v1/webhooks/voice/answer?orgId=${auth!.organizationId}`;
      const sep = baseAnswerUrl.includes('?') ? '&' : '?';
      answerUrl = `${baseAnswerUrl}${sep}mode=${mode}`;
      if ((mode === 'forward' || mode === 'bridge') && forwardTo) {
        answerUrl += `&forwardTo=${encodeURIComponent(forwardTo)}`;
      }
    }

    const ringUrl = dbWebhookUrls.voiceStatus || `${effectiveBase}/api/v1/webhooks/voice/status?orgId=${auth!.organizationId}`;
    const hangupUrl = dbWebhookUrls.voiceHangup || `${effectiveBase}/api/v1/webhooks/voice/hangup?orgId=${auth!.organizationId}`;

    // Initialize Call record with temporary UUID
    const tempUuid = `temp_${crypto.randomBytes(12).toString('hex')}`;
    const initialCall = await db.call.create({
      data: {
        organizationId: auth!.organizationId,
        phoneNumberId: phoneNumber.id,
        plivoCallUuid: tempUuid,
        direction: 'outbound',
        status: 'queued',
        from: phoneNumber.e164,
        to,
        recordingEnabled: record,
        transcriptionEnabled: resolvedTranscription,
        transcriptionLanguage: resolvedLanguage,
        requestedMode: mode,
        requestedParams: {
          forwardTo,
          customXml: xml,
          customUrl: url,
        },
      },
    });
    createdCallId = initialCall.id;

    // Invoke Telephony Provider for tenant
    const provider = await getTenantTelephonyProvider(auth!.organizationId);
    const result = await provider.createCall({
      from: phoneNumber.e164,
      to,
      answerUrl,
      ringUrl,
      hangupUrl,
      timeLimit,
      machineDetection,
    });

    // Update with real Call UUID from provider
    const updatedCall = await db.call.update({
      where: { id: initialCall.id },
      data: {
        plivoCallUuid: result.callUuid,
        requestUuid: result.requestUuid,
      },
      include: {
        phoneNumber: true,
      },
    });

    await logAuditEvent({
      organizationId: auth!.organizationId,
      actorUserId: auth!.userId,
      action: 'call.create',
      targetType: 'Call',
      targetId: updatedCall.id,
      metadata: { from: phoneNumber.e164, to, mode, callUuid: result.callUuid },
    });

    return NextResponse.json({
      api_id: result.apiId,
      message: result.message,
      call: updatedCall,
    }, { status: 201 });
  } catch (err: any) {
    console.error('Call placement error:', err);
    try {
      if (createdCallId) {
        await db.call.update({
          where: { id: createdCallId },
          data: {
            status: 'failed',
            hangupCauseCode: 500,
            hangupCauseName: err.message?.slice(0, 100),
          },
        });
      }
    } catch {}
    return NextResponse.json(
      { api_id: 'provider_err', error: err.message },
      { status: 500 }
    );
  }
}
