import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import type { Call } from '@prisma/client';
import { db } from '@/lib/db';
import { authenticateRequest, type AuthContext } from '@/lib/api-auth';
import { contactScope, managesLeads } from '@/lib/lead-access';
import { CreateEnquirySchema } from '@/lib/enquiry-fields';
import { EnquiryError, createEnquiryContact, enquiryErrorResponse, enquiryInclude, lockAgency, resolveNewOwner } from '@/lib/enquiry-server';

export const runtime = 'nodejs';

type Context = { params: Promise<{ id: string }> };

function actorOf(call: Pick<Call, 'requestedParams'>): string | null {
  const params = call.requestedParams as Record<string, unknown> | null;
  return typeof params?.actorUserId === 'string' ? params.actorUserId : null;
}

/** Admins see every call; staff only the calls they took or placed. */
function canAccessCall(auth: AuthContext, call: Pick<Call, 'assignedToId' | 'requestedParams'>) {
  return managesLeads(auth) || call.assignedToId === auth.userId || actorOf(call) === auth.userId;
}

/** The customer's number: the caller on inbound calls, the dialled number on outbound calls. */
function customerPhone(call: Pick<Call, 'direction' | 'from' | 'to'>) {
  const raw = (call.direction === 'outbound' ? call.to : call.from) || '';
  if (/^sip:/i.test(raw.trim())) return '';
  const digits = raw.replace(/[\s().+-]/g, '').replace(/^00/, '');
  return /^[1-9]\d{6,14}$/.test(digits) ? `+${digits}` : '';
}

/** The staff member who actually attended the call; a missed or declined reservation does not count. */
function attendedBy(call: Pick<Call, 'direction' | 'assignedToId' | 'agentOutcome' | 'agentAnsweredAt' | 'requestedParams'>) {
  if (call.direction === 'outbound') return actorOf(call) || call.assignedToId;
  return call.agentAnsweredAt || call.agentOutcome === 'answered' ? call.assignedToId : null;
}

async function findMatchingContact(organizationId: string, phone: string | null | undefined, email: string | null | undefined) {
  if (phone) {
    const digits = phone.replace(/\D/g, '');
    const byPhone = await db.contact.findFirst({ where: { organizationId, phone: { in: [phone, `+${digits}`, digits] } }, include: enquiryInclude });
    if (byPhone) return byPhone;
  }
  if (email) {
    const byEmail = await db.contact.findMany({ where: { organizationId, email: { equals: email, mode: 'insensitive' } }, include: enquiryInclude, take: 2 });
    if (byEmail.length === 1) return byEmail[0];
  }
  return null;
}

// GET /api/v1/calls/:id/enquiry - values used to prefill the "convert to enquiry" form
export async function GET(req: NextRequest, context: Context) {
  const { auth, errorResponse } = await authenticateRequest(req, 'operator');
  if (errorResponse) return errorResponse;
  const { id } = await context.params;

  const call = await db.call.findFirst({ where: { id, organizationId: auth!.organizationId } });
  if (!call || !canAccessCall(auth!, call)) return NextResponse.json({ api_id: 'not_found', error: 'Call not found' }, { status: 404 });

  const phone = customerPhone(call);
  const linked = call.enquiryContactId
    ? await db.contact.findFirst({ where: { id: call.enquiryContactId, organizationId: auth!.organizationId }, include: enquiryInclude })
    : null;
  const matched = linked || (phone ? await findMatchingContact(auth!.organizationId, phone, null) : null);
  const visible = matched ? await db.contact.findFirst({ where: { id: matched.id, ...contactScope(auth!) }, select: { id: true } }) : null;
  const contact = matched && visible ? matched : null;

  // A lead created from this call may already hold the customer's name and email.
  const lead = contact ? null : await db.lead.findFirst({ where: { organizationId: auth!.organizationId, callId: call.id }, orderBy: { createdAt: 'desc' }, select: { customerEmail: true, metadata: true } });
  const leadMeta = (lead?.metadata as Record<string, unknown> | null) || {};

  const assignedToId = contact ? contact.assignedToId : attendedBy(call);
  return NextResponse.json({
    api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
    call: { id: call.id, direction: call.direction, status: call.status, startedAt: call.startedAt, enquiryContactId: call.enquiryContactId },
    contact,
    contactBlocked: !!matched && !visible,
    defaults: {
      name: contact?.name ?? (typeof leadMeta.customerName === 'string' ? leadMeta.customerName : ''),
      phone: contact?.phone ?? phone,
      email: contact?.email ?? lead?.customerEmail ?? '',
      assignedToId: assignedToId ?? null,
      company: contact?.company ?? '',
      notes: contact?.notes ?? '',
      preferredTravelMonth: contact?.preferredTravelMonth ?? '',
      tourType: contact?.tourType ?? '',
      numberOfChildren: contact?.numberOfChildren ?? null,
      specialRequirements: contact?.specialRequirements ?? '',
      city: contact?.city ?? '',
      enquiryStatus: contact?.enquiryStatus ?? 'new_inquiry',
      enquiryTag: contact?.enquiryTag ?? 'warm',
      tags: contact?.tags ?? [],
    },
  });
}

