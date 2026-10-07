import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { authenticateRequest, logAuditEvent } from '@/lib/api-auth';

export const runtime = 'nodejs';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { auth, errorResponse } = await authenticateRequest(req, 'operator');
  if (errorResponse) return errorResponse;

  const { id } = await params;
  const supplier = await db.supplier.findFirst({
    where: { id, organizationId: auth!.organizationId },
  });

  if (!supplier) {
    return NextResponse.json({ api_id: 'not_found', error: 'Supplier not found' }, { status: 404 });
  }

  await db.supplier.delete({
    where: { id: supplier.id },
  });

  await logAuditEvent({
    organizationId: auth!.organizationId,
    actorUserId: auth!.userId,
    action: 'supplier.delete',
    targetType: 'Supplier',
    targetId: supplier.id,
    metadata: { name: supplier.name, email: supplier.email },
  });

  return NextResponse.json({
    api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
    message: 'Supplier deleted successfully',
  });
}
