import { WebSocket } from 'ws';
import crypto from 'node:crypto';
import { convertMulawChunksToWav, estimateMulawDurationSeconds } from '../audio/wav-converter';
import { transcribeAudioWithOpenAi } from '../openai-transcribe';
import { db } from '../db';
import { logAuditEvent } from '../api-auth';

interface StreamSession {
  streamId: string;
  callId: string;
  startedAt: number;
  chunks: Buffer[];
  totalBytes: number;
  finalized: boolean;
  metadata?: any;
}

const activeSessions = new Map<string, StreamSession>();

/**
 * Attaches a WebSocket connection to the Plivo Audio Streaming protocol.
 * Handles incoming `start`, `media`, `stop` events, buffers 8kHz µ-law audio,
 * and transcribes to 16kHz WAV using OpenAI Whisper upon call termination.
 */
export function handlePlivoStreamWebSocket(ws: WebSocket) {
  let currentSessionKey: string | null = null;

  ws.on('message', async (data: any) => {
    try {
      const message = JSON.parse(data.toString());
      const eventType = message.event;

      switch (eventType) {
        case 'start': {
          const startData = message.start || {};
          const streamId = startData.streamId || `stream_${Date.now()}`;
          const callId = startData.callId || message.callId || '';

          const sessionKey = streamId || callId || `s_${Date.now()}`;
          currentSessionKey = sessionKey;

          activeSessions.set(sessionKey, {
            streamId,
            callId,
            startedAt: Date.now(),
            chunks: [],
            totalBytes: 0,
            finalized: false,
            metadata: startData,
          });

          console.log(`[Plivo Stream] Started session: ${sessionKey} (CallId: ${callId}, StreamId: ${streamId})`);
          break;
        }

        case 'media': {
          if (!currentSessionKey) {
            // If start event was missing or out of order, fallback to callId or temp key
            const callId = message.callId || 'unknown_stream';
            currentSessionKey = callId;
            if (!activeSessions.has(callId)) {
              activeSessions.set(callId, {
                streamId: message.streamId || `stream_${Date.now()}`,
                callId,
                startedAt: Date.now(),
                chunks: [],
                totalBytes: 0,
                finalized: false,
              });
            }
          }

          if (currentSessionKey) {
            const session = activeSessions.get(currentSessionKey);
            if (session && !session.finalized) {
              const payload = message.media?.payload;
              if (payload) {
                const chunkBuffer = Buffer.from(payload, 'base64');
                session.chunks.push(chunkBuffer);
                session.totalBytes += chunkBuffer.length;
              }
            }
          }
          break;
        }

        case 'stop': {
          console.log(`[Plivo Stream] Received stop event for session: ${currentSessionKey}`);
          if (currentSessionKey) {
            await finalizeSession(currentSessionKey);
          }
          break;
        }

        default:
          break;
      }
    } catch (err: any) {
      console.error('[Plivo Stream] Error handling message:', err.message);
    }
  });

  ws.on('close', async () => {
    console.log(`[Plivo Stream] Socket closed for session: ${currentSessionKey}`);
    if (currentSessionKey) {
      await finalizeSession(currentSessionKey);
    }
  });

  ws.on('error', (err: any) => {
    console.error(`[Plivo Stream] WebSocket error on session ${currentSessionKey}:`, err.message);
  });
}

/**
 * Compiles buffered µ-law audio chunks into 16kHz PCM WAV, invokes OpenAI Whisper,
 * and saves the generated transcript to the Prisma database.
 */
async function finalizeSession(sessionKey: string) {
  const session = activeSessions.get(sessionKey);
  if (!session || session.finalized) return;
  session.finalized = true;

  const chunkCount = session.chunks.length;
  const totalBytes = session.totalBytes;
  const durationEst = estimateMulawDurationSeconds(totalBytes);

  console.log(
    `[Plivo Stream] Finalizing session: ${sessionKey} (CallId: ${session.callId}) | Chunks: ${chunkCount} | Raw µ-law: ${totalBytes} bytes (~${durationEst}s)`
  );

  if (totalBytes === 0) {
    console.warn(`[Plivo Stream] No audio data received for session: ${sessionKey}`);
    activeSessions.delete(sessionKey);
    return;
  }

  try {
    // 1. Convert 8kHz µ-law chunks to standard 16kHz 16-bit mono PCM WAV
    const wavBuffer = convertMulawChunksToWav(session.chunks, { sampleRate: 16000 });
    console.log(`[Plivo Stream] Converted to 16kHz PCM WAV: ${wavBuffer.length} bytes`);

    // 2. Transcribe via OpenAI Whisper
    const whisperResult = await transcribeAudioWithOpenAi(
      wavBuffer,
      `stream_${session.callId || session.streamId}.wav`,
      {
        model: process.env.OPENAI_TRANSCRIPTION_MODEL || 'whisper-1',
        prompt: 'Customer phone consultation regarding vacation travel itinerary, flight booking, and hotel accommodations.',
      }
    );

    console.log(
      `[Plivo Stream] Whisper transcription completed: ${whisperResult.text.length} chars | Lang: ${whisperResult.language}`
    );

    // 3. Find matching Call record in DB
    let call = null;
    if (session.callId) {
      call = await db.call.findFirst({
        where: {
          OR: [
            { plivoCallUuid: session.callId },
            { id: session.callId },
            { parentCallUuid: session.callId },
          ],
        },
        include: { recordings: true },
      });
    }

    // Fallback: If not found by UUID, find the latest active/completed call
    if (!call) {
      call = await db.call.findFirst({
        orderBy: { createdAt: 'desc' },
        include: { recordings: true },
      });
    }

    if (call) {
      const recordingId = call.recordings?.[0]?.id || null;
      const transcriptionId = `stream_${crypto.randomBytes(8).toString('hex')}`;

      // Save transcription to database
      const transcription = await db.transcription.create({
        data: {
          organizationId: call.organizationId,
          callId: call.id,
          recordingId,
          plivoTranscriptionId: transcriptionId,
          type: 'transcription',
          status: 'completed',
          language: whisperResult.language || 'en',
          text: whisperResult.text,
          wordCount: (whisperResult.text || '').split(/\s+/).filter(Boolean).length,
          segments: (whisperResult.segments as any) || null,
          source: 'plivo_stream',
          rawPayload: whisperResult.rawPayload,
        },
      });

      // Update call flags
      await db.call.update({
        where: { id: call.id },
        data: {
          transcriptionEnabled: true,
          transcriptionLanguage: whisperResult.language || 'en',
        },
      });

      await logAuditEvent({
        organizationId: call.organizationId,
        action: 'transcription.plivo_stream_completed',
        targetType: 'Call',
        targetId: call.id,
        metadata: {
          callUuid: session.callId,
          streamId: session.streamId,
          transcriptionId: transcription.id,
          wordCount: transcription.wordCount,
          durationEstimated: durationEst,
        },
      });

      console.log(`[Plivo Stream] Successfully linked transcription ${transcription.id} to Call ${call.id}`);
    } else {
      console.warn(`[Plivo Stream] Call record not found for callId: ${session.callId}`);
    }
  } catch (err: any) {
    console.error(`[Plivo Stream] Finalization failed for session ${sessionKey}:`, err.message);
  } finally {
    activeSessions.delete(sessionKey);
  }
}
