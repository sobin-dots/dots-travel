import { db } from '@/lib/db';
import { Prisma, type Call, type Membership } from '@prisma/client';
import { decryptData } from '@/lib/crypto';
import { lockAgency } from '@/lib/lead-intake/service';

export interface AgentEndpoint { username: string; password: string; sipUri: string; authId: string; endpointId: string; }
export function decryptAgentEndpoint(value: unknown): AgentEndpoint {
  return JSON.parse(decryptData(value as { ciphertext: string; iv: string; authTag: string }));
}

export function callRoutingState(value: unknown) {
  const data = value && typeof value === 'object' && !Array.isArray(value) ? value as Prisma.JsonObject : {};
  return {
    ...data,
    routedSip: typeof data.routedSip === 'string' ? data.routedSip : null,
    responsibleUserId: typeof data.responsibleUserId === 'string' ? data.responsibleUserId : null,
    attemptedUserIds: Array.isArray(data.attemptedUserIds) ? data.attemptedUserIds.filter((id): id is string => typeof id === 'string') : [],
    dialAttempt: typeof data.dialAttempt === 'number' ? data.dialAttempt : 0,
  };
}

export function dialAttemptUrl(url: string, attempt: number) {
  const result = new URL(url);
  result.searchParams.set('attempt', String(attempt));
  return result.toString();
}

function availableAgentWhere(organizationId: string): Prisma.MembershipWhereInput {
  return { organizationId, availableForLeads: true, voiceBusy: false,
    voiceEndpoint: { not: Prisma.DbNull }, voicePresenceAt: { gte: new Date(Date.now() - 60_000) },
    user: { status: 'active' }, role: { in: ['owner', 'admin', 'operator', 'sales'] } };
}

