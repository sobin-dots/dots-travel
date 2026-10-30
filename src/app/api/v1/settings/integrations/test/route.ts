import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { authenticateRequest } from '@/lib/api-auth';
import { testProviderCredentials } from '@/lib/integrations/credentials-manager';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const { errorResponse } = await authenticateRequest(req, 'admin');
  if (errorResponse) return errorResponse;

  try {
    const body = await req.json();
    const { provider, credentials, metadata } = body;

    if (!provider || !credentials) {
      return NextResponse.json(
        { api_id: 'bad_req', error: 'Missing required fields: provider and credentials' },
        { status: 400 }
      );
    }

    const verification = await testProviderCredentials(provider, credentials, metadata);

    return NextResponse.json({
      api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
      provider,
      valid: verification.valid,
      error: verification.error,
      details: verification.details,
    });
  } catch (err: any) {
    return NextResponse.json(
      { api_id: 'server_err', error: err.message || 'Verification failed' },
      { status: 500 }
    );
  }
}
