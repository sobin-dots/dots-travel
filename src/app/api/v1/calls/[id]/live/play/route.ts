import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-auth';
import { getTelephonyProvider } from '@/lib/telephony';

export const runtime = 'nodejs';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { auth, errorResponse } = await authenticateRequest(req, 'operator');
  if (errorResponse) return errorResponse;

  const { id } = await params;
  const call = await db.call.findFirst({
    where: { id, organizationId: auth!.organizationId },
  });

  if (!call) {
    return NextResponse.json(
      { api_id: 'not_found', error: 'Call not found' },
      { status: 404 }
    );
  }

  const body = await req.json();
  const url = body.url;
  if (!url || typeof url !== 'string') {
    return NextResponse.json(
      { api_id: 'bad_req', error: 'url audio parameter is required' },
      { status: 400 }
    );
  }

  try {
    const provider = getTelephonyProvider();
    await provider.playAudio(call.plivoCallUuid, url);

    return NextResponse.json({
      api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
      message: 'Audio played into call successfully',
    });
  } catch (err: any) {
    return NextResponse.json(
      { api_id: 'provider_err', error: err.message },
      { status: 500 }
    );
  }
}
