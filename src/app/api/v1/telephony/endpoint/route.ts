import { NextRequest, NextResponse } from 'next/server';
import * as plivo from 'plivo';
import { authenticateRequest } from '@/lib/api-auth';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const { auth, errorResponse } = await authenticateRequest(req, 'viewer');
  if (errorResponse) return errorResponse;

  const callerId = process.env.PLIVO_CALLER_ID || '+918065531234';

  try {
    const client = new (plivo as any).Client(process.env.PLIVO_AUTH_ID, process.env.PLIVO_AUTH_TOKEN);
    const endpoints = await client.endpoints.list();
    const endpoint = endpoints[0];
    // Plivo's REST API returns an MD5 hash in endpoint.password, NOT the plaintext password.
    // The browser Web Phone SIP stack requires the plaintext password to pass SIP 401/407 digest challenges.
    const password = process.env.PLIVO_ENDPOINT_PASSWORD || 'PilvoAgent2026!Secure';

    if (!endpoint) {
      return NextResponse.json({
        error: 'No Plivo SIP endpoint found. Run setup-web-phone tool first.',
      }, { status: 500 });
    }

    return NextResponse.json({
      mode: 'live',
      username: endpoint.username,
      password,
      callerId,
      alias: endpoint.alias,
      sipUri: endpoint.sipUri || `sip:${endpoint.username}@phone.plivo.com`,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to retrieve endpoint' }, { status: 500 });
  }
}
