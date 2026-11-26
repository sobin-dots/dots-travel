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

function findMatchingPlivoApp(
  apps: unknown,
  opts: {
    baseUrl?: string | null;
    preferBaseUrlMatch?: boolean;
    appId?: unknown;
    metadataAppId?: unknown;
  }
) {
  if (!Array.isArray(apps) || apps.length === 0) return null;
  const nonLocalBase = opts.baseUrl && !isLocalWebhookBase(opts.baseUrl) ? opts.baseUrl : '';
  const byBase = () =>
    nonLocalBase
      ? apps.find((a: any) => typeof a.answerUrl === 'string' && a.answerUrl.startsWith(nonLocalBase))
      : undefined;
  const byAppId = () =>
    opts.appId ? apps.find((a: any) => String(a.appId) === String(opts.appId)) : undefined;
  const byMetaAppId = () =>
    opts.metadataAppId ? apps.find((a: any) => String(a.appId) === String(opts.metadataAppId)) : undefined;

  return (
    (opts.preferBaseUrlMatch ? byBase() || byAppId() : byAppId() || byBase()) ||
    byMetaAppId() ||
    apps.find((a: any) => a.defaultEndpointApp || a.defaultApp) ||
    apps[0] ||
    null
  );
}

async function applyPlivoAppWebhookUrls(
  client: any,
  appId: string,
  webhookUrls: Record<string, string>
) {
  if (typeof client?.applications?.update !== 'function') return;
  try {
    await client.applications.update(appId, {
      answerUrl: webhookUrls.voiceAnswer,
      answerMethod: 'POST',
      fallbackAnswerUrl: webhookUrls.voiceFallback,
      fallbackMethod: 'POST',
      hangupUrl: webhookUrls.voiceHangup,
      hangupMethod: 'POST',
    });
  } catch (err) {
    console.warn('[CredentialsManager] Plivo application webhook sync notice:', err);
  }
}

export function buildOrgWebhookUrls(baseUrl: string, organizationId: string) {
  const cleanBase = (baseUrl || 'http://localhost:3000').trim().replace(/\/+$/, '');
  return {
    voiceAnswer: `${cleanBase}/api/v1/webhooks/voice/answer?orgId=${organizationId}`,
    voiceFallback: `${cleanBase}/api/v1/webhooks/voice/fallback?orgId=${organizationId}`,
    voiceHangup: `${cleanBase}/api/v1/webhooks/voice/hangup?orgId=${organizationId}`,
    voiceRecord: `${cleanBase}/api/v1/webhooks/voice/record?orgId=${organizationId}`,
    voiceStatus: `${cleanBase}/api/v1/webhooks/voice/status?orgId=${organizationId}`,
    messageInbound: `${cleanBase}/api/v1/webhooks/message/inbound?orgId=${organizationId}`,
    messageStatus: `${cleanBase}/api/v1/webhooks/message/status?orgId=${organizationId}`,
    msg91Voice: `${cleanBase}/api/v1/webhooks/msg91/voice?orgId=${organizationId}`,
    msg91Sms: `${cleanBase}/api/v1/webhooks/msg91/sms?orgId=${organizationId}`,
  };
}

/**
 * Returns true when the URL points to a local development host rather than a public webhook origin.
 */
export function isLocalWebhookBase(url?: string | null): boolean {
  const normalized = (url || '').trim();
  if (!normalized) return true;
  return (
    /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|\/|$)/i.test(normalized) ||
    normalized.includes('localhost')
  );
}

/**
 * Resolves the effective public webhook base and per-endpoint URLs for an organization.
 * Non-local live request origins always override stale DB-persisted webhook URLs (e.g. old ngrok URLs).
 */
