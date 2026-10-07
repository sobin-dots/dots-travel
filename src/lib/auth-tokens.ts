import { SignJWT, jwtVerify } from 'jose';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';

export interface TokenPayload {
  userId: string;
  email: string;
  organizationId: string;
  role: string;
}

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_ACCESS_SECRET || 'fallback-jwt-secret-at-least-32-chars-long';
  return new TextEncoder().encode(secret);
}

/**
 * Creates short-lived JWT Access Token (~15 mins) for Bearer authentication.
 */
export async function signAccessToken(payload: TokenPayload): Promise<string> {
  const secret = getJwtSecret();
  const ttlSeconds = Number(process.env.ACCESS_TOKEN_TTL || '900');

  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(secret);
}

/**
 * Verifies JWT Access Token and returns payload.
 */
export async function verifyAccessToken(token: string): Promise<TokenPayload | null> {
  try {
    const secret = getJwtSecret();
    const { payload } = await jwtVerify(token, secret);
    return {
      userId: payload.userId as string,
      email: payload.email as string,
      organizationId: payload.organizationId as string,
      role: payload.role as string,
    };
  } catch {
    return null;
  }
}

/**
 * Generates an opaque, high-entropy refresh token string.
 */
export function generateRefreshToken(): string {
  return `rt_${crypto.randomBytes(32).toString('hex')}`;
}

/**
 * Computes deterministic SHA-256 hash of a token for secure database storage.
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Hashes password using bcrypt with standard cost factor 12.
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

/**
 * Verifies password against hash in constant time.
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
