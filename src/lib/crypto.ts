import 'dotenv/config';
import crypto from 'node:crypto';

export interface EncryptedPayload {
  ciphertext: string;
  iv: string;
  authTag: string;
  keyVersion: number;
}

function getKek(): Buffer {
  const kekBase64 = process.env.ENCRYPTION_KEK;
  if (!kekBase64) {
    throw new Error('ENCRYPTION_KEK environment variable is missing.');
  }
  const kek = Buffer.from(kekBase64, 'base64');
  if (kek.length !== 32) {
    throw new Error(`ENCRYPTION_KEK must be exactly 32 bytes (256 bits). Received ${kek.length} bytes.`);
  }
  return kek;
}

/**
 * Encrypts plaintext string using AES-256-GCM.
 */
export function encryptData(plaintext: string): EncryptedPayload {
  const kek = getKek();
  const iv = crypto.randomBytes(12); // Standard GCM 96-bit IV
  const cipher = crypto.createCipheriv('aes-256-gcm', kek, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  const authTag = cipher.getAuthTag().toString('base64');

  const keyVersion = Number(process.env.ENCRYPTION_KEK_VERSION || '1');

  return {
    ciphertext: encrypted,
    iv: iv.toString('base64'),
    authTag,
    keyVersion,
  };
}

/**
 * Decrypts AES-256-GCM payload.
 */
export function decryptData(payload: {
  ciphertext: string;
  iv: string;
  authTag: string;
}): string {
  const kek = getKek();
  const iv = Buffer.from(payload.iv, 'base64');
  const authTag = Buffer.from(payload.authTag, 'base64');

  const decipher = crypto.createDecipheriv('aes-256-gcm', kek, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(payload.ciphertext, 'base64', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Returns masked Auth ID showing only the last 4 characters.
 * Never displays plaintext or middle characters.
 */
export function maskAuthId(authId: string): string {
  if (!authId || authId.length < 4) return '****';
  return `...${authId.slice(-4)}`;
}
