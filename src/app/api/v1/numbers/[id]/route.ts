import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { authenticateRequest, logAuditEvent } from '@/lib/api-auth';
import { UpdatePhoneNumberSchema } from '@/lib/schemas';
import { getTelephonyProvider } from '@/lib/telephony';

export const runtime = 'nodejs';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { auth, errorResponse } = await authenticateRequest(req, 'viewer');
  if (errorResponse) return errorResponse;

  const { id } = await params;
  const number = await db.phoneNumber.findFirst({
    where: {
      id,
      organizationId: auth!.organizationId,
    },
    include: {
      application: true,
    },
  });

  if (!number) {
    return NextResponse.json(
      { api_id: 'not_found', error: 'Phone number not found' },
      { status: 404 }
    );
  }

  return NextResponse.json({
    api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
    number,
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { auth, errorResponse } = await authenticateRequest(req, 'operator');
  if (errorResponse) return errorResponse;

  const { id } = await params;
  const existing = await db.phoneNumber.findFirst({
    where: {
      id,
      organizationId: auth!.organizationId,
    },
  });

  if (!existing) {
    return NextResponse.json(
      { api_id: 'not_found', error: 'Phone number not found' },
      { status: 404 }
    );
  }

  const body = await req.json();
  const parsed = UpdatePhoneNumberSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { api_id: 'bad_req', error: parsed.error.issues[0]?.message || 'Invalid parameters' },
      { status: 400 }
    );
  }

  const updated = await db.phoneNumber.update({
    where: { id },
    data: parsed.data,
  });

  await logAuditEvent({
    organizationId: auth!.organizationId,
    actorUserId: auth!.userId,
    action: 'number.update',
    targetType: 'PhoneNumber',
    targetId: id,
    metadata: parsed.data,
  });

  return NextResponse.json({
    api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
    message: 'Phone number updated successfully',
    number: updated,
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { auth, errorResponse } = await authenticateRequest(req, 'admin');
  if (errorResponse) return errorResponse;

  const { id } = await params;
  const existing = await db.phoneNumber.findFirst({
    where: {
      id,
      organizationId: auth!.organizationId,
      status: 'active',
    },
  });

  if (!existing) {
    return NextResponse.json(
      { api_id: 'not_found', error: 'Active phone number not found' },
      { status: 404 }
    );
  }

  try {
    const provider = getTelephonyProvider();
    await provider.releaseNumber(existing.e164);

    // Soft delete locally
    const released = await db.phoneNumber.update({
      where: { id },
      data: {
        status: 'released',
        releasedAt: new Date(),
      },
    });

    await logAuditEvent({
      organizationId: auth!.organizationId,
      actorUserId: auth!.userId,
      action: 'number.release',
      targetType: 'PhoneNumber',
      targetId: id,
      metadata: { e164: existing.e164 },
    });

    return NextResponse.json({
      api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
      message: `Number ${existing.e164} released successfully`,
      number: released,
    });
  } catch (err: any) {
    return NextResponse.json(
      { api_id: 'provider_err', error: err.message },
      { status: 500 }
    );
  }
}
