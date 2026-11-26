import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import type { AuthContext } from '@/lib/api-auth';
import { managesLeads } from '@/lib/lead-access';
import { lockAgency, pickAssignee } from '@/lib/lead-intake/service';
import { ASSIGNABLE_ROLES, dedupeTags, type CreateEnquiryInput } from '@/lib/enquiry-fields';

export class EnquiryError extends Error {
  constructor(message: string, public status: number, public code: string) {
    super(message);
  }
}

export const enquiryInclude = { assignedTo: { select: { id: true, name: true } } } satisfies Prisma.ContactInclude;

export function enquiryErrorResponse(error: unknown) {
  if (error instanceof EnquiryError) return NextResponse.json({ api_id: error.code, error: error.message }, { status: error.status });
  if ((error as { code?: string })?.code === 'P2002') return NextResponse.json({ api_id: 'conflict', error: 'Another enquiry already uses this phone number' }, { status: 409 });
  console.error('Enquiry request failed:', error);
  return NextResponse.json({ api_id: 'server_err', error: 'Could not complete the enquiry request' }, { status: 500 });
}

/** Only active staff of this agency, excluding viewers, may own an enquiry. */
export async function isAssignable(tx: Prisma.TransactionClient, organizationId: string, userId: string) {
  const member = await tx.membership.findFirst({
    where: { organizationId, userId, role: { in: [...ASSIGNABLE_ROLES] }, user: { status: 'active' } },
    select: { id: true },
  });
  return !!member;
}

export async function assertAssignable(tx: Prisma.TransactionClient, organizationId: string, userId: string) {
  if (!(await isAssignable(tx, organizationId, userId))) {
    throw new EnquiryError('Choose an active, non-viewer staff member of this agency to assign the enquiry to', 400, 'invalid_assignee');
  }
}

/**
 * Decide who owns a new enquiry.
 * - an explicit staff member (validated);
 * - admins that leave it blank get the next available salesperson (round robin);
 * - an explicit null from an admin leaves it unassigned;
 * - other staff default to themselves.
 */
export async function resolveNewOwner(tx: Prisma.TransactionClient, auth: AuthContext, requested: string | null | undefined) {
  if (requested) {
    await assertAssignable(tx, auth.organizationId, requested);
    return requested;
  }
  if (managesLeads(auth)) return requested === null ? null : pickAssignee(tx, auth.organizationId);
  await assertAssignable(tx, auth.organizationId, auth.userId);
  return auth.userId;
}

/** Create an enquiry contact and corresponding CRM lead. Call inside a transaction that already holds the agency lock. */
export async function createEnquiryContact(tx: Prisma.TransactionClient, organizationId: string, input: CreateEnquiryInput, assignedToId: string | null) {
  if (input.phone) {
    const existing = await tx.contact.findUnique({ where: { organizationId_phone: { organizationId, phone: input.phone } } });
    if (existing) throw new EnquiryError(`An enquiry with phone number ${input.phone} already exists (${existing.name})`, 409, 'conflict');
  }
  const now = new Date();
  const contact = await tx.contact.create({
    data: {
      organizationId,
      name: input.name,
      phone: input.phone ?? null,
      email: input.email ?? null,
      company: input.company ?? null,
      notes: input.notes ?? null,
      destination: input.destination ?? null,
      preferredTravelMonth: input.preferredTravelMonth ?? null,
      tourType: input.tourType ?? null,
      numberOfAdults: input.numberOfAdults ?? null,
      numberOfChildren: input.numberOfChildren ?? null,
      specialRequirements: input.specialRequirements ?? null,
      city: input.city ?? null,
      enquiryStatus: input.enquiryStatus,
      enquiryTag: input.enquiryTag && ['hot', 'warm', 'cold'].includes(input.enquiryTag) ? input.enquiryTag : 'warm',
      tags: dedupeTags(input.tags),
      assignedToId,
      assignedAt: assignedToId ? now : null,
    },
    include: enquiryInclude,
  });

  const organization = await tx.organization.findUnique({
    where: { id: organizationId },
    select: { firstContactMinutes: true },
  });
  const firstContactMinutes = organization?.firstContactMinutes ?? 30;

  const tags = dedupeTags(input.tags);
  const sourceTag = tags.find(t => t.toLowerCase().startsWith('source:'));
  const sourceName = sourceTag
    ? sourceTag.slice(7).trim().split(/[_\s-]+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
    : 'Direct';

  await tx.lead.create({
    data: {
      organizationId,
      contactId: contact.id,
      title: `${contact.name} — ${contact.city || contact.tourType || 'Travel enquiry'}`,
      destination: contact.city || null,
      source: sourceName,
      formName: sourceName,
      stage: contact.enquiryStatus || 'new_inquiry',
      temperature: contact.enquiryTag || 'warm',
      tags,
      assignedToId,
      assignedAt: assignedToId ? now : null,
      customerEmail: contact.email || null,
      itinerary: '',
      status: 'draft',
      createdAt: now,
      headcountChildren: input.numberOfChildren ?? 0,
      specialRequests: input.specialRequirements || null,
      firstContactDueAt: new Date(now.getTime() + firstContactMinutes * 60_000),
      metadata: {
        customerName: contact.name,
        customerPhone: contact.phone || null,
        enquiryNotes: contact.notes || null,
        contactTravelPreferences: {
          preferredTravelMonth: contact.preferredTravelMonth ?? null,
          tourType: contact.tourType ?? null,
          numberOfChildren: contact.numberOfChildren ?? null,
          specialRequirements: contact.specialRequirements ?? null,
          city: contact.city ?? null,
        },
      },
    },
  });

  return contact;
}

export { lockAgency };
