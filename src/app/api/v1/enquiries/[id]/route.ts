import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-auth';
import { contactScope, managesLeads } from '@/lib/lead-access';
import { UpdateEnquirySchema, dedupeTags } from '@/lib/enquiry-fields';
import { EnquiryError, assertAssignable, enquiryErrorResponse, enquiryInclude, lockAgency } from '@/lib/enquiry-server';

export const runtime = 'nodejs';

type Context = { params: Promise<{ id: string }> };

// GET /api/v1/enquiries/:id - enquiry profile with related trips and calls
export async function GET(req: NextRequest, context: Context) {
  const { auth, errorResponse } = await authenticateRequest(req, 'operator');
  if (errorResponse) return errorResponse;
  const { id } = await context.params;

  const contact = await db.contact.findFirst({
    where: { id, ...contactScope(auth!) },
    include: {
      ...enquiryInclude,
      leads: { select: { id: true, title: true, stage: true, status: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 20 },
      enquiryCalls: { select: { id: true, direction: true, status: true, startedAt: true, durationSeconds: true }, orderBy: { startedAt: 'desc' }, take: 20 },
    },
  });
  if (!contact) return NextResponse.json({ api_id: 'not_found', error: 'Enquiry not found' }, { status: 404 });
  return NextResponse.json({ contact });
}

// PATCH /api/v1/enquiries/:id - edit details, status, tags and (permitted) ownership
export async function PATCH(req: NextRequest, context: Context) {
  const { auth, errorResponse } = await authenticateRequest(req, 'operator');
  if (errorResponse) return errorResponse;
  const { id } = await context.params;

  const parsed = UpdateEnquirySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ api_id: 'val_err', error: parsed.error.issues[0]?.message || 'Invalid enquiry details' }, { status: 400 });
  }
  const { expectedUpdatedAt, assignedToId, tags, ...rest } = parsed.data;

  try {
    const contact = await db.$transaction(async tx => {
      // Serialize ownership changes with new enquiries, call routing and round robin.
      await lockAgency(tx, auth!.organizationId);
      const existing = await tx.contact.findFirst({ where: { id, ...contactScope(auth!) } });
      if (!existing) throw new EnquiryError('Enquiry not found', 404, 'not_found');
      if (expectedUpdatedAt && existing.updatedAt.toISOString() !== expectedUpdatedAt) {
        throw new EnquiryError('This enquiry changed. Reopen it before saving your changes.', 409, 'stale');
      }

      const merged = { ...existing, ...Object.fromEntries(Object.entries(rest).filter(([, value]) => value !== undefined)) };
      if (!merged.phone && !merged.email) throw new EnquiryError('Provide a phone number or email address', 400, 'val_err');

      const ownerChanges = assignedToId !== undefined && assignedToId !== existing.assignedToId;
      if (ownerChanges) {
        if (!managesLeads(auth!)) {
          // Staff may only claim an enquiry that has no owner yet; they cannot hand over or steal one.
          if (!(existing.assignedToId === null && assignedToId === auth!.userId)) {
            throw new EnquiryError('Only admins can change who an enquiry is assigned to', 403, 'forbidden');
          }
        }
        if (assignedToId) await assertAssignable(tx, auth!.organizationId, assignedToId);
      }

      const updated = await tx.contact.updateMany({
        where: { id, organizationId: auth!.organizationId, updatedAt: existing.updatedAt },
        data: {
          ...rest,
          ...(tags ? { tags: dedupeTags(tags) } : {}),
          ...(ownerChanges ? { assignedToId, assignedAt: assignedToId ? new Date() : null } : {}),
        },
      });
      if (!updated.count) throw new EnquiryError('This enquiry changed. Reopen it before saving your changes.', 409, 'stale');

      const leadCount = await tx.lead.count({ where: { contactId: id, organizationId: auth!.organizationId } });
      if (leadCount > 0) {
        const leadUpdateData: Record<string, unknown> = {};
        if (ownerChanges) {
          leadUpdateData.assignedToId = assignedToId;
          leadUpdateData.assignedAt = assignedToId ? new Date() : null;
        }
        if (rest.enquiryStatus) leadUpdateData.stage = rest.enquiryStatus;
        if (rest.enquiryTag) leadUpdateData.temperature = rest.enquiryTag;
        if (tags) {
          const finalTags = dedupeTags(tags);
          leadUpdateData.tags = finalTags;
          const srcTag = finalTags.find(t => t.toLowerCase().startsWith('source:'));
          if (srcTag) {
            const srcName = srcTag.slice(7).trim().split(/[_\s-]+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
            leadUpdateData.source = srcName;
            leadUpdateData.formName = srcName;
          }
        }
        if (rest.city !== undefined) leadUpdateData.destination = rest.city || null;
        if (rest.email !== undefined) leadUpdateData.customerEmail = rest.email || null;
        if (Object.keys(leadUpdateData).length > 0) {
          await tx.lead.updateMany({
            where: { contactId: id, organizationId: auth!.organizationId },
            data: leadUpdateData,
          });
        }
      }

      await tx.auditLog.create({ data: {
        organizationId: auth!.organizationId, actorUserId: auth!.userId, action: 'enquiry.update', targetType: 'Contact', targetId: id,
        metadata: { fields: Object.keys(parsed.data).filter(key => key !== 'expectedUpdatedAt'), ...(ownerChanges ? { previousAssignee: existing.assignedToId, assignedToId } : {}) },
      } });
      return tx.contact.findUniqueOrThrow({ where: { id }, include: enquiryInclude });
    }, { timeout: 15_000 });
    return NextResponse.json({ contact });
  } catch (error) {
    return enquiryErrorResponse(error);
  }
}
