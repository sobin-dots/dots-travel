import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { processIncomingWebhook } from '@/lib/webhook-helper';
import { PlivoXmlBuilder } from '@/lib/telephony/xml/builder';
import {
  resolveTenantPlivoIntegration,
  buildOrgWebhookUrls,
} from '@/lib/integrations/credentials-manager';
import { handleAnswer } from '../answer/route';
import { callRoutingState, dialAttemptUrl, recordInboundAnswer, retryInboundCall } from '@/lib/telephony/agent-routing';

export const runtime = 'nodejs';

async function handleFallbackOrDialAction(req: NextRequest) {
  const urlObj = new URL(req.url);

  // Peek at request params if this is a <Dial action="..."> callback from Plivo
  let previewParams: Record<string, string> = {};
  if (req.method === 'POST') {
    try {
      const cloned = req.clone();
      const formData = await cloned.formData();
      formData.forEach((value, key) => {
        previewParams[key] = value.toString();
      });
    } catch {}
  } else {
    urlObj.searchParams.forEach((val, key) => {
      previewParams[key] = val;
    });
  }

  const dialStatus = (
    previewParams.DialStatus ||
    previewParams.dial_status ||
    previewParams.DialBLegStatus ||
    ''
  ).toLowerCase();

  // If this was NOT a <Dial action> callback (i.e. primary answer URL failed before <Dial>), delegate to handleAnswer
  if (!dialStatus && !previewParams.DialHangupCause && !previewParams.DialALegUUID) {
    return handleAnswer(req);
  }

  // Validate Plivo signature via processIncomingWebhook
  const result = await processIncomingWebhook(req, 'voice', (p) => {
    return `${p.DialALegUUID || p.CallUUID || p.call_uuid || 'unknown'}_dial_action_${urlObj.searchParams.get('attempt') || '0'}_${p.DialBLegUUID || ''}_${p.DialStatus || 'done'}`;
  });

  if (!result.valid) return result.errorResponse!;

  const { params } = result;
  const queryOrgId = urlObj.searchParams.get('orgId') || params.orgId;
  const parentAuthId = params.ParentAuthID || params.authId || params.AuthId;
  const destinationNumber = params.To || params.to;

  const tenantPlivo = await resolveTenantPlivoIntegration({
    organizationId: queryOrgId,
    parentAuthId,
    phoneNumber: destinationNumber,
  });

  const effectiveOrgId = tenantPlivo?.organizationId || queryOrgId;
  const plivoMeta = tenantPlivo?.integration?.metadata || {};
  const requestBase = `${req.headers.get('x-forwarded-proto') || (req.url.startsWith('https') ? 'https' : 'http')}://${
    req.headers.get('x-forwarded-host') || req.headers.get('host') || urlObj.host
  }`
    .trim()
    .replace(/\/+$/, '');

  const effectiveBaseUrl = (
    (!requestBase.includes('localhost') ? requestBase : plivoMeta.webhookBaseUrl) ||
    requestBase
  )
    .trim()
    .replace(/\/+$/, '');

  const orgWebhookUrls = effectiveOrgId
    ? plivoMeta.webhookUrls && plivoMeta.webhookUrls.voiceRecord?.includes(effectiveOrgId)
      ? plivoMeta.webhookUrls
      : buildOrgWebhookUrls(effectiveBaseUrl, effectiveOrgId)
    : null;

  const recordActionUrl =
    orgWebhookUrls?.voiceRecord ||
    `${effectiveBaseUrl}/api/v1/webhooks/voice/record${effectiveOrgId ? `?orgId=${effectiveOrgId}` : ''}`;

  const builder = new PlivoXmlBuilder();
  const callUuid = params.DialALegUUID || params.CallUUID || params.call_uuid;
  const attempt = Number(urlObj.searchParams.get('attempt') || '0');
  if (!effectiveOrgId || !callUuid || !Number.isSafeInteger(attempt) || attempt < 0) {
    return new NextResponse(builder.hangup().toXml(), { headers: { 'content-type': 'application/xml; charset=utf-8' } });
  }

  // If the in-app Web Phone agent answered the call and completed the conversation, hang up cleanly
  const isAnswered =
    dialStatus === 'completed' ||
    dialStatus === 'answered' ||
    dialStatus === 'answer' ||
    (Number(params.DialBLegDuration || 0) > 0 && params.DialHangupCause &&
      String(params.DialHangupCause).toUpperCase() === 'NORMAL_CLEARING' &&
      params.DialBLegUUID);

  if (isAnswered) {
    builder.hangup();
    const duration = params.DialBLegDuration || params.Duration;
    const durationSeconds = duration !== undefined && /^\d+$/.test(String(duration)) ? Number(duration) : undefined;
    await recordInboundAnswer({ organizationId: effectiveOrgId, callUuid, attempt, completed: true, durationSeconds });
  } else {
    const outcome = /reject|declin|call_rejected/i.test(String(params.DialHangupCause || params.DialBLegHangupCauseName || dialStatus)) ? 'declined' : 'missed';
    const callerEnded = ['cancel', 'canceled', 'cancelled'].includes(dialStatus) && /ORIGINATOR_CANCEL/i.test(String(params.DialHangupCause || params.DialBLegHangupCauseName || ''));
    const next = await retryInboundCall({ organizationId: effectiveOrgId, callUuid, attempt, outcome, callerEnded,
      dialStatus, hangupCause: String(params.DialHangupCause || params.DialBLegHangupCauseName || '') });
    if (!next || next.hangup) {
      builder.hangup();
    } else if (next.sipUri) {
      const nextAttempt = callRoutingState(next.call.requestedParams).dialAttempt;
      const actionUrl = orgWebhookUrls?.voiceFallback || `${effectiveBaseUrl}/api/v1/webhooks/voice/fallback?orgId=${effectiveOrgId}`;
      builder.dial(next.sipUri, { callerId: next.call.from, timeLimit: 3600, timeout: 25,
        action: dialAttemptUrl(actionUrl, nextAttempt), method: 'POST', redirect: true,
        callbackUrl: dialAttemptUrl(`${effectiveBaseUrl}/api/v1/webhooks/voice/dial?orgId=${effectiveOrgId}`, nextAttempt), callbackMethod: 'POST' });
    } else {
      // Keep voicemail available after the responsible person and eligible backups cannot answer.
      builder
        .speak(
          'Hello! Welcome to 3dots AI Travel Concierge. Our travel specialists are currently assisting other travelers. Please describe your dream vacation, destination, dates, and budget after the beep, and we will prepare a personalized itinerary for you.',
          {
            voice: 'WOMAN',
            language: 'en-US',
          }
        )
        .record({
          maxLength: 180,
          action: recordActionUrl,
          playBeep: true,
        })
        .wait(5);
    }
  }

  if (result.webhookEventId) await db.webhookEvent.update({ where: { id: result.webhookEventId }, data: { status: 'processed', processedAt: new Date() } });
  return new NextResponse(builder.toXml(), {
    status: 200,
    headers: { 'content-type': 'application/xml; charset=utf-8' },
  });
}

export async function GET(req: NextRequest) {
  return handleFallbackOrDialAction(req);
}

export async function POST(req: NextRequest) {
  return handleFallbackOrDialAction(req);
}
