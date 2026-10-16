import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { authenticateRequest, logAuditEvent } from '@/lib/api-auth';
import { signAccessToken, generateRefreshToken, hashToken } from '@/lib/auth-tokens';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const { auth, errorResponse } = await authenticateRequest(req, 'viewer');
  if (errorResponse) return errorResponse;

  try {
    const body = await req.json();
    const { organizationId } = body;

    if (!organizationId) {
      return NextResponse.json(
        { api_id: 'bad_req', error: 'Missing required field: organizationId' },
        { status: 400 }
      );
    }

    // Verify user belongs to the target organization
    const targetMembership = await db.membership.findUnique({
      where: {
        organizationId_userId: {
          organizationId,
          userId: auth!.userId,
        },
      },
      include: {
        organization: true,
        user: true,
      },
    });

    if (!targetMembership || targetMembership.user.status !== 'active') {
      return NextResponse.json(
        { api_id: 'forbidden', error: 'You do not have access to this organization' },
        { status: 403 }
      );
    }

    // Sign new access token with the new organizationId
    const newAccessToken = await signAccessToken({
      userId: targetMembership.userId,
      email: targetMembership.user.email,
      organizationId: targetMembership.organizationId,
      role: targetMembership.role,
    });

    // Create a new refresh session for this organization
    const rawRefreshToken = generateRefreshToken();
    const tokenHash = hashToken(rawRefreshToken);
    const ttlDays = Number(process.env.REFRESH_TOKEN_TTL_DAYS || '30');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + ttlDays);

    await db.session.create({
      data: {
        userId: targetMembership.userId,
        organizationId: targetMembership.organizationId,
        kind: 'console',
        tokenHash,
        expiresAt,
        userAgent: req.headers.get('user-agent'),
        ip: req.headers.get('x-forwarded-for') || '127.0.0.1',
      },
    });

    await logAuditEvent({
      organizationId: targetMembership.organizationId,
      actorUserId: targetMembership.userId,
      action: 'organization.switch',
      metadata: { switchedToOrg: targetMembership.organization.name },
    });

    return NextResponse.json({
      api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
      message: `Switched active organization to ${targetMembership.organization.name}`,
      accessToken: newAccessToken,
      refreshToken: rawRefreshToken,
      organization: {
        id: targetMembership.organization.id,
        name: targetMembership.organization.name,
        slug: targetMembership.organization.slug,
        role: targetMembership.role,
        primaryTelephonyProvider: targetMembership.organization.primaryTelephonyProvider,
      },
      user: {
        id: targetMembership.user.id,
        email: targetMembership.user.email,
        name: targetMembership.user.name,
        role: targetMembership.role,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { api_id: 'server_err', error: err.message || 'Failed to switch organization' },
      { status: 500 }
    );
  }
}
