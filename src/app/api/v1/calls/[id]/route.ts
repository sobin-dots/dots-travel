import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-auth';

import * as plivo from 'plivo';

export const runtime = 'nodejs';

function getHangupExplanation(code?: number | null): string {
  if (!code) return 'Call ended or not yet completed';
  if (code >= 4000 && code < 4100) return 'Normal Call Completion: The call was cleanly terminated by caller or callee.';
  if (code === 5030) return 'Concurrency Limit Exceeded: Account reached maximum concurrent call channels.';
  if (code === 8011) return 'Invalid Answer XML: The answer URL returned invalid or unparseable Plivo XML.';
  if (code >= 1000 && code < 2000) return 'Account / Billing: Insufficient credits or account permissions.';
  if (code >= 2000 && code < 3000) return 'Invalid Destination: The destination number is unallocated, invalid, or barred.';
  if (code >= 3000 && code < 4000) return 'User Busy / No Answer: The recipient declined or did not answer within timeout.';
  return `Plivo Hangup Code ${code}`;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { auth, errorResponse } = await authenticateRequest(req, 'viewer');
  if (errorResponse) return errorResponse;

  const { id } = await params;
  let call = await db.call.findFirst({
    where: {
      id,
      organizationId: auth!.organizationId,
    },
    include: {
      phoneNumber: true,
      events: {
        orderBy: { occurredAt: 'asc' },
      },
      recordings: {
        include: {
          transcriptions: true,
        },
      },
      transcriptions: true,
    },
  });

  if (!call) {
    return NextResponse.json(
      { api_id: 'not_found', error: 'Call record not found' },
      { status: 404 }
    );
  }

  // Carrier Realtime Sync: If call has no recordings yet, query Plivo API for any pending recordings
  if (call.recordings.length === 0 && call.plivoCallUuid) {
    const isLive = process.env.TELEPHONY_MODE === 'live';
    if (isLive && process.env.PLIVO_AUTH_ID && process.env.PLIVO_AUTH_TOKEN) {
      try {
        const client = new (plivo as any).Client(process.env.PLIVO_AUTH_ID, process.env.PLIVO_AUTH_TOKEN);
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
          // Reload updated call
          call = await db.call.findFirst({
            where: { id: call.id },
            include: {
              phoneNumber: true,
              events: { orderBy: { occurredAt: 'asc' } },
              recordings: { include: { transcriptions: true } },
              transcriptions: true,
            },
          });
        }
      } catch (err: any) {
        console.warn('Live recording sync notice:', err.message);
      }
    } else if (!isLive && call.status === 'completed') {
      // Auto-populate simulated recording & transcript for testing
      try {
        const simRecId = `rec_sim_${call.id.slice(0, 8)}`;
        const rec = await db.recording.upsert({
          where: { plivoRecordingId: simRecId },
          update: {},
          create: {
            organizationId: call.organizationId,
            callId: call.id,
            plivoRecordingId: simRecId,
            recordingUrl: `https://media.pilvo.local/recordings/${simRecId}.mp3`,
            durationSeconds: call.durationSeconds || 45,
            status: 'completed',
          },
        });

        if (call.transcriptions.length === 0) {
          const defaultTranscript = `Hi, I am planning a 7-day family vacation to Japan for 4 people (2 adults, 2 kids) next month. We would love to spend 3 days exploring Tokyo (Shinjuku, Akihabara, and teamLab), take the Shinkansen bullet train to Kyoto for temples and bamboo groves, and finish with a day trip to Mount Fuji. Our budget is around $8,000 including 4-star hotels and private transfers.`;
          await db.transcription.create({
            data: {
              organizationId: call.organizationId,
              callId: call.id,
              recordingId: rec.id,
              plivoTranscriptionId: `tr_sim_${call.id.slice(0, 8)}`,
              recordingSid: simRecId,
              status: 'completed',
              text: defaultTranscript,
              wordCount: defaultTranscript.split(/\s+/).length,
              source: 'carrier_asr',
            },
          });
        }

        // Reload
        call = await db.call.findFirst({
          where: { id: call.id },
          include: {
            phoneNumber: true,
            events: { orderBy: { occurredAt: 'asc' } },
            recordings: { include: { transcriptions: true } },
            transcriptions: true,
          },
        });
      } catch { }
    }
  }

  if (!call) {
    return NextResponse.json({ api_id: 'not_found', error: 'Call not found' }, { status: 404 });
  }

  const isRecordingProcessing =
    call.recordings.length === 0 &&
    (call.status === 'in-progress' || call.recordingEnabled || call.status === 'completed');

  const isTranscriptionProcessing =
    call.transcriptions.length === 0 &&
    (call.status === 'in-progress' || call.transcriptionEnabled || call.status === 'completed');

  return NextResponse.json({
    api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
    call: {
      ...call,
      isRecordingProcessing,
      isTranscriptionProcessing,
      hangupExplanation: getHangupExplanation(call.hangupCauseCode),
    },
  });
}
