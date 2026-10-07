import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { LoginRequestSchema } from '@/lib/schemas';
import { verifyPassword, signAccessToken, generateRefreshToken, hashToken } from '@/lib/auth-tokens';
import { logAuditEvent } from '@/lib/api-auth';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = LoginRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { api_id: 'auth_err', error: parsed.error.issues[0]?.message || 'Invalid request body' },
        { status: 400 }
      );
    }

    const { email, password } = parsed.data;

    // Fetch user
    const user = await db.user.findUnique({
      where: { email },
      include: {
        memberships: {
          include: {
            organization: true,
          },
        },
      },
    });

    if (!user || user.status !== 'active') {
      return NextResponse.json(
        { api_id: 'auth_err', error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    // Verify password
    const passwordMatch = await verifyPassword(password, user.passwordHash);
    if (!passwordMatch) {
      return NextResponse.json(
        { api_id: 'auth_err', error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    // Select primary organization
    const primaryMembership = user.memberships[0];
    if (!primaryMembership) {
      return NextResponse.json(
        { api_id: 'auth_err', error: 'User does not belong to any active organization' },
        { status: 403 }
      );
    }

    const organizationId = primaryMembership.organizationId;
    const role = primaryMembership.role;

    // Issue access token
    const accessToken = await signAccessToken({
      userId: user.id,
      email: user.email,
      organizationId,
      role,
    });

    // Issue rotating refresh token
    const rawRefreshToken = generateRefreshToken();
    const tokenHash = hashToken(rawRefreshToken);
    const familyId = `fam_${crypto.randomBytes(16).toString('hex')}`;
    const ttlDays = Number(process.env.REFRESH_TOKEN_TTL_DAYS || '30');
    const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

    await db.session.create({
      data: {
        userId: user.id,
        organizationId,
        kind: 'api_refresh',
        tokenHash,
        familyId,
        expiresAt,
        userAgent: req.headers.get('user-agent'),
        ip: req.headers.get('x-forwarded-for') || '127.0.0.1',
      },
    });

    // Update lastLoginAt
    await db.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    await logAuditEvent({
      organizationId,
      actorUserId: user.id,
      action: 'auth.login',
      ip: req.headers.get('x-forwarded-for') || '127.0.0.1',
      userAgent: req.headers.get('user-agent') || undefined,
    });

    return NextResponse.json({
      api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
      accessToken,
      tokenType: 'Bearer',
      expiresIn: Number(process.env.ACCESS_TOKEN_TTL || '900'),
      refreshToken: rawRefreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      organization: {
        id: primaryMembership.organization.id,
        name: primaryMembership.organization.name,
        slug: primaryMembership.organization.slug,
        role,
      },
    });
  } catch (err: any) {
    console.error('Login error:', err);
    return NextResponse.json(
      { api_id: 'server_err', error: 'Internal authentication error' },
      { status: 500 }
    );
  }
}
