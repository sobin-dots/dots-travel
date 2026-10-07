import { describe, it, expect } from 'vitest';
import { encryptData, decryptData, maskAuthId } from '../src/lib/crypto';

describe('AES-256-GCM Credential Encryption', () => {
  it('encrypts and cleanly decrypts plaintext credentials', () => {
    const secret = 'MAMYSECRETPLIVOAUTHID2026';
    const encrypted = encryptData(secret);

    expect(encrypted.ciphertext).toBeDefined();
    expect(encrypted.iv).toBeDefined();
    expect(encrypted.authTag).toBeDefined();
    expect(encrypted.keyVersion).toBe(1);

    const decrypted = decryptData(encrypted);
    expect(decrypted).toBe(secret);
  });

  it('rejects tampered ciphertext or auth tag with authenticated decryption error', () => {
    const secret = 'MAMYSECRETPLIVOAUTHID2026';
    const encrypted = encryptData(secret);

    // Tamper with the ciphertext
    const tampered = {
      ...encrypted,
      ciphertext: encrypted.ciphertext.slice(0, -4) + 'AAAA',
    };

    expect(() => decryptData(tampered)).toThrow();
  });

  it('masks Auth IDs to show only the last 4 characters', () => {
    expect(maskAuthId('MAMYSECRETPLIVOAUTHID2026')).toBe('...2026');
    expect(maskAuthId('SA12345678')).toBe('...5678');
    expect(maskAuthId('12')).toBe('****');
  });
});