// POST /api/v1/calls/:id/enquiry - convert a call into an enquiry (idempotent, safe under concurrency)
export async function POST(req: NextRequest, context: Context) {
  const { auth, errorResponse } = await authenticateRequest(req, 'operator');
  if (errorResponse) return errorResponse;
  const { id } = await context.params;

  const body = await req.json().catch(() => null);
  const initialCall = await db.call.findFirst({ where: { id, organizationId: auth!.organizationId } });
  if (!initialCall || !canAccessCall(auth!, initialCall)) return NextResponse.json({ api_id: 'not_found', error: 'Call not found' }, { status: 404 });

  const parsed = CreateEnquirySchema.safeParse({ ...(body && typeof body === 'object' ? body : {}), ...(body?.phone ? {} : customerPhone(initialCall) ? { phone: customerPhone(initialCall) } : {}) });
  if (!parsed.success) {
    return NextResponse.json({ api_id: 'val_err', error: parsed.error.issues[0]?.message || 'Invalid enquiry details' }, { status: 400 });
  }

  try {
    const result = await db.$transaction(async tx => {
      // The agency lock serializes duplicate clicks, retries and other writers for this customer.
      await lockAgency(tx, auth!.organizationId);
      const call = await tx.call.findFirst({ where: { id, organizationId: auth!.organizationId } });
      if (!call) throw new EnquiryError('Call not found', 404, 'not_found');

      const inScope = (contactId: string) => tx.contact.findFirst({ where: { id: contactId, ...contactScope(auth!) }, include: enquiryInclude });

      // Already converted: return the existing enquiry untouched.
      if (call.enquiryContactId) {
        const existing = await inScope(call.enquiryContactId);
        if (!existing) throw new EnquiryError('This call is already linked to an enquiry owned by another team member', 403, 'forbidden');
        return { contact: existing, created: false };
      }

      // The same customer may already exist: link it, but never take over its owner.
      const phone = parsed.data.phone;
      const byPhone = phone ? await tx.contact.findUnique({ where: { organizationId_phone: { organizationId: auth!.organizationId, phone } }, select: { id: true } }) : null;
      let match = byPhone ? { id: byPhone.id } : null;
      if (!match && parsed.data.email) {
        const byEmail = await tx.contact.findMany({ where: { organizationId: auth!.organizationId, email: { equals: parsed.data.email, mode: 'insensitive' } }, select: { id: true }, take: 2 });
        if (byEmail.length === 1) match = byEmail[0];
      }
      if (match) {
        const existing = await inScope(match.id);
        if (!existing) throw new EnquiryError('This customer is already an enquiry assigned to another team member', 403, 'forbidden');
        await tx.call.update({ where: { id: call.id }, data: { enquiryContactId: existing.id } });
        await tx.auditLog.create({ data: { organizationId: auth!.organizationId, actorUserId: auth!.userId, action: 'call.link_enquiry', targetType: 'Call', targetId: call.id, metadata: { contactId: existing.id } } });
        return { contact: existing, created: false };
      }

      const assignedToId = await resolveNewOwner(tx, auth!, parsed.data.assignedToId);
      const contact = await createEnquiryContact(tx, auth!.organizationId, parsed.data, assignedToId);
      await tx.call.update({ where: { id: call.id }, data: { enquiryContactId: contact.id } });
      await tx.auditLog.create({ data: { organizationId: auth!.organizationId, actorUserId: auth!.userId, action: 'call.convert_enquiry', targetType: 'Call', targetId: call.id, metadata: { contactId: contact.id, assignedToId } } });
      return { contact, created: true };
    }, { timeout: 15_000 });

    return NextResponse.json(
      { api_id: `api_${crypto.randomBytes(8).toString('hex')}`, created: result.created, converted: true, contact: result.contact },
      { status: result.created ? 201 : 200 },
    );
  } catch (error) {
    return enquiryErrorResponse(error);
  }
}
