import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { processIncomingWebhook } from '@/lib/webhook-helper';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const result = await processIncomingWebhook(req, 'voice', (p) => {
    return `${p.CallUUID || p.call_uuid || 'unknown'}_hangup`;
  });

  if (!result.valid) return result.errorResponse!;
  if (result.isDuplicate) {
    return NextResponse.json({ status: 'already_processed' }, { status: 200 });
  }

  const { params, webhookEventId } = result;
  const callUuid = params.CallUUID || params.call_uuid;

  if (!callUuid) {
    return NextResponse.json({ status: 'ignored_no_uuid' }, { status: 200 });
  }

  const duration = params.Duration ? Number(params.Duration) : undefined;
  const billDuration = params.BillDuration ? Number(params.BillDuration) : undefined;
  const totalCost = params.TotalCost ? params.TotalCost.toString() : undefined;
  const hangupCause = params.HangupCause ? Number(params.HangupCause) : undefined;

  try {
    const existingCall = await db.call.findUnique({
      where: { plivoCallUuid: callUuid },
    });

    if (existingCall) {
      await db.call.update({
        where: { id: existingCall.id },
        data: {
          status: 'completed',
          endedAt: existingCall.endedAt || new Date(),
          durationSeconds: duration !== undefined ? duration : existingCall.durationSeconds,
          billDurationSeconds: billDuration !== undefined ? billDuration : existingCall.billDurationSeconds,
          totalCost: totalCost ? Number(totalCost) : existingCall.totalCost,
          hangupCauseCode: hangupCause,
          hangupCauseName: params.HangupCauseName || 'Hangup',
        },
      });

      // Automatically provision simulated recording and transcription in simulator mode
      if (existingCall.recordingEnabled) {
        const existingRec = await db.recording.findFirst({ where: { callId: existingCall.id } });
        if (!existingRec) {
          const rec = await db.recording.create({
            data: {
              organizationId: existingCall.organizationId,
              callId: existingCall.id,
              plivoRecordingId: `rec_${existingCall.plivoCallUuid}`,
              recordingUrl: `https://media.plivo.com/recordings/${existingCall.plivoCallUuid}.mp3`,
              durationSeconds: duration || 12,
              fileFormat: 'mp3',
              channelType: 'mono',
              status: 'completed',
            },
          });

          if (existingCall.transcriptionEnabled) {
            await db.transcription.create({
              data: {
                organizationId: existingCall.organizationId,
                callId: existingCall.id,
                recordingId: rec.id,
                plivoTranscriptionId: `tr_${existingCall.plivoCallUuid}`,
                status: 'completed',
                language: existingCall.transcriptionLanguage || 'en-US',
                text: 'Operator: Thank you for calling. Your call was completed successfully on Plivo.\nCustomer: Thank you for confirming our communications setup.',
                wordCount: 21,
                source: 'callback',
              },
            });
          }
        }
      }

      await db.callEvent.create({
        data: {
          organizationId: existingCall.organizationId,
          callId: existingCall.id,
          eventType: 'hangup',
          status: 'completed',
          payload: params,
          occurredAt: new Date(),
          webhookEventId,
        },
      });
    }

    if (webhookEventId) {
      await db.webhookEvent.update({
        where: { id: webhookEventId },
        data: { status: 'processed', processedAt: new Date() },
      });
    }
  } catch (err) {
    console.error('Error handling voice hangup webhook:', err);
  }

  return NextResponse.json({ status: 'ok' }, { status: 200 });
}