async function responsibleSalesperson(tx: Prisma.TransactionClient, organizationId: string, phone: string) {
  // Compare the full international number, including country code. Do not match suffixes
  // across countries. Older manually entered contacts may contain spaces or omit '+'.
  const digits = phone.trim().replace(/[\s().+-]/g, '').replace(/^00/, '');
  if (!/^[1-9]\d{6,14}$/.test(digits)) return null;
  const contacts = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM contacts WHERE "organizationId" = ${organizationId}
      AND regexp_replace(regexp_replace(phone, '[^0-9]', '', 'g'), '^00', '') = ${digits}`;
  if (!contacts.length) return null;
  // Assignments belong to enquiries. Keep the most recently assigned enquiry's
  // salesperson for returning callers, including completed bookings.
  const lead = await tx.lead.findFirst({ where: { organizationId, contactId: { in: contacts.map(c => c.id) }, assignedToId: { not: null } },
    orderBy: [{ assignedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }, { id: 'asc' }], select: { assignedToId: true } });
  return lead?.assignedToId || null;
}

async function reserveAgent(tx: Prisma.TransactionClient, organizationId: string, agent: Membership | null) {
  if (!agent?.voiceEndpoint) return null;
  const sipUri = decryptAgentEndpoint(agent.voiceEndpoint).sipUri;
  const latest = await tx.membership.findFirst({ where: { organizationId, lastCallAssignedAt: { not: null } }, orderBy: { lastCallAssignedAt: 'desc' }, select: { lastCallAssignedAt: true } });
  await tx.membership.update({ where: { id: agent.id }, data: { voiceBusy: true, lastCallAssignedAt: new Date(Math.max(Date.now(), (latest?.lastCallAssignedAt?.getTime() || 0) + 1)) } });
  return sipUri;
}

export async function releaseCallAgentInTransaction(tx: Prisma.TransactionClient, call: Pick<Call, 'organizationId' | 'assignedToId' | 'id'>) {
  if (!call.assignedToId) return;
  const another = await tx.call.count({ where: { organizationId: call.organizationId, assignedToId: call.assignedToId, id: { not: call.id }, endedAt: null, status: { in: ['ringing', 'in-progress'] } } });
  if (!another) await tx.membership.updateMany({ where: { organizationId: call.organizationId, userId: call.assignedToId }, data: { voiceBusy: false } });
}

export async function reserveInboundCall(input: { organizationId: string; callUuid: string; from: string; to: string; phoneNumberId?: string; forwarded?: boolean }) {
  return db.$transaction(async tx => {
    await lockAgency(tx, input.organizationId);
    const existing = await tx.call.findUnique({ where: { plivoCallUuid: input.callUuid } });
    if (existing) {
      if (existing.organizationId !== input.organizationId) throw new Error('Call organization mismatch');
      return { call: existing, sipUri: callRoutingState(existing.requestedParams).routedSip };
    }
    const responsibleUserId = input.forwarded ? null : await responsibleSalesperson(tx, input.organizationId, input.from);
    const eligible = availableAgentWhere(input.organizationId);
    // Opting out of NEW lead rotation does not remove responsibility for existing contacts.
    const owner = responsibleUserId ? await tx.membership.findFirst({ where: { ...eligible, userId: responsibleUserId } }) : null;
    const agent = input.forwarded ? null : owner || await tx.membership.findFirst({ where: { ...eligible,
      receivesLeads: true, ...(responsibleUserId ? { userId: { not: responsibleUserId } } : {}) },
      orderBy: [{ lastCallAssignedAt: { sort: 'asc', nulls: 'first' } }, { id: 'asc' }],
    });
    const sipUri = await reserveAgent(tx, input.organizationId, agent);
    const attemptedUserIds = [...new Set([responsibleUserId, agent?.userId].filter((id): id is string => !!id))];
    const call = await tx.call.create({ data: { organizationId: input.organizationId, phoneNumberId: input.phoneNumberId, plivoCallUuid: input.callUuid,
      from: input.from, to: input.to, direction: 'inbound', assignedToId: sipUri ? agent?.userId : null, status: sipUri || input.forwarded ? 'ringing' : 'missed',
      agentOutcome: sipUri || input.forwarded ? 'ringing' : 'missed', requestedParams: { routedSip: sipUri, responsibleUserId, attemptedUserIds, dialAttempt: 0,
        route: input.forwarded ? 'forwarded' : owner ? 'assigned_contact' : sipUri ? 'round_robin' : 'no_available_agent' }, recordingEnabled: true, transcriptionEnabled: true } });
    return { call, sipUri };
  }, { timeout: 15_000 });
}

// The organization lock serializes retries with new calls and presence updates.
// A retry of an older Dial action returns the current reservation without advancing it.
export async function retryInboundCall(input: { organizationId: string; callUuid: string; attempt: number; outcome: 'missed' | 'declined'; callerEnded?: boolean }) {
  return db.$transaction(async tx => {
    await lockAgency(tx, input.organizationId);
    const call = await tx.call.findUnique({ where: { plivoCallUuid: input.callUuid } });
    if (!call || call.organizationId !== input.organizationId) return null;
    const state = callRoutingState(call.requestedParams);
    if (call.endedAt || call.agentAnsweredAt || input.attempt > state.dialAttempt) return { call, sipUri: null, hangup: true };
    if (input.attempt < state.dialAttempt) return { call, sipUri: state.routedSip, hangup: false };
    if (input.callerEnded) {
      await tx.call.update({ where: { id: call.id }, data: { status: 'missed', agentOutcome: input.outcome, endedAt: new Date() } });
      await releaseCallAgentInTransaction(tx, call);
      return { call, sipUri: null, hangup: true };
    }
    if (!state.routedSip && call.agentOutcome !== 'ringing') return { call, sipUri: null, hangup: false };
    const attempted = [...new Set([...state.attemptedUserIds, ...(call.assignedToId ? [call.assignedToId] : [])])];
    // Preserve unassigned-contact and explicit-forwarding behavior. Only known
    // contact ownership adds the salesperson-first, then round-robin retry chain.
    const next = state.responsibleUserId ? await tx.membership.findFirst({ where: { ...availableAgentWhere(input.organizationId), receivesLeads: true, userId: { notIn: attempted } },
      orderBy: [{ lastCallAssignedAt: { sort: 'asc', nulls: 'first' } }, { id: 'asc' }] }) : null;
    const sipUri = await reserveAgent(tx, input.organizationId, next);
    const updated = await tx.call.update({ where: { id: call.id }, data: {
      ...(sipUri ? { assignedToId: next!.userId } : {}),
      status: sipUri ? 'ringing' : 'missed', agentOutcome: sipUri ? 'ringing' : input.outcome,
      requestedParams: { ...state, routedSip: sipUri, dialAttempt: state.dialAttempt + 1,
        attemptedUserIds: [...attempted, ...(next ? [next.userId] : [])], route: sipUri ? 'round_robin' : 'no_available_agent' },
    } });
    await releaseCallAgentInTransaction(tx, call);
    return { call: updated, sipUri, hangup: false };
  }, { timeout: 15_000 });
}

export async function recordInboundAnswer(input: { organizationId: string; callUuid: string; attempt: number; completed?: boolean; durationSeconds?: number }) {
  return db.$transaction(async tx => {
    await lockAgency(tx, input.organizationId);
    const call = await tx.call.findUnique({ where: { plivoCallUuid: input.callUuid } });
    if (!call || call.organizationId !== input.organizationId || input.attempt !== callRoutingState(call.requestedParams).dialAttempt) return;
    const endedAt = call.endedAt || (input.completed ? new Date() : null);
    await tx.call.update({ where: { id: call.id }, data: { status: endedAt ? 'completed' : 'in-progress',
      agentOutcome: 'answered', agentAnsweredAt: call.agentAnsweredAt || new Date(), answeredAt: call.answeredAt || new Date(),
      endedAt, ...(input.durationSeconds !== undefined ? { durationSeconds: input.durationSeconds } : {}) } });
    // Also release calls already marked completed by a status callback.
    if (endedAt) await releaseCallAgentInTransaction(tx, call);
  });
}

export function inboundFinalStatus(call: { direction: string; agentOutcome?: string | null; agentAnsweredAt?: Date | null; status: string }) {
  if (call.direction !== 'inbound') return ['busy', 'failed', 'no-answer', 'timeout', 'canceled'].includes(call.status) ? call.status : 'completed';
  if (!call.agentOutcome) return 'completed';
  return call.agentAnsweredAt || call.agentOutcome === 'answered' ? 'completed' : 'missed';
}
export async function releaseCallAgent(call: { organizationId: string; assignedToId: string | null; id: string }) {
  if (!call.assignedToId) return;
  await db.$transaction(async tx => { await lockAgency(tx, call.organizationId); await releaseCallAgentInTransaction(tx, call); });
}
