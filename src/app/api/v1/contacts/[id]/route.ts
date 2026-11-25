import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { authenticateRequest, logAuditEvent } from '@/lib/api-auth';
import { contactScope } from '@/lib/lead-access';
import { UpdateContactSchema } from '@/lib/contact-fields';

export const runtime = 'nodejs';

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { auth, errorResponse } = await authenticateRequest(req, 'operator'); if (errorResponse) return errorResponse;
  const { id } = await context.params;
  const parsed = UpdateContactSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid contact details' }, { status: 400 });
  const existing = await db.contact.findFirst({ where: { id, ...contactScope(auth!) } });
  if (!existing) return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
  const { expectedUpdatedAt, ...changes } = parsed.data;
  if (expectedUpdatedAt && existing.updatedAt.toISOString() !== expectedUpdatedAt) return NextResponse.json({ error: 'This contact changed. Reopen it before saving your changes.' }, { status: 409 });
  const merged = { ...existing, ...Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined)) };
  if (!merged.phone && !merged.email) return NextResponse.json({ error: 'Provide a phone number or email address' }, { status: 400 });
  try {
    const result = await db.$transaction(async tx => {
      const updated = await tx.contact.updateMany({ where: { id, ...contactScope(auth!), updatedAt: existing.updatedAt }, data: changes });
      if (!updated.count) return null;
      const contact = await tx.contact.findUniqueOrThrow({ where: { id } });
      await tx.auditLog.create({ data: { organizationId: auth!.organizationId, actorUserId: auth!.userId, action: 'contact.update', targetType: 'Contact', targetId: id, metadata: { fields: Object.keys(changes) } } });
      return contact;
    });
    if (!result) return NextResponse.json({ error: 'This contact changed or is no longer assigned to you. Reopen it before saving.' }, { status: 409 });
    return NextResponse.json({ contact: result });
  } catch (error) {
    if ((error as { code?: string })?.code === 'P2002') return NextResponse.json({ error: 'Another contact already uses this phone number' }, { status: 409 });
    return NextResponse.json({ error: 'Could not save contact details' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { auth, errorResponse } = await authenticateRequest(req, 'admin');
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

  await db.lead.deleteMany({
    where: { contactId: contact.id, quotations: { none: {} } },
  });

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
