import { db } from '@/lib/db';
import { encryptData, decryptData } from '@/lib/crypto';

export type IntegrationProvider = 'openai' | 'deepseek' | 'plivo' | 'msg91';
export type IntegrationCategory = 'transcription' | 'intelligence' | 'telephony' | 'omnichannel';

export interface DecryptedIntegration {
  id: string;
  organizationId: string;
  provider: IntegrationProvider;
  category: IntegrationCategory;
  credentials: Record<string, any>;
  maskedDetails: Record<string, any>;
  status: 'unverified' | 'verified' | 'failed';
  isDefault: boolean;
  metadata: Record<string, any>;
  lastVerifiedAt: Date | null;
  lastVerifyError: string | null;
}

export interface VerificationResult {
  valid: boolean;
  error?: string;
  details?: Record<string, any>;
}

/**
 * Tests provider credentials live against the provider's API.
 */
export async function testProviderCredentials(
  provider: string,
  credentials: Record<string, any>,
  metadata: Record<string, any> = {}
): Promise<VerificationResult> {
  const timeoutMs = 12000;

  try {
    switch (provider) {
      case 'openai': {
        const apiKey = credentials.apiKey?.trim();
        if (!apiKey) return { valid: false, error: 'OpenAI API key is required' };

        const baseUrl = (metadata.baseUrl || credentials.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
        const res = await fetch(`${baseUrl}/models`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'User-Agent': 'TravelPlatform-BYOK/1.0',
          },
          signal: AbortSignal.timeout(timeoutMs),
        });

        if (res.ok) {
          return { valid: true };
        }
        const text = await res.text();
        let errMsg = `OpenAI API returned status ${res.status}`;
        try {
          const parsed = JSON.parse(text);
          if (parsed.error?.message) errMsg = parsed.error.message;
        } catch {}
        return { valid: false, error: errMsg };
      }

      case 'deepseek': {
        const apiKey = credentials.apiKey?.trim();
        if (!apiKey) return { valid: false, error: 'DeepSeek API key is required' };

        const baseUrl = (metadata.baseUrl || credentials.baseUrl || 'https://api.deepseek.com').replace(/\/+$/, '');
        const res = await fetch(`${baseUrl}/models`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'User-Agent': 'TravelPlatform-BYOK/1.0',
          },
          signal: AbortSignal.timeout(timeoutMs),
        });

        if (res.ok) {
          return { valid: true };
        }
        const text = await res.text();
        let errMsg = `DeepSeek API returned status ${res.status}`;
        try {
          const parsed = JSON.parse(text);
          if (parsed.error?.message) errMsg = parsed.error.message;
        } catch {}
        return { valid: false, error: errMsg };
      }

      case 'plivo': {
        const authId = credentials.authId?.trim();
        const authToken = credentials.authToken?.trim();
        if (!authId || !authToken) {
          return { valid: false, error: 'Both Plivo Auth ID and Auth Token are required' };
        }

        const authHeader = 'Basic ' + Buffer.from(`${authId}:${authToken}`).toString('base64');
        const res = await fetch(`https://api.plivo.com/v1/Account/${authId}/`, {
          method: 'GET',
          headers: {
            Authorization: authHeader,
          },
          signal: AbortSignal.timeout(timeoutMs),
        });

        if (res.ok) {
          const data = await res.json();
          return {
            valid: true,
            details: {
              accountName: data.name,
              cashCredits: data.cash_credits,
              authIdLast4: authId.slice(-4),
            },
          };
        }
        return { valid: false, error: `Invalid Plivo credentials (HTTP ${res.status})` };
      }

      case 'msg91': {
        const authKey = credentials.authKey?.trim();
        if (!authKey) return { valid: false, error: 'MSG91 Auth Key is required' };

        // Test MSG91 Auth Key using their standard widget/balance API endpoint
        const res = await fetch('https://control.msg91.com/api/v5/widget/balance', {
          method: 'GET',
          headers: {
            authkey: authKey,
            'User-Agent': 'TravelPlatform-BYOK/1.0',
          },
          signal: AbortSignal.timeout(timeoutMs),
        });

        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          return { valid: true, details: data };
        }

        // Secondary fallback check on MSG91 API v5
        const res2 = await fetch('https://api.msg91.com/api/v5/flow/', {
          method: 'GET',
          headers: {
            authkey: authKey,
          },
          signal: AbortSignal.timeout(timeoutMs),
        });

        if (res2.ok || res2.status === 200 || res2.status === 404) {
          // 404 with valid authkey means the key is accepted but no flow found, or 200 ok
          return { valid: true };
        }

        const text = await res.text();
        return { valid: false, error: `MSG91 authentication failed (HTTP ${res.status}): ${text.slice(0, 100)}` };
      }

      default:
        return { valid: false, error: `Unsupported integration provider: ${provider}` };
    }
  } catch (err: any) {
    return { valid: false, error: err.message || 'Connection timeout or network failure' };
  }
}

