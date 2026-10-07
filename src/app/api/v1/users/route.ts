import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { authenticateRequest, logAuditEvent } from '@/lib/api-auth';
import { CreateUserRequestSchema } from '@/lib/schemas';
import { hashPassword } from '@/lib/auth-tokens';

export const runtime = 'nodejs';

// GET /api/v1/users - List staff members of the organization
export async function GET(req: NextRequest) {
  const { auth, errorResponse } = await authenticateRequest(req, 'operator');
  if (errorResponse) return errorResponse;

  const memberships = await db.membership.findMany({
    where: { organizationId: auth!.organizationId },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          status: true,
          createdAt: true,
          lastLoginAt: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  const staff = memberships.map((m) => ({
    id: m.user.id,
    membershipId: m.id,
    name: m.user.name,
    email: m.user.email,
    role: m.role,
    status: m.user.status,
    createdAt: m.user.createdAt,
    lastLoginAt: m.user.lastLoginAt,
  }));

  return NextResponse.json({
    api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
    objects: staff,
    totalCount: staff.length,
  });
}

// POST /api/v1/users - Create/invite a new staff member
export async function POST(req: NextRequest) {
  const { auth, errorResponse } = await authenticateRequest(req, 'admin');
  if (errorResponse) return errorResponse;

  try {
    const body = await req.json();
    const parsed = CreateUserRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { api_id: 'val_err', error: parsed.error.issues[0]?.message || 'Invalid user data' },
        { status: 400 }
      );
    }

    const { name, email, password, role } = parsed.data;

    // Check if user already exists
    let user = await db.user.findUnique({
      where: { email },
      include: {
        memberships: {
          where: { organizationId: auth!.organizationId },
        },
      },
    });

    if (user && user.memberships.length > 0) {
      return NextResponse.json(
        { api_id: 'conflict', error: 'User is already a staff member of this organization' },
        { status: 409 }
      );
    }

    const passwordHash = await hashPassword(password);

    if (!user) {
      // Create new user
      user = await db.user.create({
        data: {
          email,
          name,
          passwordHash,
          status: 'active',
        },
        include: { memberships: true },
      });
    }

    // Create membership in current organization
    const membership = await db.membership.create({
      data: {
        organizationId: auth!.organizationId,
        userId: user.id,
        role,
      },
    });

    await logAuditEvent({
      organizationId: auth!.organizationId,
      actorUserId: auth!.userId,
      action: 'user.create',
      targetType: 'User',
      targetId: user.id,
      metadata: { email, role, name },
    });

    return NextResponse.json(
      {
        api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
        user: {
          id: user.id,
          membershipId: membership.id,
          name: user.name,
          email: user.email,
          role: membership.role,
          status: user.status,
          createdAt: user.createdAt,
        },
        message: 'Staff member created successfully',
      },
      { status: 201 }
    );
  } catch (err: any) {
    console.error('Create staff error:', err);
    return NextResponse.json(
      { api_id: 'server_err', error: err.message || 'Internal error creating staff member' },
      { status: 500 }
    );
  }
}
