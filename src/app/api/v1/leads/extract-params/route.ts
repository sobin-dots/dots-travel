import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-auth';
import { extractTripParametersFromTranscript } from '@/lib/deepseek';
import { transcribeAudioFromUrl } from '@/lib/openai-transcribe';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const { auth, errorResponse } = await authenticateRequest(req, 'operator');
  if (errorResponse) return errorResponse;

  try {
    const body = await req.json();
    const { callId, transcriptText } = body;

    let textToAnalyze = transcriptText || '';
    let contactInfo: any = {};

    if (callId) {
      const call = await db.call.findFirst({
        where: { id: callId, organizationId: auth!.organizationId },
        include: {
          recordings: {
            orderBy: { createdAt: 'desc' },
          },
          transcriptions: {
            orderBy: { createdAt: 'desc' },
          },
        },
      });

      if (!call) {
        return NextResponse.json({ api_id: 'not_found', error: 'Call not found' }, { status: 404 });
      }

      const targetPhone = call.direction === 'outbound' ? call.to : call.from;
      const cleanTarget = targetPhone.replace(/\D/g, '');
      const contact = await db.contact.findFirst({
        where: {
          organizationId: auth!.organizationId,
          OR: [
            { phone: targetPhone },
            ...(cleanTarget ? [{ phone: `+${cleanTarget}` }, { phone: cleanTarget }] : []),
          ],
        },
      });

      if (contact) {
        contactInfo = {
          name: contact.name,
          phone: contact.phone,
          email: contact.email || undefined,
          company: contact.company || undefined,
          referenceDate: call.startedAt,
        };
      } else {
        contactInfo = {
          phone: targetPhone,
          referenceDate: call.startedAt,
        };
      }

      if (!textToAnalyze) {
        const transcription =
          call.transcriptions?.find(
            (t) => t.status === 'completed' && t.text && t.text.trim().length > 0
          ) ||
          call.transcriptions?.find((t) => t.text && t.text.trim().length > 0) ||
          call.transcriptions?.[0];

        textToAnalyze = transcription?.text?.trim() || '';
      }

      // If no transcript text is stored yet, but the call has an audio recording URL, auto-transcribe on demand
      if (!textToAnalyze && call.recordings && call.recordings.length > 0) {
        const bestRec =
          [...call.recordings].sort(
            (a, b) => Number(b.durationSeconds || 0) - Number(a.durationSeconds || 0)
          )[0] || call.recordings[0];

        if (bestRec?.recordingUrl && bestRec.recordingUrl.startsWith('http')) {
          try {
            const trResult = await transcribeAudioFromUrl(bestRec.recordingUrl, {
              organizationId: call.organizationId,
            });
            if (trResult.text && trResult.text.trim().length > 0) {
              textToAnalyze = trResult.text.trim();
              const existingTr = await db.transcription.findFirst({
                where: {
                  recordingId: bestRec.id,
                  organizationId: call.organizationId,
                },
              });
              if (existingTr) {
                await db.transcription.update({
                  where: { id: existingTr.id },
                  data: {
                    text: textToAnalyze,
                    status: 'completed',
                    language: trResult.language || 'en',
                    wordCount: textToAnalyze.split(/\s+/).filter(Boolean).length,
                    source: 'openai_whisper',
                    rawPayload: trResult.rawPayload,
                    updatedAt: new Date(),
                  },
                });
              } else {
                await db.transcription.create({
                  data: {
                    organizationId: call.organizationId,
                    recordingId: bestRec.id,
                    callId: call.id,
                    plivoTranscriptionId: `whisper_${bestRec.plivoRecordingId || crypto.randomBytes(6).toString('hex')}`,
                    recordingSid: bestRec.plivoRecordingId,
                    type: 'transcription',
                    status: 'completed',
                    language: trResult.language || 'en',
                    text: textToAnalyze,
                    wordCount: textToAnalyze.split(/\s+/).filter(Boolean).length,
                    source: 'openai_whisper',
                    rawPayload: trResult.rawPayload,
                  },
                });
              }
            }
          } catch (trErr: any) {
            console.warn('[Extract Params] On-demand transcription failed:', trErr?.message || trErr);
          }
        }
      }
    }

    const params = textToAnalyze.trim()
      ? await extractTripParametersFromTranscript(
          textToAnalyze,
          contactInfo,
          auth!.organizationId
        )
      : {
          destination: '',
          departureDate: '',
          returnDate: '',
          durationDays: undefined,
          headcountAdults: undefined,
          headcountChildren: undefined,
          headcountInfants: undefined,
          targetBudget: undefined,
          hotelTier: '',
          specialRequests: '',
          customerName: contactInfo?.name || '',
          customerEmail: contactInfo?.email || '',
          customerPhone: contactInfo?.phone || '',
        };

    return NextResponse.json({
      api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
      params,
      transcriptSnippet: textToAnalyze
        ? textToAnalyze.slice(0, 300) + (textToAnalyze.length > 300 ? '...' : '')
        : '',
    });
  } catch (err: any) {
    console.error('Error extracting trip parameters:', err);
    return NextResponse.json(
      { api_id: 'server_err', error: err.message || 'Internal error extracting trip parameters' },
      { status: 500 }
    );
  }
}
