import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword, signAccessToken, verifyAccessToken } from '../src/lib/auth-tokens';
import { generateSignedMediaUrl, verifySignedMediaRequest } from '../src/lib/media-urls';

describe('Security Controls & Token Cryptography', () => {
  it('enforces bcrypt password hashing cost and prevents plaintext leakage', async () => {
    const rawPass = 'SecretAdminPassword123!';
    const hash = await hashPassword(rawPass);

    expect(hash.startsWith('$2a$12$') || hash.startsWith('$2b$12$')).toBe(true);
    expect(await verifyPassword(rawPass, hash)).toBe(true);
    expect(await verifyPassword('WrongPassword', hash)).toBe(false);
  });

  it('signs and verifies short-lived JWT access tokens', async () => {
    const payload = {
      userId: 'user-123',
      email: 'admin@example.com',
      organizationId: 'org-456',
      role: 'owner',
    };

    const token = await signAccessToken(payload);
    expect(token).toBeDefined();

    const verified = await verifyAccessToken(token);
    expect(verified).not.toBeNull();
    expect(verified?.userId).toBe(payload.userId);
    expect(verified?.role).toBe('owner');
  });

  it('validates authentic signed media URLs and rejects expired or tampered signatures', () => {
    const recordingId = 'rec_1234567890';
    const signedUrl = generateSignedMediaUrl(recordingId, 10); // 10 seconds TTL
    const urlObj = new URL(signedUrl);
    const expires = Number(urlObj.searchParams.get('expires'));
    const signature = urlObj.searchParams.get('signature') || '';

    // Authentic signature passes
    expect(verifySignedMediaRequest(recordingId, expires, signature)).toBe(true);

    // Tampered recording ID fails
    expect(verifySignedMediaRequest('rec_different', expires, signature)).toBe(false);

    // Tampered signature fails
    expect(verifySignedMediaRequest(recordingId, expires, 'invalid_sig')).toBe(false);

    // Expired timestamp fails
    const expiredTimestamp = Math.floor(Date.now() / 1000) - 100;
    expect(verifySignedMediaRequest(recordingId, expiredTimestamp, signature)).toBe(false);
  });
});
