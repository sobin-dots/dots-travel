import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-auth';
import { contactScope } from '@/lib/lead-access';
import { CreateEnquirySchema, ENQUIRY_STATUSES, ENQUIRY_TAGS } from '@/lib/enquiry-fields';
import { createEnquiryContact, enquiryErrorResponse, enquiryInclude, lockAgency, resolveNewOwner } from '@/lib/enquiry-server';

export const runtime = 'nodejs';

// GET /api/v1/enquiries?assignedTo=me|unassigned|<userId>&status=&tag=&q=
export async function GET(req: NextRequest) {
  const { auth, errorResponse } = await authenticateRequest(req, 'operator');
  if (errorResponse) return errorResponse;

  const params = new URL(req.url).searchParams;
  const assignedTo = params.get('assignedTo');
  const status = params.get('status');
  const tag = params.get('tag');
  const q = (params.get('q') || '').trim();

  const filters: Record<string, unknown>[] = [];
  if (assignedTo === 'me') filters.push({ assignedToId: auth!.userId });
  else if (assignedTo === 'unassigned') filters.push({ assignedToId: null });
  else if (assignedTo) filters.push({ assignedToId: assignedTo });
  if (status && (ENQUIRY_STATUSES as readonly string[]).includes(status)) filters.push({ enquiryStatus: status });
  if (tag && (ENQUIRY_TAGS as readonly string[]).includes(tag)) filters.push({ enquiryTag: tag });
  if (q) {
    filters.push({ OR: [
      { name: { contains: q, mode: 'insensitive' } },
      { phone: { contains: q } },
      { email: { contains: q, mode: 'insensitive' } },
      { city: { contains: q, mode: 'insensitive' } },
      { tags: { has: q } },
    ] });
  }

  const objects = await db.contact.findMany({
    where: { AND: [contactScope(auth!), ...filters] },
    include: enquiryInclude,
    orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
  });

  return NextResponse.json({ api_id: `api_${crypto.randomBytes(8).toString('hex')}`, objects, totalCount: objects.length });
}

// POST /api/v1/enquiries - create an enquiry with owner, status and tags
export async function POST(req: NextRequest) {
  const { auth, errorResponse } = await authenticateRequest(req, 'operator');
  if (errorResponse) return errorResponse;

  const parsed = CreateEnquirySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ api_id: 'val_err', error: parsed.error.issues[0]?.message || 'Invalid enquiry details' }, { status: 400 });
  }

  try {
    const contact = await db.$transaction(async tx => {
      await lockAgency(tx, auth!.organizationId);
      const assignedToId = await resolveNewOwner(tx, auth!, parsed.data.assignedToId);
      const created = await createEnquiryContact(tx, auth!.organizationId, parsed.data, assignedToId);
      await tx.auditLog.create({ data: {
        organizationId: auth!.organizationId, actorUserId: auth!.userId, action: 'enquiry.create', targetType: 'Contact', targetId: created.id,
        metadata: { assignedToId, enquiryStatus: created.enquiryStatus, enquiryTag: created.enquiryTag },
      } });
      return created;
    }, { timeout: 15_000 });
    return NextResponse.json({ api_id: `api_${crypto.randomBytes(8).toString('hex')}`, contact, message: 'Enquiry added successfully' }, { status: 201 });
  } catch (error) {
    return enquiryErrorResponse(error);
  }
}
