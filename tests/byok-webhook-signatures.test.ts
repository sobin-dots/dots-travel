import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { db } from '../src/lib/db';
import { encryptData } from '../src/lib/crypto';
import { computeV3Signature } from '../src/lib/telephony/webhook-validator';
import { processIncomingWebhook } from '../src/lib/webhook-helper';

describe('Multi-Tenant BYOK Webhook Signature Validation', () => {
  let org: any;
  const tenantAuthId = 'MANTENANT1234567890';
  const tenantAuthToken = 'tenant_secret_byok_token_9999';

  beforeAll(async () => {
    // 1. Create tenant org
    org = await db.organization.upsert({
      where: { slug: 'byok-webhook-test-org' },
      update: {},
      create: { name: 'BYOK Webhook Test Org', slug: 'byok-webhook-test-org' },
    });

    // 2. Save encrypted BYOK integration for Plivo
    const encrypted = encryptData(
      JSON.stringify({
        authId: tenantAuthId,
        authToken: tenantAuthToken,
      })
    );

    await db.tenantIntegration.upsert({
      where: {
        organizationId_provider: {
          organizationId: org.id,
          provider: 'plivo',
        },
      },
      update: {
        credentialsEncrypted: encrypted.ciphertext,
        encIv: encrypted.iv,
        encAuthTag: encrypted.authTag,
        status: 'verified',
      },
      create: {
        organizationId: org.id,
        provider: 'plivo',
        category: 'telephony',
        credentialsEncrypted: encrypted.ciphertext,
        encIv: encrypted.iv,
        encAuthTag: encrypted.authTag,
        status: 'verified',
      },
    });
  });

  afterAll(async () => {
    await db.organization.deleteMany({
      where: { slug: 'byok-webhook-test-org' },
    });
    await db.$disconnect();
  });

  it('successfully validates webhook signed with tenant BYOK token via orgId query param', async () => {
    const publicUrl = `https://subdomain.ngrok-free.dev/api/v1/webhooks/voice/answer?orgId=${org.id}`;
    const nonce = 'byok_nonce_12345';
    const params = {
      CallUUID: `byok_call_${Date.now()}`,
      From: '+919876543210',
      To: '+912269986008',
      Direction: 'inbound',
      ParentAuthID: tenantAuthId,
      orgId: org.id,
    };

    // Plivo signs using tenantAuthToken against public URL
    const signature = computeV3Signature('POST', publicUrl, nonce, tenantAuthToken, params);

    const body = new URLSearchParams(params).toString();
    const req = new NextRequest(`http://localhost:3000/api/v1/webhooks/voice/answer?orgId=${org.id}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'subdomain.ngrok-free.dev',
        'x-plivo-signature-v3': signature,
        'x-plivo-signature-v3-nonce': nonce,
      },
      body,
    });

    const result = await processIncomingWebhook(req, 'voice', (p) => `${p.CallUUID}_answer`);
    expect(result.valid).toBe(true);
    expect(result.isDuplicate).toBe(false);
    expect(result.params.CallUUID).toBe(params.CallUUID);
  });

  it('rejects webhook when signature was signed with a wrong/foreign token', async () => {
    const publicUrl = `https://subdomain.ngrok-free.dev/api/v1/webhooks/voice/answer?orgId=${org.id}`;
    const nonce = 'byok_nonce_12345';
    const params = {
      CallUUID: `byok_tampered_${Date.now()}`,
      From: '+919876543210',
      To: '+912269986008',
      Direction: 'inbound',
      ParentAuthID: tenantAuthId,
      orgId: org.id,
    };

    // Attacker signs using an incorrect token
    const wrongSignature = computeV3Signature('POST', publicUrl, nonce, 'completely_wrong_token', params);

    const body = new URLSearchParams(params).toString();
    const req = new NextRequest(`http://localhost:3000/api/v1/webhooks/voice/answer?orgId=${org.id}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'subdomain.ngrok-free.dev',
        'x-plivo-signature-v3': wrongSignature,
        'x-plivo-signature-v3-nonce': nonce,
      },
      body,
    });

    const result = await processIncomingWebhook(req, 'voice', (p) => `${p.CallUUID}_answer`);
    expect(result.valid).toBe(false);
    expect(result.errorResponse?.status).toBe(403);
  });
});
