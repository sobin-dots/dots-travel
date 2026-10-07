import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { authenticateRequest } from '@/lib/api-auth';
import { getTelephonyProvider } from '@/lib/telephony';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const { auth, errorResponse } = await authenticateRequest(req, 'viewer');
  if (errorResponse) return errorResponse;

  const url = new URL(req.url);
  const countryIso = url.searchParams.get('country_iso');
  if (!countryIso) {
    return NextResponse.json(
      { api_id: 'bad_req', error: "country_iso query parameter is required (e.g. 'US', 'GB', 'IN')" },
      { status: 400 }
    );
  }

  const type = url.searchParams.get('type') as any;
  const prefix = url.searchParams.get('prefix') || undefined;
  const region = url.searchParams.get('region') || undefined;
  const limit = Number(url.searchParams.get('limit') || '20');
  const offset = Number(url.searchParams.get('offset') || '0');

  try {
    const provider = getTelephonyProvider();
    const numbers = await provider.searchNumbers({
      countryIso,
      type,
      prefix,
      region,
      limit,
      offset,
    });

    return NextResponse.json({
      api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
      countryIso: countryIso.toUpperCase(),
      count: numbers.length,
      objects: numbers,
    });
  } catch (err: any) {
    return NextResponse.json(
      { api_id: 'provider_err', error: err.message },
      { status: 500 }
    );
  }
}
