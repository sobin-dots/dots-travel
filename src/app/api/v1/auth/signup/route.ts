import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { SignupRequestSchema } from '@/lib/schemas';
import { hashPassword, signAccessToken, generateRefreshToken, hashToken } from '@/lib/auth-tokens';
import { logAuditEvent } from '@/lib/api-auth';

export const runtime = 'nodejs';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = SignupRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { api_id: 'auth_err', error: parsed.error.issues[0]?.message || 'Invalid registration data' },
        { status: 400 }
      );
    }

    const { organizationName, name, email, password } = parsed.data;

    // Check if user already exists
    const existingUser = await db.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json(
        { api_id: 'auth_err', error: 'An account with this email already exists. Please sign in.' },
        { status: 409 }
      );
    }

    // Generate unique slug
    let baseSlug = slugify(organizationName) || 'company';
    let slug = baseSlug;
    let counter = 1;
    while (await db.organization.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    const passwordHash = await hashPassword(password);

    // Create Organization, User, Membership, and Initial Simulator Phone Number in transaction
    const result = await db.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          name: organizationName,
          slug,
          recordingRetentionDays: 90,
          transcriptionDefaultEnabled: true,
          transcriptionLanguage: 'en-US',
          redactMessageContent: false,
        },
      });

      const user = await tx.user.create({
        data: {
          email,
          name,
          passwordHash,
          status: 'active',
        },
      });

      const membership = await tx.membership.create({
        data: {
          organizationId: org.id,
          userId: user.id,
          role: 'owner',
        },
      });

      // Provision Plivo Account (Live carrier credentials when TELEPHONY_MODE === 'live')
      const isLive = process.env.TELEPHONY_MODE === 'live' && !!process.env.PLIVO_AUTH_ID;
      const rawAuthId = isLive
        ? process.env.PLIVO_AUTH_ID!
        : `MAMOCK${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
      const rawAuthToken = isLive
        ? (process.env.PLIVO_AUTH_TOKEN || '')
        : `sim-token-${crypto.randomBytes(12).toString('hex')}`;
      const { encryptData } = await import('@/lib/crypto');
      const encAuthId = encryptData(rawAuthId);
      const encAuthToken = encryptData(rawAuthToken);

      const plivoAccount = await tx.plivoAccount.create({
        data: {
          organizationId: org.id,
          label: isLive ? 'Live Carrier Account (Plivo)' : 'Primary Account (Simulated)',
          authIdEncrypted: encAuthId.ciphertext,
          authIdLast4: rawAuthId.slice(-4),
          authTokenEncrypted: encAuthToken.ciphertext,
          encIv: encAuthId.iv,
          encAuthTag: encAuthId.authTag,
          encKeyVersion: encAuthId.keyVersion,
          status: 'verified',
          lastVerifiedAt: new Date(),
        },
      });

      const app = await tx.application.create({
        data: {
          organizationId: org.id,
          plivoAccountId: plivoAccount.id,
          plivoAppId: isLive ? `app-live-${crypto.randomBytes(6).toString('hex')}` : `app-sim-${crypto.randomBytes(6).toString('hex')}`,
          name: `${organizationName} Default App`,
          answerUrl: `${process.env.PUBLIC_BASE_URL || 'http://localhost:3000'}/api/v1/webhooks/voice/answer`,
          defaultNumberApp: true,
        },
      });

      // Provision starter phone line: real line when live, simulated demo line otherwise
      const activeLine = isLive ? '+918065531234' : `+1415555${Math.floor(1000 + Math.random() * 9000)}`;
      await tx.phoneNumber.create({
        data: {
          organizationId: org.id,
          plivoAccountId: plivoAccount.id,
          applicationId: app.id,
          e164: activeLine,
          countryIso: isLive ? 'IN' : 'US',
          numberType: 'local',
          status: 'active',
          friendlyName: isLive ? `Plivo Carrier Line (${activeLine})` : `${organizationName} Main Line`,
          recordCalls: true,
          transcribeEnabled: true,
          monthlyRental: '1.0000',
          smsRate: '0.0075',
          voiceRate: '0.0120',
        },
      });

      return { org, user, membership };
    });

    // Issue tokens
    const accessToken = await signAccessToken({
      userId: result.user.id,
      email: result.user.email,
      organizationId: result.org.id,
      role: 'owner',
    });

    const rawRefreshToken = generateRefreshToken();
    const tokenHash = hashToken(rawRefreshToken);
    const familyId = `fam_${crypto.randomBytes(16).toString('hex')}`;
    const ttlDays = Number(process.env.REFRESH_TOKEN_TTL_DAYS || '30');
    const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

    await db.session.create({
      data: {
        userId: result.user.id,
        organizationId: result.org.id,
        kind: 'api_refresh',
        tokenHash,
        familyId,
        expiresAt,
        userAgent: req.headers.get('user-agent'),
        ip: req.headers.get('x-forwarded-for') || '127.0.0.1',
      },
    });

    await logAuditEvent({
      organizationId: result.org.id,
      actorUserId: result.user.id,
      action: 'auth.signup',
      ip: req.headers.get('x-forwarded-for') || '127.0.0.1',
      userAgent: req.headers.get('user-agent') || undefined,
      metadata: { organizationName, slug },
    });

    return NextResponse.json(
      {
        api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
        accessToken,
        tokenType: 'Bearer',
        expiresIn: Number(process.env.ACCESS_TOKEN_TTL || '900'),
        refreshToken: rawRefreshToken,
        user: {
          id: result.user.id,
          email: result.user.email,
          name: result.user.name,
        },
        organization: {
          id: result.org.id,
          name: result.org.name,
          slug: result.org.slug,
          role: 'owner',
        },
      },
      { status: 201 }
    );
  } catch (err: any) {
    console.error('Signup error:', err);
    return NextResponse.json(
      { api_id: 'server_err', error: 'Internal server error while registering account' },
      { status: 500 }
    );
  }
}
