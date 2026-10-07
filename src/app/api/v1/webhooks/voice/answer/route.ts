import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { processIncomingWebhook } from '@/lib/webhook-helper';
import { PlivoXmlBuilder } from '@/lib/telephony/xml/builder';

export const runtime = 'nodejs';

async function handleAnswer(req: NextRequest) {
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

  const recordActionUrl = `${publicBase}/api/v1/webhooks/voice/record`;
  const transcriptionUrl = `${publicBase}/api/v1/webhooks/transcription`;

  const builder = new PlivoXmlBuilder();
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
  const destinationNumber = params.To || params.to;

  if (isSipEndpointCall && destinationNumber) {
    // In-browser WebRTC call originating from Plivo Web Phone!
    const callerId = process.env.PLIVO_CALLER_ID || '+918065531234';
    builder
      .record({
        action: recordActionUrl,
        startOnDialAnswer: true,
        redirect: false,
        maxLength: 3600,
        recordSession: true,
        recordChannelType: 'mono',
        transcriptionType: 'auto',
        transcriptionUrl: transcriptionUrl,
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
        transcriptionType: 'auto',
        transcriptionUrl: transcriptionUrl,
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
        transcriptionType: 'auto',
        transcriptionUrl: transcriptionUrl,
        playBeep: true,
      });
  } else {
    // Inbound call from customer/client to our virtual phone number!
    const callerPhone = params.From || params.from || '+918065531234';
    const sipEndpoint = process.env.PLIVO_SIP_ENDPOINT || 'sip:threedotsagent115368431818055514989946@phone.plivo.com';

    builder
      .record({
        action: recordActionUrl,
        startOnDialAnswer: true,
        redirect: false,
        maxLength: 3600,
        recordSession: true,
        recordChannelType: 'mono',
        transcriptionType: 'auto',
        transcriptionUrl: transcriptionUrl,
        playBeep: false,
      })
      .dial(sipEndpoint, {
        callerId: callerPhone,
        timeLimit: 3600,
      })
      // Fallback if not answered or declined:
      .speak('Hello! Welcome to the AI Travel Concierge. The agent is currently unavailable. Please describe your dream vacation, destination, dates, and budget after the beep.', {
        voice: 'WOMAN',
        language: 'en-US',
      })
      .record({
        maxLength: 180,
        action: recordActionUrl,
        transcriptionType: 'auto',
        transcriptionUrl: transcriptionUrl,
        playBeep: true,
      })
      .wait(5);
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
      const org =
        (await db.organization.findFirst({ where: { slug: '3dots' } })) ||
        (await db.organization.findFirst());
      if (org) {
        const callerId = process.env.PLIVO_CALLER_ID || '+918065531234';
        const newCall = await db.call.create({
          data: {
            organizationId: org.id,
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
            organizationId: org.id,
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
      const org =
        (await db.organization.findFirst({ where: { slug: '3dots' } })) ||
        (await db.organization.findFirst());
      if (org) {
        const callerPhone = params.From || params.from || 'Unknown Caller';
        const calledNumber = destinationNumber || params.To || params.to || '+918065531234';
        const newCall = await db.call.create({
          data: {
            organizationId: org.id,
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
            organizationId: org.id,
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