/**
 * Retrieves and decrypts credentials for a specific tenant and provider.
 */
export async function getTenantIntegration(
  organizationId: string,
  provider: IntegrationProvider
): Promise<DecryptedIntegration | null> {
  const row = await db.tenantIntegration.findUnique({
    where: {
      organizationId_provider: {
        organizationId,
        provider,
      },
    },
  });

  if (!row) return null;

  try {
    const decryptedJson = decryptData({
      ciphertext: row.credentialsEncrypted,
      iv: row.encIv,
      authTag: row.encAuthTag,
    });

    const credentials = JSON.parse(decryptedJson);

    return {
      id: row.id,
      organizationId: row.organizationId,
      provider: row.provider as IntegrationProvider,
      category: row.category as IntegrationCategory,
      credentials,
      maskedDetails: (row.maskedDetails as Record<string, any>) || {},
      status: row.status as 'unverified' | 'verified' | 'failed',
      isDefault: row.isDefault,
      metadata: (row.metadata as Record<string, any>) || {},
      lastVerifiedAt: row.lastVerifiedAt,
      lastVerifyError: row.lastVerifyError,
    };
  } catch (err: any) {
    console.error(`[CredentialsManager] Error decrypting credentials for org ${organizationId}, provider ${provider}:`, err);
    return null;
  }
}

/**
 * Saves and encrypts credentials for a tenant, validating them live with the provider.
 */
