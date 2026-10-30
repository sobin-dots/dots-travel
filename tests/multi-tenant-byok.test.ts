import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'node:crypto';
import { db } from '../src/lib/db';
import { hashPassword, signAccessToken, verifyAccessToken } from '../src/lib/auth-tokens';
import {
  saveTenantIntegration,
  getTenantIntegration,
  getTenantIntegrationsSummary,
  deleteTenantIntegration,
} from '../src/lib/integrations/credentials-manager';
import { getTenantTelephonyProvider } from '../src/lib/telephony';
import { resolveTenantOpenAiConfig } from '../src/lib/openai-transcribe';

describe('Multi-Tenant BYOK Integration & Switching Architecture', () => {
  let tenantA: any;
  let tenantB: any;
  let user: any;

  beforeAll(async () => {
    const ts = Date.now();

    // 1. Create User
    const passwordHash = await hashPassword('SecretTestPassword123!');
    user = await db.user.create({
      data: {
        email: `byok_tester_${ts}@example.com`,
        name: 'BYOK Test User',
        passwordHash,
        status: 'active',
      },
    });

    // 2. Create Tenant A
    tenantA = await db.organization.create({
      data: {
        name: `Acme Agency ${ts}`,
        slug: `acme-agency-${ts}`,
        primaryTelephonyProvider: 'plivo',
      },
    });

    await db.membership.create({
      data: {
        organizationId: tenantA.id,
        userId: user.id,
        role: 'owner',
      },
    });

    // 3. Create Tenant B
    tenantB = await db.organization.create({
      data: {
        name: `Zenith Travels ${ts}`,
        slug: `zenith-travels-${ts}`,
        primaryTelephonyProvider: 'msg91',
      },
    });

    await db.membership.create({
      data: {
        organizationId: tenantB.id,
        userId: user.id,
        role: 'admin',
      },
    });
  });

  it('stores and decrypts tenant credentials with AES-256-GCM without plaintext leakage', async () => {
    // Tenant A configures their OpenAI key
    const rawApiKey = 'sk-proj-test1234567890abcdefghijklmnopqrstuvwxyz';
    await saveTenantIntegration(tenantA.id, {
      provider: 'openai',
      category: 'transcription',
      credentials: { apiKey: rawApiKey },
      metadata: { model: 'gpt-4o-transcribe' },
    });

    // Verify row in database is encrypted
    const row = await db.tenantIntegration.findUnique({
      where: {
        organizationId_provider: {
          organizationId: tenantA.id,
          provider: 'openai',
        },
      },
    });

    expect(row).toBeDefined();
    expect(row?.credentialsEncrypted).not.toContain(rawApiKey);
    expect(row?.encIv).toBeDefined();
    expect(row?.encAuthTag).toBeDefined();
    expect((row?.maskedDetails as any)?.apiKeyLast4).toBe('wxyz');

    // Decrypt and verify matching secret
    const decrypted = await getTenantIntegration(tenantA.id, 'openai');
    expect(decrypted).toBeDefined();
    expect(decrypted?.credentials.apiKey).toBe(rawApiKey);
    expect(decrypted?.metadata.model).toBe('gpt-4o-transcribe');

    // Ensure Tenant B cannot access Tenant A credentials
    const tenantBInteg = await getTenantIntegration(tenantB.id, 'openai');
    expect(tenantBInteg).toBeNull();
  });

  it('configures MSG91 provider keys and updates primary telephony provider', async () => {
    // Tenant B configures MSG91 keys
    const msg91Key = 'msg91_auth_key_super_secret_4455';
    await saveTenantIntegration(tenantB.id, {
      provider: 'msg91',
      category: 'telephony',
      credentials: {
        authKey: msg91Key,
        senderId: 'TRVZNT',
        callerId: '+919988776655',
      },
    });

    const providerB = await getTenantTelephonyProvider(tenantB.id);
    expect(providerB).toBeDefined();
    expect(providerB.mode).toBe('live');

    // Verify tenant integrations summary hides plaintext keys
    const summary = await getTenantIntegrationsSummary(tenantB.id);
    expect(summary.organizationId).toBe(tenantB.id);
    expect(summary.primaryTelephonyProvider).toBe('msg91');
    expect(summary.webhookUrls.msg91Voice).toContain(`orgId=${tenantB.id}`);
    expect(summary.webhookUrls.msg91Sms).toContain(`orgId=${tenantB.id}`);

    const msg91SummaryItem = summary.integrations.find((i: any) => i.provider === 'msg91');
    expect(msg91SummaryItem).toBeDefined();
    expect((msg91SummaryItem as any).credentialsEncrypted).toBeUndefined();
    expect((msg91SummaryItem as any).maskedDetails.authKeyLast4).toBe('4455');
  });

  it('switches user active organization and generates isolated Bearer tokens', async () => {
    // 1. Initial token for Tenant A
    const tokenA = await signAccessToken({
      userId: user.id,
      email: user.email,
      organizationId: tenantA.id,
      role: 'owner',
    });

    const payloadA = await verifyAccessToken(tokenA);
    expect(payloadA?.organizationId).toBe(tenantA.id);
    expect(payloadA?.role).toBe('owner');

    // 2. Switch to Tenant B
    const tokenB = await signAccessToken({
      userId: user.id,
      email: user.email,
      organizationId: tenantB.id,
      role: 'admin',
    });

    const payloadB = await verifyAccessToken(tokenB);
    expect(payloadB?.organizationId).toBe(tenantB.id);
    expect(payloadB?.role).toBe('admin');
    expect(payloadB?.organizationId).not.toBe(payloadA?.organizationId);
  });

  it('resolves primary transcription model configured in settings for tenant and supports model override', async () => {
    // 1. Configure Tenant A with gpt-4o-transcribe
    await saveTenantIntegration(tenantA.id, {
      provider: 'openai',
      category: 'transcription',
      credentials: { apiKey: 'sk-proj-test_model_resolution_key_112233' },
      metadata: { model: 'gpt-4o-transcribe', baseUrl: 'https://custom-openai.test/v1' },
    });

    const configA = await resolveTenantOpenAiConfig({ organizationId: tenantA.id });
    expect(configA.model).toBe('gpt-4o-transcribe');
    expect(configA.baseUrl).toBe('https://custom-openai.test/v1');

    // 2. Configure Tenant B with whisper-1
    await saveTenantIntegration(tenantB.id, {
      provider: 'openai',
      category: 'transcription',
      credentials: { apiKey: 'sk-proj-tenant_b_whisper_standard_445566' },
      metadata: { model: 'whisper-1' },
    });

    const configB = await resolveTenantOpenAiConfig({ organizationId: tenantB.id });
    expect(configB.model).toBe('whisper-1');

    // 3. Explicit override should take precedence when requested
    const override = await resolveTenantOpenAiConfig({
      organizationId: tenantA.id,
      model: 'whisper-1',
    });
    expect(override.model).toBe('whisper-1');

    // 4. Default or empty model should retain tenant's configured model
    const defaultCheck = await resolveTenantOpenAiConfig({
      organizationId: tenantA.id,
      model: 'default',
    });
    expect(defaultCheck.model).toBe('gpt-4o-transcribe');
  });

  it('safely removes an integration when requested', async () => {
    await deleteTenantIntegration(tenantA.id, 'openai');
    const lookup = await getTenantIntegration(tenantA.id, 'openai');
    expect(lookup).toBeNull();
  });
});
