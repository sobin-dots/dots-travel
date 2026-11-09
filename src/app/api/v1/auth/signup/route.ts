import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { SignupRequestSchema } from '@/lib/schemas';
import {
  hashPassword,
  signAccessToken,
  generateRefreshToken,
  hashToken,
  DEFAULT_ACCESS_TOKEN_TTL,
} from '@/lib/auth-tokens';
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

    // Create Organization, User, Membership, and Initial Live Carrier Phone Number in transaction
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
        expiresIn: Number(
          process.env.JWT_ACCESS_TTL_SECONDS ||
            process.env.ACCESS_TOKEN_TTL ||
            String(DEFAULT_ACCESS_TOKEN_TTL)
        ),
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
