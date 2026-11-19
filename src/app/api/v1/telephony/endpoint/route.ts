import { NextRequest, NextResponse } from 'next/server';
import { createHash, randomBytes } from 'node:crypto';
import * as plivo from 'plivo';
import { db } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-auth';
import { encryptData } from '@/lib/crypto';
import { getTenantIntegration, syncTenantPlivoWebhooksIfNeeded } from '@/lib/integrations/credentials-manager';
import { decryptAgentEndpoint, type AgentEndpoint } from '@/lib/telephony/agent-routing';
import { resolveRequestBaseUrl } from '@/lib/webhook-helper';

export const runtime = 'nodejs';
export async function GET(req: NextRequest) {
  const { auth, errorResponse } = await authenticateRequest(req, 'operator'); if (errorResponse) return errorResponse;
  const forceRefresh = ['1', 'true'].includes(req.nextUrl.searchParams.get('refresh') || '');
  const integration = await getTenantIntegration(auth!.organizationId, 'plivo');
  const { authId, authToken } = integration?.credentials || {};
  if (!authId || !authToken) return NextResponse.json({ error: 'Configure Plivo in Settings → Platform & BYOK first.' }, { status: 400 });
  const requestBaseUrl = resolveRequestBaseUrl(req, req.nextUrl.host);
  const syncedAppId = await syncTenantPlivoWebhooksIfNeeded(auth!.organizationId, requestBaseUrl, { force: forceRefresh });
  try {
    const member = await db.membership.findUniqueOrThrow({ where: { organizationId_userId: { organizationId: auth!.organizationId, userId: auth!.userId } } });
    let endpoint = !forceRefresh && member.voiceEndpoint ? decryptAgentEndpoint(member.voiceEndpoint) : null;
    if (endpoint?.authId !== authId) endpoint = null;
    if (!endpoint) {
      endpoint = await db.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM memberships WHERE id = ${member.id} FOR UPDATE`;
        const locked = await tx.membership.findUniqueOrThrow({ where: { id: member.id } });
        if (!forceRefresh && locked.voiceEndpoint) { const saved = decryptAgentEndpoint(locked.voiceEndpoint); if (saved.authId === authId) return saved; }
        const client = new (plivo as any).Client(authId, authToken);
        const identity = createHash('sha256').update(`${auth!.organizationId}:${auth!.userId}`).digest('hex').slice(0, 16);
        const password = `P${randomBytes(12).toString('hex')}9a`;
        const applications = await client.applications.list();
        const appId = syncedAppId || integration?.credentials?.appId || applications.find((a: any) => a.appId === integration?.metadata?.applicationId)?.appId || applications.find((a: any) => a.defaultEndpointApp)?.appId || applications[0]?.appId;
        if (!appId) throw new Error('Set a Plivo application for browser endpoints before receiving calls.');
        const alias = `Agent-${identity}`;
        const expectedPrefix = `a${identity}`;
        let recovered: { username?: string; endpointId?: string; id?: string; sipUri?: string; alias?: string } | null = null;
        for (let offset = 0; offset < 200; offset += 20) {
          const page = await client.endpoints.list({ limit: 20, offset });
          if (!Array.isArray(page) || page.length === 0) break;
          recovered = page.find((e: { alias?: string; username?: string }) => e.alias === alias || e.username === expectedPrefix) || null;
          if (recovered || page.length < 20) break;
        }
        let created;
        if (recovered) {
          await client.endpoints.update(recovered.endpointId || recovered.id, { password, appId });
          created = recovered;
        } else created = await client.endpoints.create(`a${identity}`, password, alias, appId);
        const result: AgentEndpoint = { username: created.username, password, authId, endpointId: created.endpointId || created.id, sipUri: created.sipUri || `sip:${created.username}@phone.plivo.com` };
        if (!result.username || !result.endpointId) throw new Error('The provider did not return browser endpoint details');
        await tx.membership.update({ where: { id: member.id }, data: { voiceEndpoint: { ...encryptData(JSON.stringify(result)) } } });
        return result;
      }, { timeout: 30_000 });
    }
    const number = await db.phoneNumber.findFirst({ where: { organizationId: auth!.organizationId, status: 'active' }, orderBy: { createdAt: 'desc' } });
    return NextResponse.json({ mode: 'live', username: endpoint.username, password: endpoint.password, sipUri: endpoint.sipUri, callerId: integration?.credentials?.callerId || number?.e164 || '' }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not prepare browser phone' }, { status: 503 }); }
}