export function resolveOrgWebhookUrls(
  organizationId: string,
  requestBaseUrl?: string | null,
  metadata?: Record<string, unknown> | null
) {
  const cleanRequestBase = (requestBaseUrl || '').trim().replace(/\/+$/, '');
  const cleanMetaBase =
    typeof metadata?.webhookBaseUrl === 'string'
      ? metadata.webhookBaseUrl.trim().replace(/\/+$/, '')
      : '';
  const isRequestLocal = isLocalWebhookBase(cleanRequestBase);
  const effectiveBaseUrl =
    (!isRequestLocal ? cleanRequestBase : cleanMetaBase) || cleanRequestBase || 'http://localhost:3000';

  const storedUrls = metadata?.webhookUrls as Record<string, string> | undefined;
  const useStoredUrls =
    isRequestLocal &&
    storedUrls &&
    typeof storedUrls.voiceAnswer === 'string' &&
    storedUrls.voiceAnswer.includes(organizationId) &&
    typeof storedUrls.voiceFallback === 'string' &&
    storedUrls.voiceFallback.includes(organizationId);

  return {
    effectiveBaseUrl,
    webhookUrls: useStoredUrls ? storedUrls : buildOrgWebhookUrls(effectiveBaseUrl, organizationId),
  };
}

/**
 * Resolves a tenant's DB-stored Plivo integration by organizationId, Plivo ParentAuthID, or called phone number.
 * Never reads from environment variables.
 */
