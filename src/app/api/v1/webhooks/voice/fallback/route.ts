import { NextRequest, NextResponse } from 'next/server';
import { processIncomingWebhook } from '@/lib/webhook-helper';
import { PlivoXmlBuilder } from '@/lib/telephony/xml/builder';
import {
  resolveTenantPlivoIntegration,
  buildOrgWebhookUrls,
} from '@/lib/integrations/credentials-manager';
import { handleAnswer } from '../answer/route';

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
    return `${p.CallUUID || p.call_uuid || 'unknown'}_dial_action_${p.DialStatus || 'done'}`;
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

  // If the in-app Web Phone agent answered the call and completed the conversation, hang up cleanly
  const isAnswered =
    dialStatus === 'completed' ||
    dialStatus === 'answered' ||
    dialStatus === 'answer' ||
    (params.DialHangupCause &&
      String(params.DialHangupCause).toUpperCase() === 'NORMAL_CLEARING' &&
      params.DialBLegUUID);

  if (isAnswered) {
    builder.hangup();
  } else {
    // Agent did not answer, declined, was busy, or disconnected -> connect to AI agent voicemail
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
