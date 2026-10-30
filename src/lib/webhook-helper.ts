import { NextRequest, NextResponse } from 'next/server';
import { db } from './db';
import { verifyWebhookSignature } from './telephony/webhook-validator';
import { getTenantIntegration } from './integrations/credentials-manager';
import { decryptData } from './crypto';

export interface ProcessWebhookResult {
  valid: boolean;
  isDuplicate: boolean;
  params: Record<string, any>;
  webhookEventId?: string;
  errorResponse?: NextResponse;
}

/**
 * Resolves candidate Plivo auth tokens for webhook signature validation in multi-tenant environments.
 * Checks tenant-specific BYOK credentials first (from URL query param orgId, body params, ParentAuthID, or DID),
 * then falls back to platform environment variables.
 */
async function resolveCandidateAuthTokens(
  urlObj: URL,
  params: Record<string, any>
): Promise<string[]> {
  const candidateTokens = new Set<string>();

  // 1. Resolve organization by orgId from URL query string or payload
  const orgId = urlObj.searchParams.get('orgId') || params.orgId;
  let resolvedOrgId: string | null = null;

  if (orgId) {
    try {
      const org = await db.organization.findFirst({
        where: { OR: [{ id: orgId }, { slug: orgId }] },
        select: { id: true },
      });
      if (org) {
        resolvedOrgId = org.id;
      }
    } catch {
      // Ignore database errors during resolution
    }
    if (!resolvedOrgId) {
      resolvedOrgId = orgId;
    }
  }

  // If organization identified, retrieve tenant BYOK integration
  if (resolvedOrgId) {
    try {
      const tenantInteg = await getTenantIntegration(resolvedOrgId, 'plivo');
      if (tenantInteg?.credentials?.authToken) {
        candidateTokens.add(tenantInteg.credentials.authToken);
      }
    } catch {
      // Ignore tenant retrieval error
    }

    try {
      const plivoAcc = await db.plivoAccount.findFirst({
        where: { organizationId: resolvedOrgId },
      });
      if (plivoAcc?.authTokenEncrypted && plivoAcc.encIv && plivoAcc.encAuthTag) {
        try {
          const decrypted = decryptData({
            ciphertext: plivoAcc.authTokenEncrypted,
            iv: plivoAcc.encIv,
            authTag: plivoAcc.encAuthTag,
          });
          if (decrypted) candidateTokens.add(decrypted);
        } catch {
          // Ignore decryption error
        }
      }
    } catch {
      // Ignore account lookup error
    }
  }

  // 2. Resolve by Plivo ParentAuthID or AuthId in request body
  const parentAuthId = params.ParentAuthID || params.authId || params.AuthId;
  if (parentAuthId) {
    try {
      const last4 = String(parentAuthId).slice(-4);
      const accounts = await db.plivoAccount.findMany({
        where: { authIdLast4: last4 },
      });
      for (const acc of accounts) {
        if (acc.authTokenEncrypted && acc.encIv && acc.encAuthTag) {
          try {
            const decrypted = decryptData({
              ciphertext: acc.authTokenEncrypted,
              iv: acc.encIv,
              authTag: acc.encAuthTag,
            });
            if (decrypted) candidateTokens.add(decrypted);
          } catch {}
        }
      }
    } catch {}

    try {
      const integrations = await db.tenantIntegration.findMany({
        where: { provider: 'plivo' },
      });
      for (const integ of integrations) {
        if (integ.credentialsEncrypted && integ.encIv && integ.encAuthTag) {
          try {
            const decrypted = decryptData({
              ciphertext: integ.credentialsEncrypted,
              iv: integ.encIv,
              authTag: integ.encAuthTag,
            });
            const creds = JSON.parse(decrypted);
            if (creds?.authId === parentAuthId && creds?.authToken) {
              candidateTokens.add(creds.authToken);
            }
          } catch {}
        }
      }
    } catch {}
  }

  // 3. Resolve by destination phone number (To / to)
  const destNumber = params.To || params.to;
  if (destNumber && candidateTokens.size === 0) {
    try {
      const cleanNumber = String(destNumber).replace(/\D/g, '');
      const phoneRecord = await db.phoneNumber.findFirst({
        where: {
          OR: [
            { e164: destNumber },
            ...(cleanNumber ? [{ e164: `+${cleanNumber}` }, { e164: cleanNumber }] : []),
          ],
        },
        select: { organizationId: true },
      });
      if (phoneRecord?.organizationId) {
        const tenantInteg = await getTenantIntegration(phoneRecord.organizationId, 'plivo');
        if (tenantInteg?.credentials?.authToken) {
          candidateTokens.add(tenantInteg.credentials.authToken);
        }
      }
    } catch {}
  }

  // 4. Global environment fallbacks
  if (process.env.PLIVO_WEBHOOK_AUTH_TOKEN) {
    candidateTokens.add(process.env.PLIVO_WEBHOOK_AUTH_TOKEN);
  }
  if (process.env.PLIVO_AUTH_TOKEN) {
    candidateTokens.add(process.env.PLIVO_AUTH_TOKEN);
  }
  if (candidateTokens.size === 0 && (process.env.NODE_ENV === 'test' || process.env.TELEPHONY_MODE !== 'live')) {
    candidateTokens.add('simulator-auth-token-2026');
  }

  return Array.from(candidateTokens).filter(Boolean);
}

