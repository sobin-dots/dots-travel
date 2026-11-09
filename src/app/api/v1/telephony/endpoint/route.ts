import { NextRequest, NextResponse } from 'next/server';
import * as plivo from 'plivo';
import { db } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-auth';
import { getTenantIntegration, saveTenantIntegration } from '@/lib/integrations/credentials-manager';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const { auth, errorResponse } = await authenticateRequest(req, 'viewer');
  if (errorResponse) return errorResponse;

  if (!auth?.organizationId) {
    return NextResponse.json({ error: 'Organization context required' }, { status: 400 });
  }

  const plivoInteg = await getTenantIntegration(auth.organizationId, 'plivo');
  const authId = plivoInteg?.credentials?.authId;
  const authToken = plivoInteg?.credentials?.authToken;
  let callerId = plivoInteg?.credentials?.callerId;

  if (!authId || !authToken) {
    return NextResponse.json({
      error: 'Plivo is not configured for this organization. Please enter your Plivo Auth ID & Token in Settings -> Platform & BYOK.',
    }, { status: 400 });
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

  try {
    const client = new (plivo as any).Client(authId, authToken);
    const password = plivoInteg?.credentials?.endpointPassword || 'PilvoAgent2026!Secure';
    const endpoints = await client.endpoints.list();
    let endpoint =
      endpoints.find(
        (e: any) =>
          plivoInteg?.credentials?.endpointUsername &&
          e.username === plivoInteg.credentials.endpointUsername
      ) || endpoints[0];

    // Auto-provision endpoint on Plivo for this tenant if not yet created
    if (!endpoint) {
      try {
        const apps = await client.applications.list();
        const app = apps.find((a: any) => a.defaultEndpointApp) || apps[0];
        const cleanAuthId = String(authId).replace(/[^a-zA-Z0-9]/g, '').slice(-4).toLowerCase() || 'agent';
        const cleanOrg = auth.organizationId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toLowerCase() || 'line';
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

    const sipUri = endpoint.sipUri || `sip:${endpoint.username}@phone.plivo.com`;
    const endpointId = endpoint.endpointId || endpoint.id;

    // Ensure the endpoint password on Plivo is synchronized with the password we give the browser WebRTC SDK
    if (endpointId && !plivoInteg.credentials.passwordSynced) {
      try {
        await client.endpoints.update(endpointId, { password });
      } catch (pwErr: any) {
        console.warn('Plivo endpoint password sync notice:', pwErr?.message || pwErr);
      }
    }

    // Persist endpoint details into DB if not yet stored on TenantIntegration
    if (
      plivoInteg.credentials.sipEndpoint !== sipUri ||
      plivoInteg.credentials.endpointUsername !== endpoint.username ||
      !plivoInteg.credentials.passwordSynced ||
      (callerId && !plivoInteg.credentials.callerId)
    ) {
      const proto = req.headers.get('x-forwarded-proto') || (req.url.startsWith('https') ? 'https' : 'http');
      const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
      const requestBaseUrl = host && !host.includes('localhost') ? `${proto}://${host}` : undefined;
      try {
        await saveTenantIntegration(auth.organizationId, {
          provider: 'plivo',
          credentials: {
            ...plivoInteg.credentials,
            callerId: callerId || plivoInteg.credentials.callerId || '',
            sipEndpoint: sipUri,
            endpointUsername: endpoint.username,
            endpointPassword: password,
            endpointId,
            passwordSynced: true,
          },
          metadata: plivoInteg.metadata,
          webhookBaseUrl: requestBaseUrl,
        });
      } catch {}
    }

    return NextResponse.json({
      mode: 'live',
      username: endpoint.username,
      password,
      callerId: callerId || '',
      alias: endpoint.alias,
      sipUri,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to retrieve endpoint' }, { status: 500 });
  }
}
