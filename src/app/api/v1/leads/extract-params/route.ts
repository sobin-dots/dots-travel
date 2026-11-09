import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-auth';
import { extractTripParametersFromTranscript } from '@/lib/deepseek';

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
        };
      } else {
        contactInfo = {
          phone: targetPhone,
        };
      }

      if (!textToAnalyze) {
        const transcription = call.transcriptions?.find(
          (t) => t.status === 'completed' && t.text && t.text.trim().length > 0
        ) || call.transcriptions?.find(
          (t) => t.text && t.text.trim().length > 0
        ) || call.transcriptions?.[0];

        textToAnalyze = transcription?.text?.trim() || '';
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
