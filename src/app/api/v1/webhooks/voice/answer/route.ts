import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { processIncomingWebhook } from '@/lib/webhook-helper';
import { PlivoXmlBuilder } from '@/lib/telephony/xml/builder';
import {
  resolveTenantPlivoIntegration,
  buildOrgWebhookUrls,
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

  const requestBase = `${req.headers.get('x-forwarded-proto') || (req.url.startsWith('https') ? 'https' : 'http')}://${
    req.headers.get('x-forwarded-host') || req.headers.get('host') || urlObj.host
  }`
    .trim()
    .replace(/\/+$/, '');

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

  if (!resolvedOrg) {
    resolvedOrg = await db.organization.findFirst();
  }

  const effectiveOrgId = tenantPlivo?.organizationId || resolvedOrg?.id;
  const plivoCreds = tenantPlivo?.integration?.credentials || {};
  const plivoMeta = tenantPlivo?.integration?.metadata || {};

  // Use DB-stored webhook URLs generated in Settings -> Platform & BYOK (falling back to request origin if not yet saved)
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
  const dialActionUrl =
    orgWebhookUrls?.voiceFallback ||
    `${effectiveBaseUrl}/api/v1/webhooks/voice/fallback${effectiveOrgId ? `?orgId=${effectiveOrgId}` : ''}`;

  const builder = new PlivoXmlBuilder();

  const isSipEndpointCall = Boolean(
    rawFrom.startsWith('sip:') ||
      rawFrom.includes('agent') ||
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
  } else if ((mode === 'forward' || mode === 'bridge') && forwardTo) {
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
        });
    } else {
      // Resolve tenant's WebRTC SIP endpoint & registration state from DB-configured Plivo credentials
      let sipEndpoint: string | null = plivoCreds.sipEndpoint || null;
      let isUserLoggedIn = false;

      if (plivoCreds.authId && plivoCreds.authToken) {
        try {
          const plivoModule = await import('plivo');
          const client = new (plivoModule as any).Client(plivoCreds.authId, plivoCreds.authToken);
          const eps = await client.endpoints.list();
          if (Array.isArray(eps) && eps.length > 0) {
            const matchedEp =
              eps.find((e: any) => plivoCreds.endpointUsername && e.username === plivoCreds.endpointUsername) ||
              eps.find((e: any) => String(e.sipRegistered).toLowerCase() === 'true' || e.sipRegistered === true) ||
              eps[0];

            if (matchedEp?.username) {
              sipEndpoint = matchedEp.sipUri || `sip:${matchedEp.username}@phone.plivo.com`;
              isUserLoggedIn =
                String(matchedEp.sipRegistered).toLowerCase() === 'true' ||
                matchedEp.sipRegistered === true;
            }
          }
        } catch (err) {
          console.warn('[VoiceAnswer] Failed to query tenant Plivo endpoint status:', err);
          // If live API check failed transiently but DB has sipEndpoint, attempt ringing Web Phone
          if (sipEndpoint) {
            isUserLoggedIn = true;
          }
        }
      }

      // Check if all agents for this organization are currently busy in another active call
      let isAgentBusy = false;
      if (effectiveOrgId && isUserLoggedIn) {
        try {
          const activeCallCount = await db.call.count({
            where: {
              organizationId: effectiveOrgId,
              status: 'in-progress',
              endedAt: null,
              startedAt: { gte: new Date(Date.now() - 30 * 60 * 1000) },
              ...(callUuid ? { plivoCallUuid: { not: callUuid } } : {}),
            },
          });
          if (activeCallCount > 0) {
            isAgentBusy = true;
          }
        } catch {}
      }

      if (sipEndpoint && isUserLoggedIn && !isAgentBusy) {
        // Agent is logged into the in-app Web Phone and available -> ring the app!
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
            action: dialActionUrl,
            method: 'POST',
            redirect: true,
          });
      } else {
        // No user logged into Web Phone or all agents are busy in other calls -> connect to AI agent voicemail
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
        const newCall = await db.call.create({
          data: {
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
        });

        await db.callEvent.create({
          data: {
            organizationId: effectiveOrgId,
            callId: newCall.id,
            eventType: 'answer',
            status: 'in-progress',
            payload: params,
            occurredAt: new Date(),
            webhookEventId,
          },
        });
      }
    } else {
      // Inbound call from customer to virtual number
      if (effectiveOrgId) {
        const callerPhone = params.From || params.from || 'Unknown Caller';
        const calledNumber = destinationNumber || phoneRecord?.e164 || resolvedCallerId || 'Unknown';
        const newCall = await db.call.create({
          data: {
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
        });

        await db.callEvent.create({
          data: {
            organizationId: effectiveOrgId,
            callId: newCall.id,
            eventType: 'answer',
            status: 'in-progress',
            payload: params,
            occurredAt: new Date(),
            webhookEventId,
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
