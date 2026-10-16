import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { authenticateRequest, logAuditEvent } from '@/lib/api-auth';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const { auth, errorResponse } = await authenticateRequest(req, 'viewer');
  if (errorResponse) return errorResponse;

  try {
    const memberships = await db.membership.findMany({
      where: { userId: auth!.userId },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            slug: true,
            primaryTelephonyProvider: true,
            createdAt: true,
            _count: {
              select: {
                members: true,
                numbers: true,
                calls: true,
                leads: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const organizations = memberships.map((m) => ({
      id: m.organization.id,
      name: m.organization.name,
      slug: m.organization.slug,
      role: m.role,
      primaryTelephonyProvider: m.organization.primaryTelephonyProvider,
      isActive: m.organization.id === auth!.organizationId,
      counts: m.organization._count,
      createdAt: m.organization.createdAt,
    }));

    return NextResponse.json({
      api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
      activeOrganizationId: auth!.organizationId,
      organizations,
    });
  } catch (err: any) {
    return NextResponse.json(
      { api_id: 'server_err', error: err.message || 'Failed to fetch organizations' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const { auth, errorResponse } = await authenticateRequest(req, 'viewer');
  if (errorResponse) return errorResponse;

  try {
    const body = await req.json();
    const { name } = body;

    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return NextResponse.json(
        { api_id: 'bad_req', error: 'Organization name must be at least 2 characters' },
        { status: 400 }
      );
    }

    const trimmedName = name.trim();
    const baseSlug = trimmedName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const slug = `${baseSlug}-${crypto.randomBytes(3).toString('hex')}`;

    // Create organization and assign caller as owner in a single transaction
    const result = await db.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          name: trimmedName,
          slug,
          primaryTelephonyProvider: 'plivo',
          transcriptionDefaultEnabled: true,
          transcriptionLanguage: 'en-US',
        },
      });

      const membership = await tx.membership.create({
        data: {
          organizationId: org.id,
          userId: auth!.userId,
          role: 'owner',
        },
      });

      return { org, membership };
    });

    await logAuditEvent({
      organizationId: result.org.id,
      actorUserId: auth!.userId,
      action: 'organization.create',
      metadata: { organizationName: trimmedName, slug },
    });

    return NextResponse.json({
      api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
      message: 'Organization created successfully',
      organization: {
        id: result.org.id,
        name: result.org.name,
        slug: result.org.slug,
        role: 'owner',
        primaryTelephonyProvider: result.org.primaryTelephonyProvider,
      },
    }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json(
      { api_id: 'server_err', error: err.message || 'Failed to create organization' },
      { status: 500 }
    );
  }
}