export async function resolveTenantPlivoIntegration(params: {
  organizationId?: string | null;
  parentAuthId?: string | null;
  phoneNumber?: string | null;
}): Promise<{ organizationId: string; integration: DecryptedIntegration } | null> {
  // 1. Direct lookup by organizationId if provided
  if (params.organizationId) {
    const direct = await getTenantIntegration(params.organizationId, 'plivo');
    if (direct?.credentials?.authId && direct?.credentials?.authToken) {
      return { organizationId: params.organizationId, integration: direct };
    }
  }

  // 2. Lookup by phoneNumber in PhoneNumber table
  if (params.phoneNumber) {
    const cleanDigits = String(params.phoneNumber).replace(/\D/g, '');
    const phoneRow = await db.phoneNumber.findFirst({
      where: {
        OR: [
          { e164: params.phoneNumber },
          ...(cleanDigits ? [{ e164: `+${cleanDigits}` }, { e164: cleanDigits }] : []),
        ],
      },
      select: { organizationId: true },
    });
    if (phoneRow?.organizationId) {
      const byPhoneOrg = await getTenantIntegration(phoneRow.organizationId, 'plivo');
      if (byPhoneOrg?.credentials?.authId && byPhoneOrg?.credentials?.authToken) {
        return { organizationId: phoneRow.organizationId, integration: byPhoneOrg };
      }
    }
  }

  // 3. Scan all Plivo tenant integrations in DB to match parentAuthId or callerId
  const allPlivoRows = await db.tenantIntegration.findMany({
    where: { provider: 'plivo' },
    orderBy: { updatedAt: 'desc' },
  });

  const cleanTargetPhone = params.phoneNumber ? String(params.phoneNumber).replace(/\D/g, '') : '';

  for (const row of allPlivoRows) {
    const integ = await getTenantIntegration(row.organizationId, 'plivo');
    if (!integ?.credentials?.authId || !integ?.credentials?.authToken) continue;

    if (params.parentAuthId && integ.credentials.authId === params.parentAuthId) {
      return { organizationId: row.organizationId, integration: integ };
    }

    if (cleanTargetPhone && integ.credentials.callerId) {
      const cleanCallerId = String(integ.credentials.callerId).replace(/\D/g, '');
      if (cleanCallerId && cleanCallerId === cleanTargetPhone) {
        return { organizationId: row.organizationId, integration: integ };
      }
    }
  }

  return null;
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
    webhookBaseUrl?: string;
  }
): Promise<{
  success: boolean;
  integration: any;
  verification: VerificationResult;
}> {
  const { provider, label = 'Default' } = data;
  let credentials = { ...data.credentials };

  // If partial credentials are provided (e.g. updating callerId or leaving authToken unchanged), merge with existing
  const existing = await getTenantIntegration(organizationId, provider);
  const mergedMetadata: Record<string, any> = {
    ...(existing?.metadata || {}),
    ...(data.metadata || {}),
  };

  if (data.webhookBaseUrl) {
    mergedMetadata.webhookBaseUrl = data.webhookBaseUrl.trim().replace(/\/+$/, '');
  }
  if (mergedMetadata.webhookBaseUrl) {
    mergedMetadata.webhookUrls = buildOrgWebhookUrls(mergedMetadata.webhookBaseUrl, organizationId);
  }

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
      if (!credentials.sipEndpoint && existing.credentials.sipEndpoint) {
        credentials.sipEndpoint = existing.credentials.sipEndpoint;
      }
      if (!credentials.endpointUsername && existing.credentials.endpointUsername) {
        credentials.endpointUsername = existing.credentials.endpointUsername;
      }
      if (!credentials.endpointPassword && existing.credentials.endpointPassword) {
        credentials.endpointPassword = existing.credentials.endpointPassword;
      }
      if (!credentials.endpointId && existing.credentials.endpointId) {
        credentials.endpointId = existing.credentials.endpointId;
      }
      if (!credentials.appId && existing.credentials.appId) {
        credentials.appId = existing.credentials.appId;
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

  // Live validation
  const verification = await testProviderCredentials(provider, credentials, mergedMetadata);

  // If Plivo credentials verified, sync SIP endpoint, callerId, and Plivo Application webhook URLs into DB
  if (provider === 'plivo' && verification.valid && credentials.authId && credentials.authToken) {
    try {
      const plivoModule = await import('plivo');
      const client = new (plivoModule as any).Client(credentials.authId, credentials.authToken);
      const endpointPassword = credentials.endpointPassword || 'PilvoAgent2026!Secure';
      credentials.endpointPassword = endpointPassword;

      // Sync or discover Plivo Application
      const apps = await client.applications.list();
      const app = findMatchingPlivoApp(apps, {
        baseUrl: typeof mergedMetadata.webhookBaseUrl === 'string' ? mergedMetadata.webhookBaseUrl : '',
        appId: credentials.appId,
        metadataAppId: mergedMetadata.applicationId,
      });

      const webhookUrls = mergedMetadata.webhookUrls;
      const isPublicHttps =
        Boolean(mergedMetadata.webhookBaseUrl) &&
        mergedMetadata.webhookBaseUrl.startsWith('https://') &&
        !isLocalWebhookBase(mergedMetadata.webhookBaseUrl);

      if (app && isPublicHttps && webhookUrls) {
        await applyPlivoAppWebhookUrls(client, app.appId, webhookUrls);
      }

      if (app?.appId) {
        credentials.appId = String(app.appId);
      }

      // Sync or provision fallback org WebRTC SIP Endpoint without overwriting per-member agent passwords
      const endpoints = await client.endpoints.list();
      const cleanAuthId = String(credentials.authId).replace(/[^a-zA-Z0-9]/g, '').slice(-4).toLowerCase() || 'agent';
      const cleanOrg = organizationId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toLowerCase() || 'line';
      const orgAlias = `Agent-${cleanOrg}`;
      let endpoint =
        endpoints.find((e: { username?: string; alias?: string }) => credentials.endpointUsername && e.username === credentials.endpointUsername) ||
        endpoints.find((e: { username?: string; alias?: string }) => e.alias === orgAlias);

      if (!endpoint) {
        const username = `agent${cleanOrg}${cleanAuthId}`;
        try {
          endpoint = await client.endpoints.create(username, endpointPassword, orgAlias, app?.appId);
        } catch (epCreateErr) {
          console.warn('[CredentialsManager] Plivo endpoint auto-create notice:', epCreateErr);
        }
      } else if (endpoint.endpointId) {
        // Only sync password/appId on this matched org/credential endpoint so staff endpoints stay intact
        try {
          await client.endpoints.update(endpoint.endpointId, {
            password: endpointPassword,
            ...(app?.appId ? { appId: app.appId } : {}),
          });
        } catch {}
      }

      if (endpoint?.username) {
        credentials.endpointUsername = endpoint.username;
        credentials.endpointId = endpoint.endpointId || endpoint.id || credentials.endpointId;
        credentials.sipEndpoint = endpoint.sipUri || `sip:${endpoint.username}@phone.plivo.com`;
      }

      // Sync callerId from owned Plivo numbers if not manually entered, and link number to the Plivo Application
      const ownedNumbers = await client.numbers.list();
      if (!credentials.callerId && ownedNumbers && ownedNumbers[0]?.number) {
        const rawNum = String(ownedNumbers[0].number);
        credentials.callerId = rawNum.startsWith('+') ? rawNum : `+${rawNum}`;
      }
      if (app?.appId && ownedNumbers?.length) {
        for (const numObj of ownedNumbers) {
          try {
            await client.numbers.update(numObj.number, { appId: app.appId });
          } catch {}
        }
      }
    } catch (plivoSyncErr) {
      console.warn('[CredentialsManager] Plivo endpoint/app sync notice:', plivoSyncErr);
    }
  }

  // Compute safe masked details for UI display (never plain secrets)
  const maskedDetails: Record<string, any> = {};
  if (provider === 'openai') {
    const rawKey = credentials.apiKey || '';
    maskedDetails.apiKeyLast4 = rawKey.length > 4 ? rawKey.slice(-4) : '****';
    maskedDetails.model = mergedMetadata.model || 'gpt-4o-transcribe';
  } else if (provider === 'deepseek') {
    const rawKey = credentials.apiKey || '';
    maskedDetails.apiKeyLast4 = rawKey.length > 4 ? rawKey.slice(-4) : '****';
    maskedDetails.model = mergedMetadata.model || 'deepseek-chat';
  } else if (provider === 'plivo') {
    const rawAuth = credentials.authId || '';
    maskedDetails.authIdLast4 = rawAuth.length > 4 ? rawAuth.slice(-4) : '****';
    maskedDetails.authIdMasked = rawAuth.length > 8 ? `${rawAuth.slice(0, 6)}...${rawAuth.slice(-4)}` : rawAuth;
    maskedDetails.callerId = credentials.callerId || '';
    maskedDetails.appId = credentials.appId || '';
    maskedDetails.sipEndpoint = credentials.sipEndpoint || '';
    maskedDetails.endpointUsername = credentials.endpointUsername || '';
  } else if (provider === 'msg91') {
    const rawKey = credentials.authKey || '';
    maskedDetails.authKeyLast4 = rawKey.length > 4 ? rawKey.slice(-4) : '****';
    maskedDetails.senderId = credentials.senderId || '';
    maskedDetails.callerId = credentials.callerId || '';
  }

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
      metadata: mergedMetadata,
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
      metadata: mergedMetadata,
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
 * Resolves webhook URLs from the DB-persisted tenant integration metadata or request origin.
 */
export async function getTenantIntegrationsSummary(organizationId: string, requestBaseUrl?: string) {
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

  const plivoRow = rows.find((r) => r.provider === 'plivo');
  const plivoMeta = (plivoRow?.metadata as Record<string, any>) || {};
  const { effectiveBaseUrl: effectiveBase, webhookUrls } = resolveOrgWebhookUrls(
    organizationId,
    requestBaseUrl,
    plivoMeta
  );

  // If Plivo row exists in DB and doesn't yet have webhookUrls persisted for this public base, persist it in DB
  if (plivoRow && (!plivoMeta.webhookUrls || (requestBaseUrl && !isLocalWebhookBase(requestBaseUrl) && plivoMeta.webhookBaseUrl !== effectiveBase))) {
    try {
      await db.tenantIntegration.update({
        where: { id: plivoRow.id },
        data: {
          metadata: {
            ...plivoMeta,
            webhookBaseUrl: effectiveBase,
            webhookUrls,
          },
        },
      });
    } catch {}
  }

  return {
    organizationId,
    primaryTelephonyProvider: org?.primaryTelephonyProvider || 'plivo',
    integrations: rows,
    webhookUrls,
  };
}

const PLIVO_WEBHOOK_SYNC_TTL_MS = 60_000;
const lastPlivoWebhookSyncByOrg = new Map<
  string,
  { baseUrl: string; syncedAt: number; appId: string | null }
>();

/**
 * Synchronizes the organization's Plivo Application webhooks and owned Phone Numbers
 * to the active public HTTPS origin when deployed/moved from another environment (e.g. ngrok -> prod).
 */
export async function syncTenantPlivoWebhooksIfNeeded(
  organizationId: string,
  requestBaseUrl?: string | null,
  options?: { force?: boolean }
): Promise<string | null> {
  const integration = await getTenantIntegration(organizationId, 'plivo');
  const authId = integration?.credentials?.authId;
  const authToken = integration?.credentials?.authToken;
  if (!authId || !authToken) return null;

  const { effectiveBaseUrl, webhookUrls } = resolveOrgWebhookUrls(
    organizationId,
    requestBaseUrl,
    integration.metadata
  );

  const fallbackAppId =
    (integration.credentials.appId ? String(integration.credentials.appId) : null) ||
    (typeof integration.metadata?.applicationId === 'string' ? integration.metadata.applicationId : null);

  const isPublicHttps =
    Boolean(effectiveBaseUrl) &&
    effectiveBaseUrl.startsWith('https://') &&
    !isLocalWebhookBase(effectiveBaseUrl);

  if (!isPublicHttps) {
    return fallbackAppId;
  }

  const cached = lastPlivoWebhookSyncByOrg.get(organizationId);
  const metaMatches = integration.metadata?.webhookBaseUrl === effectiveBaseUrl;
  const withinTtl =
    cached &&
    cached.baseUrl === effectiveBaseUrl &&
    Date.now() - cached.syncedAt < PLIVO_WEBHOOK_SYNC_TTL_MS;

  if (!options?.force && metaMatches && withinTtl) {
    return cached.appId || fallbackAppId;
  }

  let resolvedAppId: string | null = fallbackAppId;

  try {
    const plivoModule = await import('plivo');
    const client = new (plivoModule as any).Client(authId, authToken);

    if (typeof client.applications?.list === 'function') {
      const apps = await client.applications.list();
      const matchedApp = findMatchingPlivoApp(apps, {
        baseUrl: effectiveBaseUrl,
        preferBaseUrlMatch: true,
        appId: integration.credentials.appId,
        metadataAppId: integration.metadata?.applicationId,
      });

      if (matchedApp?.appId) {
        resolvedAppId = String(matchedApp.appId);
        const appNeedsUpdate =
          Boolean(options?.force) ||
          !metaMatches ||
          matchedApp.answerUrl !== webhookUrls.voiceAnswer ||
          matchedApp.fallbackAnswerUrl !== webhookUrls.voiceFallback;

        if (appNeedsUpdate) {
          await applyPlivoAppWebhookUrls(client, matchedApp.appId, webhookUrls);
        }

        if (
          typeof client.numbers?.list === 'function' &&
          typeof client.numbers?.update === 'function'
        ) {
          try {
            const ownedNumbers = await client.numbers.list();
            if (Array.isArray(ownedNumbers)) {
              for (const numObj of ownedNumbers) {
                const alreadyLinked = String(numObj.application || '').includes(resolvedAppId);
                if (options?.force || !metaMatches || !alreadyLinked) {
                  try {
                    await client.numbers.update(numObj.number, { appId: matchedApp.appId });
                  } catch {}
                }
              }
            }
          } catch {}
        }
      }
    }

    if (!metaMatches || options?.force || (resolvedAppId && integration.metadata?.applicationId !== resolvedAppId)) {
      await db.tenantIntegration.update({
        where: { id: integration.id },
        data: {
          metadata: {
            ...(integration.metadata || {}),
            webhookBaseUrl: effectiveBaseUrl,
            webhookUrls,
            ...(resolvedAppId ? { applicationId: resolvedAppId } : {}),
          },
        },
      });
    }

    lastPlivoWebhookSyncByOrg.set(organizationId, {
      baseUrl: effectiveBaseUrl,
      syncedAt: Date.now(),
      appId: resolvedAppId,
    });
  } catch (err) {
    console.warn('[CredentialsManager] syncTenantPlivoWebhooksIfNeeded notice:', err);
  }

  return resolvedAppId;
}
