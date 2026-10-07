import crypto from 'node:crypto';

function getMediaSecret(): string {
  return process.env.MEDIA_URL_SECRET || 'fallback-media-secret-key-32-bytes-long';
}

/**
 * Creates a short-lived signed URL for streaming media securely through the app.
 * Raw Plivo URLs are never handed to the browser.
 */
export function generateSignedMediaUrl(recordingId: string, customTtl?: number): string {
  const secret = getMediaSecret();
  const ttl = customTtl || Number(process.env.MEDIA_URL_TTL_SECONDS || '300');
  const expires = Math.floor(Date.now() / 1000) + ttl;

  const payload = `${recordingId}:${expires}`;
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');

  const base = process.env.PUBLIC_BASE_URL || 'http://localhost:3000';
  return `${base}/api/v1/recordings/${recordingId}/stream?expires=${expires}&signature=${signature}`;
}

/**
 * Verifies signed media playback request in constant time.
 */
export function verifySignedMediaRequest(recordingId: string, expires: number, signature: string): boolean {
  const now = Math.floor(Date.now() / 1000);
  if (now > expires) {
    return false; // Expired
  }

  const secret = getMediaSecret();
  const payload = `${recordingId}:${expires}`;
  const expectedSignature = crypto.createHmac('sha256', secret).update(payload).digest('hex');

  const sigBuf = Buffer.from(signature, 'utf8');
  const expBuf = Buffer.from(expectedSignature, 'utf8');
  if (sigBuf.length !== expBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(sigBuf, expBuf);
}
