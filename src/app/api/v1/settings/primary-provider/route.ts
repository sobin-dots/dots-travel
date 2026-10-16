import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { authenticateRequest, logAuditEvent } from '@/lib/api-auth';

export const runtime = 'nodejs';

export async function PATCH(req: NextRequest) {
  const { auth, errorResponse } = await authenticateRequest(req, 'admin');
  if (errorResponse) return errorResponse;

  try {
    const body = await req.json();
    const { primaryProvider } = body;

    if (!primaryProvider || !['plivo', 'msg91'].includes(primaryProvider)) {
      return NextResponse.json(
        { api_id: 'bad_req', error: "Invalid primary provider. Must be 'plivo' or 'msg91'." },
        { status: 400 }
      );
    }

    const updated = await db.organization.update({
      where: { id: auth!.organizationId },
      data: { primaryTelephonyProvider: primaryProvider },
      select: {
        id: true,
        name: true,
        slug: true,
        primaryTelephonyProvider: true,
      },
    });

    await logAuditEvent({
      organizationId: auth!.organizationId,
      actorUserId: auth!.userId,
      action: 'organization.update_primary_telephony_provider',
      metadata: { primaryTelephonyProvider: primaryProvider },
    });

    return NextResponse.json({
      api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
      message: `Primary telephony provider set to ${primaryProvider.toUpperCase()}`,
      organization: updated,
    });
  } catch (err: any) {
    return NextResponse.json(
      { api_id: 'server_err', error: err.message || 'Failed to update primary telephony provider' },
      { status: 500 }
    );
  }
}
