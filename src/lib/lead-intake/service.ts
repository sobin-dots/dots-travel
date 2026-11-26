import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { db } from '@/lib/db';
import { decryptData } from '@/lib/crypto';
import { enquirySchema, normalizeGoogle, normalizeMeta, type Enquiry } from './normalize';

export type ConnectionSecrets = { webhookSecret: string; appSecret?: string; pageAccessToken?: string; pageId?: string; graphVersion?: string };
export function connectionSecrets(credentials: unknown): ConnectionSecrets {
  return JSON.parse(decryptData(credentials as { ciphertext: string; iv: string; authTag: string }));
}

export async function lockAgency(tx: Prisma.TransactionClient, organizationId: string) {
  await tx.$queryRaw`SELECT id FROM organizations WHERE id = ${organizationId} FOR NO KEY UPDATE`;
}

export async function pickAssignee(tx: Prisma.TransactionClient, organizationId: string) {
  const member = await tx.membership.findFirst({
    where: { organizationId, receivesLeads: true, availableForLeads: true, role: { in: ['owner', 'admin', 'operator', 'sales'] }, user: { status: 'active' } },
    orderBy: [{ lastLeadAssignedAt: { sort: 'asc', nulls: 'first' } }, { id: 'asc' }],
  });
  if (!member) return null;
  const latest = await tx.membership.findFirst({ where: { organizationId, lastLeadAssignedAt: { not: null } }, orderBy: { lastLeadAssignedAt: 'desc' }, select: { lastLeadAssignedAt: true } });
  const assignedAt = new Date(Math.max(Date.now(), (latest?.lastLeadAssignedAt?.getTime() || 0) + 1));
  await tx.membership.update({ where: { id: member.id }, data: { lastLeadAssignedAt: assignedAt } });
  return member.userId;
}

export async function createEnquiry(tx: Prisma.TransactionClient, organizationId: string, source: string, input: Enquiry, receivedAt = new Date()) {
  // The organization lock serializes matching and assignment across all app instances.
  await lockAgency(tx, organizationId);
  const phoneMatch = input.phone ? await tx.contact.findUnique({ where: { organizationId_phone: { organizationId, phone: input.phone } } }) : null;
  const emailMatches = input.email ? await tx.contact.findMany({ where: { organizationId, email: { equals: input.email, mode: 'insensitive' } }, take: 2 }) : [];
  const ambiguous = emailMatches.length > 1 || (!!phoneMatch && emailMatches.some(c => c.id !== phoneMatch.id));
  let contact = phoneMatch || (!ambiguous ? emailMatches[0] : null);
  const repeat = contact ? await tx.lead.count({ where: { organizationId, contactId: contact.id } }) > 0 : false;
  const { destination, numberOfAdults, preferredTravelMonth, tourType, numberOfChildren, specialRequirements, city } = input;
  // A returning customer stays with the team member who already owns the enquiry, even if a
  // different salesperson is next in rotation. Only an owner who can no longer be assigned
  // (inactive, removed or now a viewer) is replaced.
  let ownerId = contact?.assignedToId ?? null;
  if (ownerId && !await tx.membership.findFirst({ where: { organizationId, userId: ownerId, role: { in: ['owner', 'admin', 'operator', 'sales'] }, user: { status: 'active' } }, select: { id: true } })) ownerId = null;
  const assignedToId = ownerId || await pickAssignee(tx, organizationId);
  if (!contact && !ambiguous) {
    contact = await tx.contact.create({ data: { organizationId, name: input.name, phone: input.phone, email: input.email,
      destination, numberOfAdults,
      preferredTravelMonth, tourType, numberOfChildren, specialRequirements, city,
      enquiryTag: input.temperature, tags: [...new Set(input.tags)], assignedToId, assignedAt: assignedToId ? new Date() : null } });
  } else if (contact && contact.assignedToId !== assignedToId && assignedToId) {
    contact = await tx.contact.update({ where: { id: contact.id }, data: { assignedToId, assignedAt: new Date() } });
  }
  const organization = await tx.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { firstContactMinutes: true } });
  const { submissionId: _submissionId, name, phone, email, notes, title, answers,
    destination: _dest, numberOfAdults: _adults,
    preferredTravelMonth: _month, tourType: _tour, numberOfChildren: _children, specialRequirements: _requirements, city: _city, ...fields } = input;
  return tx.lead.create({ data: {
    ...fields, organizationId, source, title: title || `${name} — ${destination || 'Travel enquiry'}`,
    destination: destination || undefined,
    headcountAdults: numberOfAdults ?? (fields as any).headcountAdults ?? 2,
    contactId: contact?.id, customerEmail: email || contact?.email, itinerary: '', status: 'draft', createdAt: receivedAt,
    headcountChildren: numberOfChildren ?? 0,
    specialRequests: specialRequirements,
    assignedToId, assignedAt: assignedToId ? new Date() : null,
    firstContactDueAt: new Date(receivedAt.getTime() + organization.firstContactMinutes * 60_000),
    duplicateContactFlag: ambiguous || repeat,
    metadata: { customerName: name, customerPhone: phone || null, enquiryNotes: notes || null, formAnswers: answers || {}, contactMatchNeedsReview: ambiguous,
      contactTravelPreferences: { destination: destination ?? null, numberOfAdults: numberOfAdults ?? null, preferredTravelMonth: preferredTravelMonth ?? null, tourType: tourType ?? null, numberOfChildren: numberOfChildren ?? null, specialRequirements: specialRequirements ?? null, city: city ?? null } },
  } });
}

