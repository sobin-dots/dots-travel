import { NextRequest, NextResponse } from 'next/server';
import * as plivo from 'plivo';
import { db } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-auth';
import { getTenantIntegration } from '@/lib/integrations/credentials-manager';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const { auth, errorResponse } = await authenticateRequest(req, 'viewer');
  if (errorResponse) return errorResponse;

  let authId = process.env.PLIVO_AUTH_ID;
  let authToken = process.env.PLIVO_AUTH_TOKEN;
  let callerId = process.env.PLIVO_CALLER_ID;

  if (auth?.organizationId) {
    const plivoInteg = await getTenantIntegration(auth.organizationId, 'plivo');
    if (plivoInteg?.credentials?.authId && plivoInteg?.credentials?.authToken) {
      authId = plivoInteg.credentials.authId;
      authToken = plivoInteg.credentials.authToken;
      if (plivoInteg.credentials.callerId) {
        callerId = plivoInteg.credentials.callerId;
      }
    }

    if (!callerId) {
      const activeNumber = await db.phoneNumber.findFirst({
        where: { organizationId: auth.organizationId, status: 'active' },
        orderBy: { createdAt: 'desc' },
      });
      if (activeNumber) {
        callerId = activeNumber.e164;
      }
    }
  }

  if (!callerId) {
    callerId = process.env.PLIVO_CALLER_ID || '+918065531234';
  }

  if (!authId || !authToken) {
    return NextResponse.json({
      error: 'Plivo is not configured for this organization. Please enter your Plivo Auth ID & Token in Settings.',
    }, { status: 400 });
  }

  try {
    const client = new (plivo as any).Client(authId, authToken);
    const password = process.env.PLIVO_ENDPOINT_PASSWORD || 'PilvoAgent2026!Secure';
    let endpoints = await client.endpoints.list();
    let endpoint = endpoints[0];

    // Auto-provision endpoint on Plivo for this tenant if not yet created
    if (!endpoint) {
      try {
        const apps = await client.applications.list();
        const app = apps.find((a: any) => a.defaultEndpointApp) || apps[0];
        const cleanAuthId = String(authId).replace(/[^a-zA-Z0-9]/g, '').slice(-4).toLowerCase() || 'agent';
        const cleanOrg = auth?.organizationId ? auth.organizationId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toLowerCase() : 'line';
        const username = `agent${cleanOrg}${cleanAuthId}`;
        endpoint = await client.endpoints.create(username, password, `Agent-${cleanOrg}`, app?.appId);
      } catch (createErr: any) {
        console.warn('Auto-create Plivo endpoint warning:', createErr?.message || createErr);
      }
    }

    if (!endpoint) {
      return NextResponse.json({
        error: 'No Plivo SIP endpoint found. Please check Plivo credentials.',
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
