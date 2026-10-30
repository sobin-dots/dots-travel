import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { processIncomingWebhook } from '@/lib/webhook-helper';
import { PlivoXmlBuilder } from '@/lib/telephony/xml/builder';

export const runtime = 'nodejs';

export async function handleAnswer(req: NextRequest) {
  const result = await processIncomingWebhook(req, 'voice', (p) => {
    return `${p.CallUUID || p.call_uuid || 'unknown'}_answer`;
  });

  if (!result.valid) return result.errorResponse!;

  const { params, isDuplicate, webhookEventId } = result;
  const callUuid = params.CallUUID || params.call_uuid;

  // Build Plivo XML response
  const urlObj = new URL(req.url);
  const mode = urlObj.searchParams.get('mode') || params.mode || 'default';
  const forwardTo = urlObj.searchParams.get('forwardTo') || params.forwardTo;

  const publicBase = (
    process.env.PUBLIC_BASE_URL ||
    `${req.headers.get('x-forwarded-proto') || 'https'}://${req.headers.get('x-forwarded-host') || req.headers.get('host')}`
  ).trim().replace(/\/+$/, '');

  // Resolve tenant organization via hybrid approach (query param -> DID lookup -> fallback)
  const queryOrgId = urlObj.searchParams.get('orgId') || params.orgId;
  const destinationNumber = params.To || params.to;
  let resolvedOrg: any = null;
  let phoneRecord: any = null;

  if (queryOrgId) {
    resolvedOrg = await db.organization.findFirst({
      where: { OR: [{ id: queryOrgId }, { slug: queryOrgId }] },
    });
  }

  if (destinationNumber) {
    const cleanNumber = String(destinationNumber).replace(/\D/g, '');
    phoneRecord = await db.phoneNumber.findFirst({
      where: {
        OR: [
          { e164: destinationNumber },
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

  const effectiveOrgId = resolvedOrg?.id;
  const recordActionUrl = `${publicBase}/api/v1/webhooks/voice/record${effectiveOrgId ? `?orgId=${effectiveOrgId}` : ''}`;

  const builder = new PlivoXmlBuilder();

  // Plivo Audio Streaming (<Stream>) integration
  const streamWebSocketUrl = process.env.PLIVO_STREAM_WS_URL || (
    publicBase.startsWith('http')
      ? publicBase.replace(/^http/, 'ws') + '/api/plivo/stream'
      : undefined
  );
  const enableAudioStreaming = process.env.ENABLE_AUDIO_STREAMING === 'true' || Boolean(process.env.PLIVO_STREAM_WS_URL);

  if (enableAudioStreaming && streamWebSocketUrl) {
    builder.stream(streamWebSocketUrl, {
      audioTrack: 'both',
      streamTimeout: 86400,
    });
  }

  const rawFrom = String(params.From || params.from || '');
  const isSipEndpointCall = Boolean(
    rawFrom.startsWith('sip:') ||
    rawFrom.includes('threedotsagent') ||
    params.Direction === 'outbound' ||
    params.direction === 'outbound' ||
    params.CallDirection === 'outbound' ||
    params.callDirection === 'outbound' ||
    params['X-PH-callerId'] ||
    params['x-ph-callerid']
  );

  if (isSipEndpointCall && destinationNumber) {
    // In-browser WebRTC call originating from Plivo Web Phone!
    const callerId =
      params['X-PH-callerId'] ||
      params['x-ph-callerid'] ||
      phoneRecord?.e164 ||
      process.env.PLIVO_CALLER_ID ||
      '+918065531234';
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
        callerId,
      });
  } else if ((mode === 'forward' || mode === 'bridge') && forwardTo) {
    const callerId = params.From || params.from;
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
    // Inbound call from customer/client to our virtual phone number!
    const callerPhone = params.From || params.from || '+918065531234';

    // 1. Check if forwarding to a specific phone number is configured
    if (forwardTo) {
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
        .dial(forwardTo, {
          callerId: callerPhone,
          timeLimit: 3600,
          timeout: 30,
        })
        // Fallback if forwarding is not answered:
        .speak('Hello! Welcome to 3dots AI Travel Concierge. Our travel specialists are currently assisting other travelers. Please describe your dream vacation, destination, dates, and budget after the beep, and we will prepare a personalized itinerary for you.', {
          voice: 'WOMAN',
          language: 'en-US',
        })
        .record({
          maxLength: 180,
          action: recordActionUrl,
          playBeep: true,
        })
        .wait(5);
    } else {
      // 2. Resolve tenant's active Plivo WebRTC Web Phone SIP endpoint
      let sipEndpoint = process.env.PLIVO_SIP_ENDPOINT;
      if (!sipEndpoint && effectiveOrgId) {
        try {
          const { getTenantIntegration } = await import('@/lib/integrations/credentials-manager');
          const plivoModule = await import('plivo');
          const tenantInteg = await getTenantIntegration(effectiveOrgId, 'plivo');
          if (tenantInteg?.credentials?.authId && tenantInteg?.credentials?.authToken) {
            const client = new (plivoModule as any).Client(tenantInteg.credentials.authId, tenantInteg.credentials.authToken);
            const eps = await client.endpoints.list();
            if (eps && eps[0]?.username) {
              sipEndpoint = `sip:${eps[0].username}@phone.plivo.com`;
            }
          }
        } catch (err) {
          console.warn('Failed to resolve tenant Plivo endpoint dynamically:', err);
        }
      }

      if (!sipEndpoint) {
        sipEndpoint = 'sip:agent3dotsbiny442971121819099391993@phone.plivo.com';
      }

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
          timeout: 25, // Ring Web Phone for up to 25s
        })
        // Fallback if Web Phone not answered or declined:
        .speak('Hello! Welcome to 3dots AI Travel Concierge. Our travel specialists are currently assisting other travelers. Please describe your dream vacation, destination, dates, and budget after the beep, and we will prepare a personalized itinerary for you.', {
          voice: 'WOMAN',
          language: 'en-US',
        })
        .record({
          maxLength: 180,
          action: recordActionUrl,
          playBeep: true,
        })
        .wait(5);
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
      if (resolvedOrg) {
        const callerId =
          params['X-PH-callerId'] ||
          params['x-ph-callerid'] ||
          phoneRecord?.e164 ||
          process.env.PLIVO_CALLER_ID ||
          '+918065531234';
        const newCall = await db.call.create({
          data: {
            organizationId: resolvedOrg.id,
            phoneNumberId: phoneRecord?.id || null,
            plivoCallUuid: callUuid,
            from: callerId,
            to: destinationNumber || 'Unknown',
            direction: 'outbound',
            status: 'in-progress',
            recordingEnabled: true,
            transcriptionEnabled: true,
            transcriptionLanguage: 'en-US',
            answeredAt: new Date(),
          },
        });

        await db.callEvent.create({
          data: {
            organizationId: resolvedOrg.id,
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
      if (resolvedOrg) {
        const callerPhone = params.From || params.from || 'Unknown Caller';
        const calledNumber = destinationNumber || params.To || params.to || phoneRecord?.e164 || 'Unknown';
        const newCall = await db.call.create({
          data: {
            organizationId: resolvedOrg.id,
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
            organizationId: resolvedOrg.id,
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
