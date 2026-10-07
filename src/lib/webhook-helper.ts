import { NextRequest, NextResponse } from 'next/server';
import { db } from './db';
import { verifyWebhookSignature } from './telephony/webhook-validator';

export interface ProcessWebhookResult {
  valid: boolean;
  isDuplicate: boolean;
  params: Record<string, any>;
  webhookEventId?: string;
  errorResponse?: NextResponse;
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

  // Determine auth token to validate signature against
  const authToken =
    process.env.PLIVO_WEBHOOK_AUTH_TOKEN ||
    process.env.PLIVO_AUTH_TOKEN ||
    '';

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

  const isSignatureValid =
    verifyWebhookSignature({
      method,
      url: proxyUrl,
      nonce,
      authToken,
      signatureHeader,
      params,
    }) ||
    verifyWebhookSignature({
      method,
      url: publicBaseUrl,
      nonce,
      authToken,
      signatureHeader,
      params,
    }) ||
    verifyWebhookSignature({
      method,
      url: req.url,
      nonce,
      authToken,
      signatureHeader,
      params,
    });

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