export async function saveTenantIntegration(
  organizationId: string,
  data: {
    provider: IntegrationProvider;
    category?: IntegrationCategory;
    credentials: Record<string, any>;
    metadata?: Record<string, any>;
    label?: string;
  }
): Promise<{
  success: boolean;
  integration: any;
  verification: VerificationResult;
}> {
  const { provider, metadata = {}, label = 'Default' } = data;
  let credentials = { ...data.credentials };

  // If partial credentials are provided (e.g. updating callerId or leaving authToken unchanged), merge with existing
  const existing = await getTenantIntegration(organizationId, provider);
  if (existing?.credentials) {
    if (provider === 'plivo') {
      if (!credentials.authId && existing.credentials.authId) {
        credentials.authId = existing.credentials.authId;
      }
      if (!credentials.authToken && existing.credentials.authToken) {
        credentials.authToken = existing.credentials.authToken;
      }
      if (credentials.callerId === undefined && existing.credentials.callerId) {
        credentials.callerId = existing.credentials.callerId;
      }
    } else if (provider === 'msg91') {
      if (!credentials.authKey && existing.credentials.authKey) {
        credentials.authKey = existing.credentials.authKey;
      }
      if (credentials.senderId === undefined && existing.credentials.senderId) {
        credentials.senderId = existing.credentials.senderId;
      }
      if (credentials.callerId === undefined && existing.credentials.callerId) {
        credentials.callerId = existing.credentials.callerId;
      }
    } else if (provider === 'openai' || provider === 'deepseek') {
      if (!credentials.apiKey && existing.credentials.apiKey) {
        credentials.apiKey = existing.credentials.apiKey;
      }
      if (credentials.baseUrl === undefined && existing.credentials.baseUrl) {
        credentials.baseUrl = existing.credentials.baseUrl;
      }
    }
  }

  const category: IntegrationCategory =
    data.category ||
    (provider === 'openai'
      ? 'transcription'
      : provider === 'deepseek'
      ? 'intelligence'
      : 'telephony');

  // Compute safe masked details for UI display (never plain secrets)
  const maskedDetails: Record<string, any> = {};
  if (provider === 'openai') {
    const rawKey = credentials.apiKey || '';
    maskedDetails.apiKeyLast4 = rawKey.length > 4 ? rawKey.slice(-4) : '****';
    maskedDetails.model = metadata.model || 'gpt-4o-transcribe';
  } else if (provider === 'deepseek') {
    const rawKey = credentials.apiKey || '';
    maskedDetails.apiKeyLast4 = rawKey.length > 4 ? rawKey.slice(-4) : '****';
    maskedDetails.model = metadata.model || 'deepseek-chat';
  } else if (provider === 'plivo') {
    const rawAuth = credentials.authId || '';
    maskedDetails.authIdLast4 = rawAuth.length > 4 ? rawAuth.slice(-4) : '****';
    maskedDetails.authIdMasked = rawAuth.length > 8 ? `${rawAuth.slice(0, 6)}...${rawAuth.slice(-4)}` : rawAuth;
    maskedDetails.callerId = credentials.callerId || '';
    maskedDetails.appId = credentials.appId || '';
  } else if (provider === 'msg91') {
    const rawKey = credentials.authKey || '';
    maskedDetails.authKeyLast4 = rawKey.length > 4 ? rawKey.slice(-4) : '****';
    maskedDetails.senderId = credentials.senderId || '';
    maskedDetails.callerId = credentials.callerId || '';
  }

  // Live validation
  const verification = await testProviderCredentials(provider, credentials, metadata);

  // Encrypt credentials JSON
  const encrypted = encryptData(JSON.stringify(credentials));

  const saved = await db.tenantIntegration.upsert({
    where: {
      organizationId_provider: {
        organizationId,
        provider,
      },
    },
    update: {
      category,
      label,
      credentialsEncrypted: encrypted.ciphertext,
      encIv: encrypted.iv,
      encAuthTag: encrypted.authTag,
      encKeyVersion: encrypted.keyVersion,
      maskedDetails,
      status: verification.valid ? 'verified' : 'failed',
      lastVerifiedAt: new Date(),
      lastVerifyError: verification.valid ? null : verification.error,
      metadata,
    },
    create: {
      organizationId,
      provider,
      category,
      label,
      credentialsEncrypted: encrypted.ciphertext,
      encIv: encrypted.iv,
      encAuthTag: encrypted.authTag,
      encKeyVersion: encrypted.keyVersion,
      maskedDetails,
      status: verification.valid ? 'verified' : 'failed',
      lastVerifiedAt: new Date(),
      lastVerifyError: verification.valid ? null : verification.error,
      metadata,
    },
  });

  // If Plivo, also synchronize PlivoAccount legacy table for downstream schema relations
  if (provider === 'plivo' && credentials.authId && credentials.authToken) {
    try {
      const encId = encryptData(credentials.authId);
      const encTok = encryptData(credentials.authToken);
      const existingPlivo = await db.plivoAccount.findFirst({
        where: { organizationId },
      });

      if (existingPlivo) {
        await db.plivoAccount.update({
          where: { id: existingPlivo.id },
          data: {
            authIdEncrypted: encId.ciphertext,
            authIdLast4: credentials.authId.slice(-4),
            authTokenEncrypted: encTok.ciphertext,
            encIv: encId.iv,
            encAuthTag: encId.authTag,
            encKeyVersion: encId.keyVersion,
            status: verification.valid ? 'verified' : 'failed',
            lastVerifiedAt: new Date(),
            lastVerifyError: verification.error || null,
          },
        });
      } else {
        await db.plivoAccount.create({
          data: {
            organizationId,
            label: 'Plivo BYOK Account',
            authIdEncrypted: encId.ciphertext,
            authIdLast4: credentials.authId.slice(-4),
            authTokenEncrypted: encTok.ciphertext,
            encIv: encId.iv,
            encAuthTag: encId.authTag,
            encKeyVersion: encId.keyVersion,
            status: verification.valid ? 'verified' : 'failed',
            lastVerifiedAt: new Date(),
            lastVerifyError: verification.error || null,
          },
        });
      }
    } catch (syncErr) {
      console.warn('[CredentialsManager] Notice syncing PlivoAccount model:', syncErr);
    }
  }

  // If MSG91 with callerId, ensure phone number line exists
  if (provider === 'msg91' && credentials.callerId) {
    try {
      const callerId = credentials.callerId.trim();
      const existingNumber = await db.phoneNumber.findFirst({
        where: { organizationId, e164: callerId },
      });
      if (!existingNumber) {
        await db.phoneNumber.create({
          data: {
            organizationId,
            provider: 'msg91',
            e164: callerId,
            countryIso: 'IN',
            numberType: 'local',
            status: 'active',
            friendlyName: `MSG91 Voice Line (${callerId})`,
            recordCalls: true,
            transcribeEnabled: true,
          },
        });
      }
    } catch (numErr) {
      console.warn('[CredentialsManager] Notice registering MSG91 phone number:', numErr);
    }
  }

  return {
    success: verification.valid,
    integration: saved,
    verification,
  };
}

