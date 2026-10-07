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
  const contact = await db.contact.findFirst({
    where: { id, organizationId: auth!.organizationId },
  });

  if (!contact) {
    return NextResponse.json(
      { api_id: 'not_found', error: 'Contact not found' },
      { status: 404 }
    );
  }

  await db.contact.delete({
    where: { id: contact.id },
  });

  await logAuditEvent({
    organizationId: auth!.organizationId,
    actorUserId: auth!.userId,
    action: 'contact.delete',
    targetType: 'Contact',
    targetId: contact.id,
    metadata: { name: contact.name, phone: contact.phone },
  });

  return NextResponse.json({
    api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
    message: 'Contact deleted successfully',
  });
}
