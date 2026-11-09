import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { RefreshTokenRequestSchema } from '@/lib/schemas';
import {
  hashToken,
  generateRefreshToken,
  signAccessToken,
  DEFAULT_ACCESS_TOKEN_TTL,
} from '@/lib/auth-tokens';
import { logAuditEvent } from '@/lib/api-auth';

export const runtime = 'nodejs';

const CONCURRENT_REFRESH_GRACE_MS = 30_000;
const recentRotatedTokenCache = new Map<
  string,
  { accessToken: string; refreshToken: string; expiresIn: number; expiresAt: number }
>();

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = RefreshTokenRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { api_id: 'auth_err', error: 'Missing or invalid refreshToken parameter' },
        { status: 400 }
      );
    }

    const { refreshToken } = parsed.data;
    const tokenHash = hashToken(refreshToken);

    // Fast path for concurrent refresh requests within the 30-second grace window
    const cachedRotation = recentRotatedTokenCache.get(tokenHash);
    if (cachedRotation && cachedRotation.expiresAt > Date.now()) {
      return NextResponse.json({
        api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
        accessToken: cachedRotation.accessToken,
        tokenType: 'Bearer',
        expiresIn: cachedRotation.expiresIn,
        refreshToken: cachedRotation.refreshToken,
      });
    }

    const existingSession = await db.session.findUnique({
      where: { tokenHash },
      include: {
        user: {
          include: {
            memberships: true,
          },
        },
      },
    });

    if (!existingSession) {
      return NextResponse.json(
        { api_id: 'auth_err', error: 'Invalid refresh token' },
        { status: 401 }
      );
    }

    const expiresInSeconds = Number(
      process.env.JWT_ACCESS_TTL_SECONDS ||
        process.env.ACCESS_TOKEN_TTL ||
        String(DEFAULT_ACCESS_TOKEN_TTL)
    );

    // Reuse detection with 30-second concurrent request grace period
    if (existingSession.revokedAt) {
      const msSinceRevoked = Date.now() - existingSession.revokedAt.getTime();
      if (msSinceRevoked <= CONCURRENT_REFRESH_GRACE_MS) {
        const childSession = await db.session.findFirst({
          where: {
            rotatedFromId: existingSession.id,
            revokedAt: null,
          },
        });
        const membership = existingSession.user.memberships.find(
          (m) => m.organizationId === existingSession.organizationId
        );
        if (childSession && membership && existingSession.user.status === 'active') {
          const graceAccessToken = await signAccessToken({
            userId: existingSession.userId,
            email: existingSession.user.email,
            organizationId: membership.organizationId,
            role: membership.role,
          });
          return NextResponse.json({
            api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
            accessToken: graceAccessToken,
            tokenType: 'Bearer',
            expiresIn: expiresInSeconds,
          });
        }
      }

      console.warn(`[Security Alert] Refresh token reuse detected for family ${existingSession.familyId}!`);
      if (existingSession.familyId) {
        await db.session.updateMany({
          where: { familyId: existingSession.familyId },
          data: { revokedAt: new Date() },
        });
      }

      await logAuditEvent({
        organizationId: existingSession.organizationId || 'system',
        actorUserId: existingSession.userId,
        action: 'auth.token_reuse_detected',
        result: 'failure',
        metadata: { familyId: existingSession.familyId },
      });

      return NextResponse.json(
        { api_id: 'auth_err', error: 'Security breach detected: refresh token was previously used and invalidated. All sessions revoked.' },
        { status: 401 }
      );
    }

    // Check expiration
    if (new Date() > existingSession.expiresAt) {
      return NextResponse.json(
        { api_id: 'auth_err', error: 'Refresh token has expired' },
        { status: 401 }
      );
    }

    // Revoke the old token immediately
    await db.session.update({
      where: { id: existingSession.id },
      data: { revokedAt: new Date() },
    });

    // Lookup user membership
    const membership = existingSession.user.memberships.find(
      (m) => m.organizationId === existingSession.organizationId
    );

    if (!membership || existingSession.user.status !== 'active') {
      return NextResponse.json(
        { api_id: 'auth_err', error: 'User is inactive or no longer belongs to organization' },
        { status: 403 }
      );
    }

    // Generate new rotating refresh token in same family
    const newRawRefreshToken = generateRefreshToken();
    const newTokenHash = hashToken(newRawRefreshToken);
    const ttlDays = Number(process.env.REFRESH_TOKEN_TTL_DAYS || '30');
    const newExpiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

    await db.session.create({
      data: {
        userId: existingSession.userId,
        organizationId: existingSession.organizationId,
        kind: 'api_refresh',
        tokenHash: newTokenHash,
        familyId: existingSession.familyId,
        rotatedFromId: existingSession.id,
        expiresAt: newExpiresAt,
        userAgent: req.headers.get('user-agent'),
        ip: req.headers.get('x-forwarded-for') || '127.0.0.1',
      },
    });

    // Issue new access token
    const accessToken = await signAccessToken({
      userId: existingSession.userId,
      email: existingSession.user.email,
      organizationId: membership.organizationId,
      role: membership.role,
    });

    // Store in short-lived grace cache so concurrent requests from the same browser tab/context don't fail
    recentRotatedTokenCache.set(tokenHash, {
      accessToken,
      refreshToken: newRawRefreshToken,
      expiresIn: expiresInSeconds,
      expiresAt: Date.now() + CONCURRENT_REFRESH_GRACE_MS,
    });
    if (recentRotatedTokenCache.size > 200) {
      const now = Date.now();
      for (const [k, v] of recentRotatedTokenCache.entries()) {
        if (v.expiresAt <= now) recentRotatedTokenCache.delete(k);
      }
    }

    return NextResponse.json({
      api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
      accessToken,
      tokenType: 'Bearer',
      expiresIn: expiresInSeconds,
      refreshToken: newRawRefreshToken,
    });
  } catch (err: any) {
    console.error('Token refresh error:', err);
    return NextResponse.json(
      { api_id: 'server_err', error: 'Internal token refresh error' },
      { status: 500 }
    );
  }
}