async function metaGet(id: string, fields: string, secrets: ConnectionSecrets) {
  if (!secrets.pageAccessToken || !secrets.graphVersion) throw new Error('Configure the Meta page token and Graph API version');
  const url = new URL(`https://graph.facebook.com/${secrets.graphVersion}/${encodeURIComponent(id)}`);
  url.searchParams.set('fields', fields);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${secrets.pageAccessToken}` }, signal: AbortSignal.timeout(15_000), cache: 'no-store' });
  if (!res.ok) throw new Error(`Meta retrieval failed (HTTP ${res.status}); check page access and lead retrieval permissions`);
  return res.json();
}

export async function processSubmission(id: string) {
  const now = new Date(); const stale = new Date(now.getTime() - 5 * 60_000); const claimToken = randomUUID();
  const claim = await db.leadSubmission.updateMany({ where: { id, OR: [
    { status: { in: ['pending', 'failed'] }, nextAttemptAt: { lte: now }, attempts: { lt: 8 } },
    { status: 'processing', claimedAt: { lt: stale } },
  ] }, data: { status: 'processing', claimedAt: now, claimToken, attempts: { increment: 1 } } });
  if (!claim.count) return;
  const submission = await db.leadSubmission.findUniqueOrThrow({ where: { id }, include: { connection: true } });
  try {
    if (!submission.connection.enabled) throw new Error('Connection is paused');
    const payload = submission.payload as Record<string, unknown>;
    const names = submission.connection.formNames as Record<string, string>;
    let enquiry: Enquiry;
    if (submission.connection.provider === 'google_ads' && payload.is_test === true) {
      await db.leadSubmission.updateMany({ where: { id, claimToken }, data: { status: 'ignored', error: null } });
      return;
    }
    if (submission.connection.provider === 'meta') {
      const secrets = connectionSecrets(submission.connection.credentials);
      const lead = await metaGet(submission.externalId, 'id,form_id,field_data,ad_id,ad_name,campaign_id,campaign_name,adset_id', secrets);
      const formId = String(lead.form_id);
      const name = names[formId] || (await metaGet(formId, 'name', secrets)).name;
      enquiry = normalizeMeta(lead, name);
    } else if (submission.connection.provider === 'google_ads') enquiry = normalizeGoogle(payload, names);
    else enquiry = enquirySchema.parse(payload);
    await db.$transaction(async tx => {
      await lockAgency(tx, submission.organizationId);
      // A recovered worker must never commit after its lease has been replaced.
      const owned = await tx.leadSubmission.updateMany({ where: { id, status: 'processing', claimToken }, data: { status: 'processed', error: null } });
      if (!owned.count) return;
      const lead = await createEnquiry(tx, submission.organizationId, submission.connection.provider, enquiry, submission.createdAt);
      await tx.leadSubmission.update({ where: { id }, data: { leadId: lead.id } });
      await tx.auditLog.create({ data: { organizationId: submission.organizationId, actorType: 'webhook', action: 'lead.import', targetType: 'Lead', targetId: lead.id, metadata: { submissionId: id, assignedToId: lead.assignedToId } } });
    }, { timeout: 15_000 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Import failed';
    await db.leadSubmission.updateMany({ where: { id, claimToken }, data: {
      status: 'failed', error: message.slice(0, 1000), nextAttemptAt: new Date(Date.now() + Math.min(60, 2 ** submission.attempts) * 60_000),
    } });
  }
}

export async function receiveSubmission(connection: { id: string; organizationId: string }, externalId: string, payload: Prisma.InputJsonValue) {
  return db.$transaction(async tx => {
    // Lock the connection before Prisma's read/create upsert. Empty updates can
    // otherwise race on the unique key rather than using a native SQL upsert.
    await tx.leadConnection.update({ where: { id: connection.id }, data: { lastReceivedAt: new Date() } });
    const row = await tx.leadSubmission.upsert({ where: { connectionId_externalId: { connectionId: connection.id, externalId } },
      create: { organizationId: connection.organizationId, connectionId: connection.id, externalId, payload }, update: {} });
    return row;
  });
}