/**
 * Removes a tenant integration.
 */
export async function deleteTenantIntegration(organizationId: string, provider: IntegrationProvider) {
  return db.tenantIntegration.deleteMany({
    where: {
      organizationId,
      provider,
    },
  });
}

/**
 * Returns safe summary of all configured integrations for tenant settings view.
 */
export async function getTenantIntegrationsSummary(organizationId: string) {
  const rows = await db.tenantIntegration.findMany({
    where: { organizationId },
    select: {
      id: true,
      provider: true,
      category: true,
      label: true,
      maskedDetails: true,
      status: true,
      isDefault: true,
      metadata: true,
      lastVerifiedAt: true,
      lastVerifyError: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: {
      id: true,
      slug: true,
      primaryTelephonyProvider: true,
    },
  });

  const publicBase = (process.env.PUBLIC_BASE_URL || 'http://localhost:3000').trim().replace(/\/+$/, '');
  const orgSlug = org?.slug || organizationId;

  return {
    organizationId,
    primaryTelephonyProvider: org?.primaryTelephonyProvider || 'plivo',
    integrations: rows,
    webhookUrls: {
      voiceAnswer: `${publicBase}/api/v1/webhooks/voice/answer?orgId=${organizationId}`,
      voiceFallback: `${publicBase}/api/v1/webhooks/voice/fallback?orgId=${organizationId}`,
      voiceHangup: `${publicBase}/api/v1/webhooks/voice/hangup?orgId=${organizationId}`,
      voiceRecord: `${publicBase}/api/v1/webhooks/voice/record?orgId=${organizationId}`,
      messageInbound: `${publicBase}/api/v1/webhooks/message/inbound?orgId=${organizationId}`,
      messageStatus: `${publicBase}/api/v1/webhooks/message/status?orgId=${organizationId}`,
      msg91Voice: `${publicBase}/api/v1/webhooks/msg91/voice?orgId=${organizationId}`,
      msg91Sms: `${publicBase}/api/v1/webhooks/msg91/sms?orgId=${organizationId}`,
    },
  };
}
