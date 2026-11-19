import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { processIncomingWebhook, resolveRequestBaseUrl } from '@/lib/webhook-helper';
import { PlivoXmlBuilder } from '@/lib/telephony/xml/builder';
import { callRoutingState, dialAttemptUrl, reserveInboundCall } from '@/lib/telephony/agent-routing';
import {
  resolveTenantPlivoIntegration,
  resolveOrgWebhookUrls,
} from '@/lib/integrations/credentials-manager';

export const runtime = 'nodejs';

export async function handleAnswer(req: NextRequest) {
  const result = await processIncomingWebhook(req, 'voice', (p) => {
    return `${p.CallUUID || p.call_uuid || 'unknown'}_answer`;
  });

  if (!result.valid) return result.errorResponse!;

  const { params, isDuplicate, webhookEventId } = result;
  const callUuid = params.CallUUID || params.call_uuid;

  const urlObj = new URL(req.url);
  const mode = urlObj.searchParams.get('mode') || params.mode || 'default';
  const forwardTo = urlObj.searchParams.get('forwardTo') || params.forwardTo;
  const connectTo = urlObj.searchParams.get('connectTo') || params.connectTo;

  const requestBase = resolveRequestBaseUrl(req, urlObj.host);

  const queryOrgId = urlObj.searchParams.get('orgId') || params.orgId;
  const destinationNumber = params.To || params.to;
  const rawFrom = String(params.From || params.from || '');
  const parentAuthId = params.ParentAuthID || params.authId || params.AuthId;
  const customCallerIdHeader = params['X-PH-callerId'] || params['x-ph-callerid'];

  // Resolve tenant Plivo integration strictly from the database (Settings -> Platform & BYOK)
  const tenantPlivo = await resolveTenantPlivoIntegration({
    organizationId: queryOrgId,
    parentAuthId,
    phoneNumber: customCallerIdHeader || destinationNumber,
  });

  let resolvedOrg: any = null;
  let phoneRecord: any = null;

  if (tenantPlivo?.organizationId) {
    resolvedOrg = await db.organization.findUnique({
      where: { id: tenantPlivo.organizationId },
    });
  }

  if (!resolvedOrg && queryOrgId) {
    resolvedOrg = await db.organization.findFirst({
      where: { OR: [{ id: queryOrgId }, { slug: queryOrgId }] },
    });
  }

  const lookupNumber = customCallerIdHeader || destinationNumber;
  if (lookupNumber) {
    const cleanNumber = String(lookupNumber).replace(/\D/g, '');
    phoneRecord = await db.phoneNumber.findFirst({
      where: {
        ...(resolvedOrg?.id ? { organizationId: resolvedOrg.id } : {}),
        OR: [
          { e164: lookupNumber },
          ...(cleanNumber ? [{ e164: `+${cleanNumber}` }, { e164: cleanNumber }] : []),
        ],
      },
      include: { organization: true },
    });
    if (!resolvedOrg && phoneRecord?.organization) {
      resolvedOrg = phoneRecord.organization;
    }
  }

  const effectiveOrgId = tenantPlivo?.organizationId || resolvedOrg?.id;
  if (!effectiveOrgId) return NextResponse.json({ error: 'No organization matched this call' }, { status: 404 });
  const plivoCreds = tenantPlivo?.integration?.credentials || {};
  const plivoMeta = tenantPlivo?.integration?.metadata || {};

  // Resolve live request origin over stale DB webhook URLs (e.g. old local/ngrok tunnels)
  const resolved = effectiveOrgId
    ? resolveOrgWebhookUrls(effectiveOrgId, requestBase, plivoMeta)
    : null;
  const effectiveBaseUrl = resolved?.effectiveBaseUrl || requestBase.trim().replace(/\/+$/, '');
  const orgWebhookUrls = resolved?.webhookUrls || null;

  const recordActionUrl =
    orgWebhookUrls?.voiceRecord ||
    `${effectiveBaseUrl}/api/v1/webhooks/voice/record${effectiveOrgId ? `?orgId=${effectiveOrgId}` : ''}`;
  const dialActionUrl =
    orgWebhookUrls?.voiceFallback ||
    `${effectiveBaseUrl}/api/v1/webhooks/voice/fallback${effectiveOrgId ? `?orgId=${effectiveOrgId}` : ''}`;

  const builder = new PlivoXmlBuilder();
  let inboundCallHandled = false;
  const dialCallbackUrl = `${effectiveBaseUrl}/api/v1/webhooks/voice/dial?orgId=${effectiveOrgId}`;

  const isSipEndpointCall = Boolean(
    rawFrom.startsWith('sip:') ||
      /^(?:agent_|a[0-9a-f]{16})/i.test(rawFrom) ||
      params.Direction === 'outbound' ||
      params.direction === 'outbound' ||
      params.CallDirection === 'outbound' ||
      params.callDirection === 'outbound' ||
      customCallerIdHeader
  );

  const resolvedCallerId =
    customCallerIdHeader ||
    plivoCreds.callerId ||
    phoneRecord?.e164 ||
    '';

  if (isSipEndpointCall && destinationNumber) {
    // Outbound call originating from in-browser WebRTC Web Phone
    builder
      .record({
        action: recordActionUrl,
        startOnDialAnswer: true,
        redirect: false,
        maxLength: 3600,
        recordSession: true,
        recordChannelType: 'mono',
        playBeep: false,
      })
      .dial(destinationNumber, {
        ...(resolvedCallerId ? { callerId: resolvedCallerId } : {}),
      });
  } else if (mode === 'bridge' && (connectTo || forwardTo)) {
    // Mobile Phone Bridge mode: Plivo called the Staff / Agent's mobile phone first.
    // Now that the agent answered, play a brief whisper and dial the recipient customer (connectTo).
    const targetCustomer = connectTo || forwardTo;
    const callerId = resolvedCallerId || params.From || params.from || '';
    builder
      .speak('Connecting you to the customer now. This call is recorded.', {
        voice: 'WOMAN',
        language: 'en-US',
      })
      .record({
        action: recordActionUrl,
        startOnDialAnswer: true,
        redirect: false,
        maxLength: 3600,
        recordSession: true,
        recordChannelType: 'mono',
        playBeep: false,
      })
      .dial(targetCustomer, {
        ...(callerId ? { callerId } : {}),
      });
  } else if (mode === 'forward' && forwardTo) {
    const callerId = params.From || params.from || resolvedCallerId;
    builder
      .speak('Connecting you to your live conversation. This call is recorded.', {
        voice: 'WOMAN',
        language: 'en-US',
      })
      .record({
        action: recordActionUrl,
        startOnDialAnswer: true,
        redirect: false,
        maxLength: 3600,
        recordSession: true,
        recordChannelType: 'mono',
        playBeep: false,
      })
      .dial(forwardTo, {
        callerId,
      });
  } else if (mode === 'voicemail') {
    builder
      .speak('Please leave your message after the tone. Press pound when finished.', {
        voice: 'WOMAN',
        language: 'en-US',
      })
      .record({
        maxLength: 120,
        action: recordActionUrl,
        playBeep: true,
      });
  } else {
    // Inbound call from customer/client to the tenant's Plivo connected number
    const callerPhone = params.From || params.from || resolvedCallerId;
    if (!callUuid) return NextResponse.json({ error: 'Call UUID required' }, { status: 400 });
    const reservation = await reserveInboundCall({ organizationId: effectiveOrgId, callUuid, from: callerPhone,
      to: destinationNumber || phoneRecord?.e164 || 'Unknown', phoneNumberId: phoneRecord?.id,
      forwarded: !!(forwardTo || phoneRecord?.forwardTo) });
    if (reservation.call.endedAt) return new NextResponse(new PlivoXmlBuilder().hangup().toXml(), { headers: { 'content-type': 'application/xml; charset=utf-8' } });
    inboundCallHandled = true;

    if (forwardTo || phoneRecord?.forwardTo) {
      const targetForward = forwardTo || phoneRecord.forwardTo;
      builder
        .record({
          action: recordActionUrl,
          startOnDialAnswer: true,
          redirect: false,
          maxLength: 3600,
          recordSession: true,
          recordChannelType: 'mono',
          playBeep: false,
        })
        .dial(targetForward, {
          callerId: callerPhone,
          timeLimit: 3600,
          timeout: 25,
          action: dialActionUrl,
          method: 'POST',
          redirect: true,
          callbackUrl: dialCallbackUrl,
          callbackMethod: 'POST',
        });
    } else {
      const sipEndpoint = reservation.sipUri;

      if (sipEndpoint) {
        // Ring the responsible salesperson first. The Dial action retries available
        // round-robin backups only after this attempt fails.
        builder
          .record({
            action: recordActionUrl,
            startOnDialAnswer: true,
            redirect: false,
            maxLength: 3600,
            recordSession: true,
            recordChannelType: 'mono',
            playBeep: false,
          })
          .dial(sipEndpoint, {
            callerId: callerPhone,
            timeLimit: 3600,
            timeout: 25,
            dialMusic: 'real',
            action: dialAttemptUrl(dialActionUrl, callRoutingState(reservation.call.requestedParams).dialAttempt),
            method: 'POST',
            redirect: true,
            callbackUrl: dialAttemptUrl(dialCallbackUrl, callRoutingState(reservation.call.requestedParams).dialAttempt),
            callbackMethod: 'POST',
          });
      } else {
        // No WebRTC SIP endpoint configured -> connect to AI agent voicemail
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
  }

  const xmlResponse = builder.toXml();

  // If already processed, return XML without duplicate DB updates
  if (isDuplicate || !callUuid) {
    return new NextResponse(xmlResponse, {
      status: 200,
      headers: { 'content-type': 'application/xml; charset=utf-8' },
    });
  }

  if (inboundCallHandled) {
    if (webhookEventId) await db.webhookEvent.update({ where: { id: webhookEventId }, data: { status: 'processed', processedAt: new Date() } });
    return new NextResponse(xmlResponse, { headers: { 'content-type': 'application/xml; charset=utf-8' } });
  }

  // Update Call state in DB
  try {
    const existingCall = await db.call.findUnique({
      where: { plivoCallUuid: callUuid },
    });

    if (existingCall) {
      await db.call.update({
        where: { id: existingCall.id },
        data: {
          status: 'in-progress',
          answeredAt: existingCall.answeredAt || new Date(),
        },
      });

      await db.callEvent.create({
        data: {
          organizationId: existingCall.organizationId,
          callId: existingCall.id,
          eventType: 'answer',
          status: 'in-progress',
          payload: params,
          occurredAt: new Date(),
          webhookEventId,
        },
      });
    } else if (isSipEndpointCall) {
      if (effectiveOrgId) {
        const actorUserId = params['X-PH-actorUserId'] || params['x-ph-actoruserid'] || undefined;
        const actorName = params['X-PH-actorName'] || params['x-ph-actorname'] || undefined;
        const actorEmail = params['X-PH-actorEmail'] || params['x-ph-actoremail'] || undefined;
        await db.call.createMany({
          data: [
            {
              organizationId: effectiveOrgId,
              phoneNumberId: phoneRecord?.id || null,
              plivoCallUuid: callUuid,
              from: resolvedCallerId || 'Unknown',
              to: destinationNumber || 'Unknown',
              direction: 'outbound',
              status: 'in-progress',
              recordingEnabled: true,
              transcriptionEnabled: true,
              transcriptionLanguage: 'en-US',
              answeredAt: new Date(),
              requestedMode: 'browser',
              requestedParams: actorUserId || actorName || actorEmail
                ? { actorUserId, actorName, actorEmail }
                : undefined,
            },
          ],
          skipDuplicates: true,
        });
        const savedCall = await db.call.findUnique({ where: { plivoCallUuid: callUuid } });
        if (savedCall) {
          await db.callEvent.create({
            data: {
              organizationId: effectiveOrgId,
              callId: savedCall.id,
              eventType: 'answer',
              status: 'in-progress',
              payload: params,
              occurredAt: new Date(),
              webhookEventId,
            },
          });
        }
      }
    } else {
      // Inbound call from customer to virtual number
      if (effectiveOrgId) {
        const callerPhone = params.From || params.from || 'Unknown Caller';
        const calledNumber = destinationNumber || phoneRecord?.e164 || resolvedCallerId || 'Unknown';
        await db.call.createMany({
          data: [
            {
              organizationId: effectiveOrgId,
              phoneNumberId: phoneRecord?.id || null,
              plivoCallUuid: callUuid,
              from: callerPhone,
              to: calledNumber,
              direction: 'inbound',
              status: 'in-progress',
              recordingEnabled: true,
              transcriptionEnabled: true,
              transcriptionLanguage: 'en-US',
              answeredAt: new Date(),
            },
          ],
          skipDuplicates: true,
        });
        const savedCall = await db.call.findUnique({ where: { plivoCallUuid: callUuid } });
        if (savedCall) {
          await db.callEvent.create({
            data: {
              organizationId: effectiveOrgId,
              callId: savedCall.id,
              eventType: 'answer',
              status: 'in-progress',
              payload: params,
              occurredAt: new Date(),
              webhookEventId,
            },
          });
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
    console.error('Error updating call answer state:', err);
  }

  return new NextResponse(xmlResponse, {
    status: 200,
    headers: { 'content-type': 'application/xml; charset=utf-8' },
  });
}

export async function GET(req: NextRequest) {
  return handleAnswer(req);
}

export async function POST(req: NextRequest) {
  return handleAnswer(req);
}
