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

/** Create an enquiry contact. Call inside a transaction that already holds the agency lock. */
export async function createEnquiryContact(tx: Prisma.TransactionClient, organizationId: string, input: CreateEnquiryInput, assignedToId: string | null) {
  if (input.phone) {
    const existing = await tx.contact.findUnique({ where: { organizationId_phone: { organizationId, phone: input.phone } } });
    if (existing) throw new EnquiryError(`An enquiry with phone number ${input.phone} already exists (${existing.name})`, 409, 'conflict');
  }
  return tx.contact.create({
    data: {
      organizationId,
      name: input.name,
      phone: input.phone ?? null,
      email: input.email ?? null,
      company: input.company ?? null,
      notes: input.notes ?? null,
      preferredTravelMonth: input.preferredTravelMonth ?? null,
      tourType: input.tourType ?? null,
      numberOfChildren: input.numberOfChildren ?? null,
      specialRequirements: input.specialRequirements ?? null,
      city: input.city ?? null,
      enquiryStatus: input.enquiryStatus,
      enquiryTag: input.enquiryTag,
      tags: dedupeTags(input.tags),
      assignedToId,
      assignedAt: assignedToId ? new Date() : null,
    },
    include: enquiryInclude,
  });
}

export { lockAgency };