export async function processIncomingWebhook(
  req: NextRequest,
  kind: 'voice' | 'message' | 'recording' | 'transcription',
  dedupeKeyExtractor: (params: Record<string, any>) => string
): Promise<ProcessWebhookResult> {
  const method = req.method as 'GET' | 'POST';
  const url = req.url;
  const nonce = req.headers.get('x-plivo-signature-v3-nonce') || '';
  const signatureHeader =
    req.headers.get('x-plivo-signature-v3') ||
    req.headers.get('x-plivo-signature-ma-v3') ||
    '';

  // Parse parameters based on content-type
  let params: Record<string, any> = {};
  let rawBodyText = '';

  const contentType = req.headers.get('content-type') || '';
  if (method === 'POST') {
    if (contentType.includes('application/json')) {
      try {
        params = await req.json();
        rawBodyText = JSON.stringify(params);
      } catch {
        params = {};
      }
    } else if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
      try {
        const formData = await req.formData();
        formData.forEach((value, key) => {
          params[key] = value.toString();
        });
        rawBodyText = new URLSearchParams(params).toString();
      } catch {
        params = {};
      }
    } else {
      rawBodyText = await req.text();
    }
  } else {
    // GET request
    const urlObj = new URL(url);
    urlObj.searchParams.forEach((val, key) => {
      params[key] = val;
    });
  }

  // Resolve actual public URL that Plivo signed against (supports ngrok and reverse proxies)
  const originalUrlObj = new URL(req.url);
  const forwardedProto = req.headers.get('x-forwarded-proto') || 'https';
  const forwardedHost = req.headers.get('x-forwarded-host') || req.headers.get('host');
  const proxyUrl = forwardedHost
    ? `${forwardedProto}://${forwardedHost}${originalUrlObj.pathname}${originalUrlObj.search}`
    : req.url;

  const publicBaseUrl = process.env.PUBLIC_BASE_URL
    ? `${process.env.PUBLIC_BASE_URL.trim().replace(/\/+$/, '')}${originalUrlObj.pathname}${originalUrlObj.search}`
    : proxyUrl;

  const candidateUrls = Array.from(new Set([proxyUrl, publicBaseUrl, req.url].filter(Boolean)));
  const candidateTokens = await resolveCandidateAuthTokens(originalUrlObj, params);

  let isSignatureValid = process.env.PLIVO_SIGNATURE_VALIDATION_ENABLED === 'false';

  if (!isSignatureValid) {
    for (const testUrl of candidateUrls) {
      for (const token of candidateTokens) {
        if (
          verifyWebhookSignature({
            method,
            url: testUrl,
            nonce,
            authToken: token,
            signatureHeader,
            params,
          })
        ) {
          isSignatureValid = true;
          break;
        }
      }
      if (isSignatureValid) break;
    }
  }

  const dedupeKey = dedupeKeyExtractor(params) || `fallback_${Date.now()}`;

  // Check signature validity
  if (!isSignatureValid) {
    console.warn(`[Webhook Rejected] Signature validation failed for ${kind} dedupeKey: ${dedupeKey}`);
    try {
      await db.webhookEvent.create({
        data: {
          provider: 'plivo',
          kind,
          dedupeKey,
          signatureValid: false,
          headers: Object.fromEntries(req.headers.entries()),
          rawBody: rawBodyText,
          contentType,
          sourceIp: req.headers.get('x-forwarded-for') || '127.0.0.1',
          status: 'rejected',
          error: 'Invalid X-Plivo-Signature-V3 signature',
        },
      });
    } catch {
      // Ignore DB error on rejected recording
    }

    return {
      valid: false,
      isDuplicate: false,
      params,
      errorResponse: NextResponse.json(
        { error: 'Forbidden: Invalid X-Plivo-Signature-V3 signature' },
        { status: 403 }
      ),
    };
  }

  // Idempotent insertion into WebhookEvent
  let webhookEventId: string | undefined;
  try {
    const event = await db.webhookEvent.create({
      data: {
        provider: 'plivo',
        kind,
        dedupeKey,
        signatureValid: true,
        headers: Object.fromEntries(req.headers.entries()),
        rawBody: rawBodyText,
        contentType,
        sourceIp: req.headers.get('x-forwarded-for') || '127.0.0.1',
        status: 'received',
      },
    });
    webhookEventId = event.id;
  } catch (err: any) {
    // Unique constraint violation P2002 means already processed
    if (err.code === 'P2002') {
      console.log(`[Webhook Idempotency] Deduplicated event ${dedupeKey} of kind ${kind}`);
      return {
        valid: true,
        isDuplicate: true,
        params,
      };
    }
    console.error('WebhookEvent insertion error:', err);
  }

  return {
    valid: true,
    isDuplicate: false,
    params,
    webhookEventId,
  };
}
