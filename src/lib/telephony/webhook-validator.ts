import crypto from 'node:crypto';
import * as plivoModule from 'plivo';

const plivo: any = (plivoModule as any).default || plivoModule;

export interface VerifyWebhookParams {
  method: 'GET' | 'POST';
  url: string;
  nonce: string;
  authToken: string;
  signatureHeader: string;
  params?: Record<string, any>;
}

/**
 * Validates Plivo V3 signature using the official Plivo SDK validator.
 * Accepts comma-separated signatures (for rotating/multiple tokens).
 */
export function verifyWebhookSignature({
  method,
  url,
  nonce,
  authToken,
  signatureHeader,
  params = {},
}: VerifyWebhookParams): Boolean {
  if (!nonce || !signatureHeader || !authToken) {
    return false;
  }

  try {
    const signatures = signatureHeader.split(',').map((s) => s.trim()).filter(Boolean);
    return signatures.some((sig) =>
      plivo.validateV3Signature(method, url, nonce, authToken, sig, params)
    );
  } catch (err) {
    console.error('Webhook signature verification error:', err);
    return false;
  }
}

/**
 * Computes an authentic Plivo V3 signature for the simulator or webhook tests.
 * Follows Plivo's exact SDK algorithm so signatures generated here validate
 * 100% against plivo.validateV3Signature().
 */
export function computeV3Signature(
  method: 'GET' | 'POST',
  uri: string,
  nonce: string,
  authToken: string,
  params: Record<string, any> = {}
): string {
  // Extract and construct URL components exactly as Plivo SDK does
  const urlObj = new URL(uri);
  const protocol = urlObj.protocol + '//';
  const host = urlObj.host; // includes port if present
  const pathname = urlObj.pathname;
  let baseUrl = `${protocol}${host}${pathname}`;

  // Handle query params on uri
  const queryParams: Record<string, string[]> = {};
  urlObj.searchParams.forEach((val, key) => {
    if (!queryParams[key]) queryParams[key] = [];
    queryParams[key].push(val);
  });

  if (method === 'GET') {
    Object.keys(params).forEach(key => {
      const val = params[key];
      if (!queryParams[key]) queryParams[key] = [];
      if (Array.isArray(val)) {
        queryParams[key].push(...val.map(String));
      } else {
        queryParams[key].push(String(val));
      }
    });

    const sortedQueryParts: string[] = [];
    Object.keys(queryParams).sort().forEach(key => {
      const vals = queryParams[key].sort();
      vals.forEach(v => sortedQueryParts.push(`${key}=${v}`));
    });

    if (sortedQueryParts.length > 0) {
      baseUrl += '?' + sortedQueryParts.join('&');
    }
  } else if (method === 'POST') {
    const hasPostParams = Object.keys(params).length > 0;
    const sortedQueryParts: string[] = [];
    Object.keys(queryParams).sort().forEach(key => {
      const vals = queryParams[key].sort();
      vals.forEach(v => sortedQueryParts.push(`${key}=${v}`));
    });

    if (sortedQueryParts.length > 0 || hasPostParams) {
      baseUrl += '?' + sortedQueryParts.join('&');
    }
    if (sortedQueryParts.length > 0 && hasPostParams) {
      baseUrl += '.';
    }

    // Append sorted POST parameters (key + value concatenated)
    const sortedPostParts: string[] = [];
    Object.keys(params).sort().forEach(key => {
      const val = params[key];
      if (Array.isArray(val)) {
        val.forEach(v => sortedPostParts.push(`${key}${v}`));
      } else {
        sortedPostParts.push(`${key}${val}`);
      }
    });
    baseUrl += sortedPostParts.join('');
  }

  const payloadToSign = `${baseUrl}.${nonce}`;
  const hmac = crypto.createHmac('sha256', authToken);
  return hmac.update(payloadToSign).digest('base64');
}
