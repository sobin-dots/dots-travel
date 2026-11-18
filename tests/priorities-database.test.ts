import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { encryptData } from '@/lib/crypto';
import { signAccessToken } from '@/lib/auth-tokens';
import { reserveInboundCall, releaseCallAgent, inboundFinalStatus, callRoutingState, retryInboundCall, recordInboundAnswer } from '@/lib/telephony/agent-routing';
import { computeV3Signature } from '@/lib/telephony/webhook-validator';
import { POST as generate, GET as listOptions } from '@/app/api/v1/leads/[id]/options/route';
import { PATCH as changeOption } from '@/app/api/v1/leads/[id]/options/[optionId]/route';
import { GET as download } from '@/app/api/v1/leads/[id]/export/route';
import { POST as hangup } from '@/app/api/v1/webhooks/voice/hangup/route';
import { POST as dial } from '@/app/api/v1/webhooks/voice/dial/route';
import { POST as ringStatus } from '@/app/api/v1/webhooks/voice/status/route';
import { POST as fallback } from '@/app/api/v1/webhooks/voice/fallback/route';
import { POST as answer } from '@/app/api/v1/webhooks/voice/answer/route';
import { GET as endpoint } from '@/app/api/v1/telephony/endpoint/route';
import { POST as presence } from '@/app/api/v1/telephony/presence/route';
import { GET as organizationSettings } from '@/app/api/v1/settings/route';
import { GET as intakeSettings } from '@/app/api/v1/lead-intake/route';

const providerMock = vi.hoisted(() => ({ createEndpoint: vi.fn(), listEndpoints: vi.fn(), updateEndpoint: vi.fn() }));
vi.mock('plivo', async original => {
  const actual = await original<typeof import('plivo')>();
  return { ...actual, default: actual, Client: class { applications = { list: async () => [{ appId: 'test-app', defaultEndpointApp: true }] }; endpoints = { create: providerMock.createEndpoint, list: providerMock.listEndpoints, update: providerMock.updateEndpoint }; } };
});

vi.mock('@/lib/deepseek', () => ({ generateBudgetItineraryOption: vi.fn(), reviseItineraryWithDeepSeek: vi.fn() }));
import { generateBudgetItineraryOption, reviseItineraryWithDeepSeek } from '@/lib/deepseek';

const suite = process.env.LEAD_INTAKE_DATABASE_TESTS === '1' ? describe : describe.skip;
const programme = 'Morning: Explore the heritage quarter and museum at a relaxed pace. Afternoon: Visit the waterfront before returning to the hotel. Evening: Independent dining near the accommodation.';
const itinerary = `Day 1: Arrival\nLocation: Tokyo\n${programme}\nOvernight: Proposed Tokyo Hotel\nMeals: Breakfast\nTransfers: Shared transfer`;
suite('Itinerary alternatives, exports and inbound call routing', () => {
  let organizationId: string; let ownerId: string; let users: string[]; let token: string; let lead: any;
  const webhookToken = 'signed-priority-test-token';
  const request = (path: string, body?: object, method = 'POST', auth = token) => new NextRequest(`http://localhost/api/v1/${path}`, { method: body ? method : 'GET', headers: { Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const signed = (route: string, body: Record<string, string>, attempt?: number) => {
    const url = `http://localhost/api/v1/webhooks/voice/${route}?orgId=${organizationId}${attempt === undefined ? '' : `&attempt=${attempt}`}`; const nonce = randomUUID();
    return new NextRequest(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Plivo-Signature-V3-Nonce': nonce, 'X-Plivo-Signature-V3': computeV3Signature('POST', url, nonce, webhookToken, body) }, body: new URLSearchParams(body) });
  };
  const context = () => ({ params: Promise.resolve({ id: lead.id }) });
  const reserve = (callUuid = randomUUID()) => reserveInboundCall({ organizationId, callUuid, from: '+919876543210', to: '+911234567890' });
  const assignContact = async (userId = users[1], phone = '+919876543210') => {
    const contact = await db.contact.create({ data: { organizationId, name: 'Returning caller', phone } });
    await db.lead.update({ where: { id: lead.id }, data: { contactId: contact.id, assignedToId: userId, assignedAt: new Date(), stage: 'confirmed' } });
    return contact;
  };
  beforeEach(async () => {
    vi.stubEnv('PLIVO_WEBHOOK_AUTH_TOKEN', webhookToken);
    const org = await db.organization.create({ data: { name: 'Priority test agency', slug: `priority-${randomUUID()}` } }); organizationId = org.id;
    users = [];
    for (const role of ['owner', 'sales', 'sales']) {
      const user = await db.user.create({ data: { name: role, email: `${randomUUID()}@example.test`, passwordHash: 'unused' } }); users.push(user.id);
      await db.membership.create({ data: { organizationId, userId: user.id, role, receivesLeads: role === 'sales', voicePresenceAt: new Date(), voiceEndpoint: role === 'sales' ? { ...encryptData(JSON.stringify({ username: user.id, sipUri: `sip:${user.id}@phone.plivo.com`, password: 'test-password', endpointId: user.id, authId: 'test' })) } : undefined } });
    }
    ownerId = users[0]; token = await signAccessToken({ organizationId, userId: ownerId, email: 'owner@example.test', role: 'owner' });
    lead = await db.lead.create({ data: { organizationId, title: 'Tokyo trip', destination: 'Tokyo', durationDays: 1, itinerary, status: 'draft', targetBudget: 50000, departureDate: new Date('2027-04-10'), metadata: { currency: 'INR' }, assignedToId: users[1] } });
    vi.mocked(generateBudgetItineraryOption).mockImplementation(async input => `${itinerary}\nNotes: Alternative budget ${input.budget}`);
    vi.mocked(reviseItineraryWithDeepSeek).mockResolvedValue(`${itinerary}\nNotes: RevisedAlternative`);
    providerMock.listEndpoints.mockResolvedValue([]);
    providerMock.createEndpoint.mockImplementation(async (username: string) => ({ username: `${username}123`, endpointId: randomUUID() }));
  });
  afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllEnvs(); await db.organization.delete({ where: { id: organizationId } }); await db.user.deleteMany({ where: { id: { in: users } } }); });
  afterAll(async () => { await db.$disconnect(); });

  it('creates budget alternatives without replacing the original and allows a reviewed option to become the main itinerary', async () => {
    const res = await generate(request(`leads/${lead.id}/options`, { expectedUpdatedAt: lead.updatedAt.toISOString(), currency: 'INR', options: [{ label: 'Standard', budget: 50000 }, { label: 'Premium', budget: 90000 }] }), context());
    expect(res.status).toBe(201); const data = await res.json();
    expect(await db.lead.findUnique({ where: { id: lead.id } })).toMatchObject({ itinerary });
    const option = data.options[1];
    expect((await changeOption(request(`leads/${lead.id}/options/${option.id}`, { action: 'apply', expectedUpdatedAt: option.updatedAt, expectedLeadUpdatedAt: data.lead.updatedAt }, 'PATCH'), { params: Promise.resolve({ id: lead.id, optionId: option.id }) })).status).toBe(200);
    const current = await db.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(Number(current.targetBudget)).toBe(90000); expect(current.itinerary).toContain('Alternative budget 90000');
    expect(await db.itineraryOption.findFirst({ where: { leadId: lead.id, label: 'Previous main itinerary' } })).toMatchObject({ itinerary });
  });
  it('saves no alternatives if one AI request fails', async () => {
    vi.mocked(generateBudgetItineraryOption).mockRejectedValueOnce(new Error('Provider unavailable'));
    const res = await generate(request(`leads/${lead.id}/options`, { expectedUpdatedAt: lead.updatedAt.toISOString(), currency: 'INR', options: [{ label: 'Standard', budget: 50000 }, { label: 'Premium', budget: 90000 }] }), context());
    expect(res.status).toBe(502); expect(await db.itineraryOption.count({ where: { leadId: lead.id } })).toBe(0);
    expect((await db.lead.findUniqueOrThrow({ where: { id: lead.id } })).itinerary).toBe(itinerary);
  });
  it('edits and AI-revises saved alternatives with concurrency protection', async () => {
    const option = await db.itineraryOption.create({ data: { organizationId, leadId: lead.id, label: 'Premium', budget: 90000, itinerary, destination: 'Tokyo', durationDays: 1, departureDate: lead.departureDate } });
    const path = `leads/${lead.id}/options/${option.id}`; const ctx = { params: Promise.resolve({ id: lead.id, optionId: option.id }) };
    const revised = await changeOption(request(path, { action: 'revise', expectedUpdatedAt: option.updatedAt.toISOString(), notes: 'Change the programme' }, 'PATCH'), ctx);
    expect(revised.status).toBe(200);
    expect((await db.itineraryOption.findUniqueOrThrow({ where: { id: option.id } })).itinerary).toContain('RevisedAlternative');
    expect((await changeOption(request(path, { action: 'edit', expectedUpdatedAt: option.updatedAt.toISOString(), itinerary: `${itinerary}\nNotes: stale` }, 'PATCH'), ctx)).status).toBe(409);
  });
  it('denies other salespeople access to options and Word exports', async () => {
    const other = await signAccessToken({ organizationId, userId: users[2], email: 'sales@example.test', role: 'sales' });
    expect((await listOptions(request(`leads/${lead.id}/options`, undefined, 'GET', other), context())).status).toBe(404);
    expect((await download(request(`leads/${lead.id}/export?format=docx`, undefined, 'GET', other), context())).status).toBe(404);
    const word = await download(request(`leads/${lead.id}/export?format=docx`), context());
    expect(word.status).toBe(200); expect(word.headers.get('Content-Type')).toContain('wordprocessingml');
    expect(Buffer.from(await word.arrayBuffer()).subarray(0, 2).toString()).toBe('PK');
  });
  it('preserves the owner role in organization settings used by background console refreshes', async () => {
    const response = await organizationSettings(request('settings'));
    expect(response.status).toBe(200); expect((await response.json()).organization.role).toBe('owner');
  });
  it('assigns simultaneous inbound calls to different available browser agents and deduplicates replay', async () => {
    const uuid = randomUUID(); const [first, second] = await Promise.all([reserve(uuid), reserve()]);
    expect(first.call.assignedToId).not.toBe(second.call.assignedToId); expect(first.sipUri).toContain(first.call.assignedToId!);
    expect((await reserve()).call.status).toBe('missed');
    expect((await reserve(uuid)).call.id).toBe(first.call.id);
  });
  it('skips offline and unavailable staff', async () => {
    await db.membership.updateMany({ where: { organizationId, userId: users[1] }, data: { voicePresenceAt: new Date(Date.now() - 120_000) } });
    await db.membership.updateMany({ where: { organizationId, userId: users[2] }, data: { availableForLeads: false } });
    expect((await reserve()).sipUri).toBeNull();
  });
  it('provisions a separate encrypted endpoint for each user and reuses it on subsequent requests', async () => {
    const encrypted = encryptData(JSON.stringify({ authId: 'test-auth', authToken: 'test-token', appId: 'test-app' }));
    await db.tenantIntegration.create({ data: { organizationId, provider: 'plivo', category: 'telephony', credentialsEncrypted: encrypted.ciphertext, encIv: encrypted.iv, encAuthTag: encrypted.authTag } });
    await db.membership.updateMany({ where: { organizationId }, data: { voiceEndpoint: (await import('@prisma/client')).Prisma.DbNull } });
    const first = await endpoint(request('telephony/endpoint')); expect(first.status).toBe(200); const a = await first.json();
    const other = await signAccessToken({ organizationId, userId: users[1], email: 'sales@example.test', role: 'sales' });
    const second = await endpoint(request('telephony/endpoint', undefined, 'GET', other)); expect(second.status).toBe(200); const b = await second.json();
    expect(a.username).not.toBe(b.username); expect(a.password).not.toBe(b.password);
    expect(await (await endpoint(request('telephony/endpoint'))).json()).toMatchObject({ username: a.username, password: a.password });
    const member = await db.membership.findFirstOrThrow({ where: { organizationId, userId: ownerId } });
    expect(JSON.stringify(member.voiceEndpoint)).not.toContain(a.password);
  });
  it('does not clear a call reservation when a ready heartbeat races the incoming browser event', async () => {
    const { call } = await reserve();
    const callerToken = await signAccessToken({ organizationId, userId: call.assignedToId!, email: 'sales@example.test', role: 'sales' });
    expect((await presence(request('telephony/presence', { ready: true, busy: false }, 'POST', callerToken))).status).toBe(200);
    expect((await db.membership.findFirstOrThrow({ where: { organizationId, userId: call.assignedToId! } })).voiceBusy).toBe(true);
  });
  it('keeps voicemail calls missed on hangup even when the carrier reports a nonzero duration', async () => {
    const { call } = await reserve();
    expect((await hangup(signed('hangup', { CallUUID: call.plivoCallUuid, Duration: '45' })) ).status).toBe(200);
    expect(await db.call.findUnique({ where: { id: call.id } })).toMatchObject({ status: 'missed', agentOutcome: 'missed' });
    expect((await db.membership.findFirstOrThrow({ where: { organizationId, userId: call.assignedToId! } })).voiceBusy).toBe(false);
  });
  it('records provider-confirmed browser answers, preserves terminal state and recovers a late answer callback', async () => {
    const { call } = await reserve();
    await hangup(signed('hangup', { CallUUID: call.plivoCallUuid, Duration: '12' }));
    await dial(signed('dial', { DialALegUUID: call.plivoCallUuid, DialAction: 'connected', DialBLegUUID: randomUUID() }));
    await ringStatus(signed('status', { CallUUID: call.plivoCallUuid, CallStatus: 'ringing' }));
    expect(await db.call.findUnique({ where: { id: call.id } })).toMatchObject({ status: 'completed', agentOutcome: 'answered', agentAnsweredAt: expect.any(Date) });
  });
  it('classifies a rejected call as missed and does not overwrite it with provider completion', async () => {
    const { call } = await reserve();
    const response = await fallback(signed('fallback', { CallUUID: call.plivoCallUuid, DialALegUUID: call.plivoCallUuid, DialStatus: 'no-answer', DialHangupCause: 'CALL_REJECTED' }));
    expect(response.status).toBe(200); expect(await response.text()).toContain('<Record');
    await hangup(signed('hangup', { CallUUID: call.plivoCallUuid, Duration: '90' }));
    expect(await db.call.findUnique({ where: { id: call.id } })).toMatchObject({ status: 'missed', agentOutcome: 'declined' });
  });
  it('returns signed inbound XML that rings only the reserved endpoint', async () => {
    const uuid = randomUUID();
    const response = await answer(signed('answer', { CallUUID: uuid, From: '+919876543210', To: '+911234567890', Direction: 'inbound' }));
    expect(response.status).toBe(200); const xml = await response.text(); const call = await db.call.findUniqueOrThrow({ where: { plivoCallUuid: uuid } });
    expect(xml).toContain(`sip:${call.assignedToId}@phone.plivo.com`); expect(xml).toContain('/webhooks/voice/dial');
    expect(call.status).toBe('ringing'); expect(call.answeredAt).toBeNull();
    expect(inboundFinalStatus(call)).toBe('missed');
    await db.call.update({ where: { id: call.id }, data: { endedAt: new Date(), status: 'missed' } }); await releaseCallAgent(call);
  });
  it('rings the contact owner before round robin even if they opted out of new leads', async () => {
    await assignContact();
    await db.membership.updateMany({ where: { organizationId, userId: users[1] }, data: { receivesLeads: false, lastCallAssignedAt: new Date() } });
    const uuid = randomUUID();
    const response = await answer(signed('answer', { CallUUID: uuid, From: '+919876543210', To: '+911234567890', Direction: 'inbound' }));
    const xml = await response.text();
    expect(xml).toContain(`sip:${users[1]}@phone.plivo.com`);
    expect(xml).not.toContain(`sip:${users[2]}@phone.plivo.com`);
    expect(xml).toContain('attempt=0');
    const call = await db.call.findUniqueOrThrow({ where: { plivoCallUuid: uuid } });
    expect(callRoutingState(call.requestedParams)).toMatchObject({ responsibleUserId: users[1], route: 'assigned_contact' });
  });
  it('uses the latest enquiry assignment, including completed bookings, and ignores newer unassigned enquiries', async () => {
    const contact = await assignContact();
    await db.lead.update({ where: { id: lead.id }, data: { assignedAt: new Date('2026-01-01') } });
    await db.lead.create({ data: { organizationId, contactId: contact.id, title: 'Newer assignment', itinerary: '', stage: 'confirmed', assignedToId: users[2], assignedAt: new Date('2026-02-01') } });
    await db.lead.create({ data: { organizationId, contactId: contact.id, title: 'Unassigned enquiry', itinerary: '' } });
    expect((await reserve()).call.assignedToId).toBe(users[2]);
  });
  it('matches a formatted full phone number without matching another country by its suffix', async () => {
    await assignContact(users[1], '+91 (98765) 43210');
    await db.membership.updateMany({ where: { organizationId, userId: users[1] }, data: { lastCallAssignedAt: new Date() } });
    const matched = await reserveInboundCall({ organizationId, callUuid: randomUUID(), from: '919876543210', to: '+911234567890' });
    expect(matched.call.assignedToId).toBe(users[1]);
    const otherCountry = await reserveInboundCall({ organizationId, callUuid: randomUUID(), from: '+449876543210', to: '+911234567890' });
    expect(callRoutingState(otherCountry.call.requestedParams).responsibleUserId).toBeNull();
  });
  it('falls back to an available salesperson when the owner is offline or already on a call', async () => {
    await assignContact();
    const first = await reserve(); expect(first.call.assignedToId).toBe(users[1]);
    const second = await reserve(); expect(second.call.assignedToId).toBe(users[2]);
    expect(callRoutingState(second.call.requestedParams).responsibleUserId).toBe(users[1]);
    await hangup(signed('hangup', { CallUUID: first.call.plivoCallUuid }));
    await hangup(signed('hangup', { CallUUID: second.call.plivoCallUuid }));
    await db.membership.updateMany({ where: { organizationId, userId: users[1] }, data: { voicePresenceAt: new Date(Date.now() - 120_000) } });
    expect((await reserve()).call.assignedToId).toBe(users[2]);
  });
  it('retries round-robin backups once after the owner misses, without changing contact ownership', async () => {
    await assignContact();
    const { call } = await reserve(); expect(call.assignedToId).toBe(users[1]);
    const failure = { CallUUID: call.plivoCallUuid, DialALegUUID: call.plivoCallUuid, DialStatus: 'no-answer', DialHangupCause: 'NO_ANSWER' };
    const responses = await Promise.all([fallback(signed('fallback', failure, 0)), fallback(signed('fallback', failure, 0))]);
    for (const response of responses) {
      const xml = await response.text(); expect(xml).toContain(`sip:${users[2]}@phone.plivo.com`); expect(xml).toContain('attempt=1'); expect(xml).not.toContain('<Speak');
    }
    const next = await db.call.findUniqueOrThrow({ where: { id: call.id } });
    expect(next).toMatchObject({ assignedToId: users[2], status: 'ringing' });
    expect(callRoutingState(next.requestedParams).attemptedUserIds).toEqual([users[1], users[2]]);
    expect((await db.membership.findFirstOrThrow({ where: { organizationId, userId: users[1] } })).voiceBusy).toBe(false);
    // A delayed answer notification from the failed owner attempt must not answer the backup's call.
    await dial(signed('dial', { DialALegUUID: call.plivoCallUuid, DialAction: 'connected', DialBLegUUID: randomUUID() }, 0));
    expect((await db.call.findUniqueOrThrow({ where: { id: call.id } })).agentAnsweredAt).toBeNull();
    await dial(signed('dial', { DialALegUUID: call.plivoCallUuid, DialAction: 'connected', DialBLegUUID: randomUUID() }, 1));
    await fallback(signed('fallback', { ...failure, DialStatus: 'completed', DialBLegDuration: '10' }, 1));
    expect(await db.lead.findUnique({ where: { id: lead.id } })).toMatchObject({ assignedToId: users[1] });
    // A repeat call starts with the owner again, despite the previous backup answering.
    expect((await reserve()).call.assignedToId).toBe(users[1]);
  });
  it('uses voicemail only after the owner and backups fail, and never loops back to the owner', async () => {
    await assignContact(); const { call } = await reserve();
    const failure = { DialALegUUID: call.plivoCallUuid, DialStatus: 'no-answer', DialHangupCause: 'NO_ANSWER' };
    await fallback(signed('fallback', failure, 0));
    const response = await fallback(signed('fallback', { ...failure, DialHangupCause: 'CALL_REJECTED' }, 1));
    expect(await response.text()).toContain('<Speak');
    expect(await db.call.findUnique({ where: { id: call.id } })).toMatchObject({ status: 'missed', agentOutcome: 'declined' });
    const replay = await fallback(signed('fallback', failure, 0)); expect(await replay.text()).not.toContain('<Dial');
    expect(await db.membership.count({ where: { organizationId, voiceBusy: true } })).toBe(0);
  });
  it('releases a completed call from the status callback so an immediate repeat rings the owner', async () => {
    await assignContact(); const { call } = await reserve();
    await dial(signed('dial', { DialALegUUID: call.plivoCallUuid, DialAction: 'connected', DialBLegUUID: randomUUID() }, 0));
    await ringStatus(signed('status', { CallUUID: call.plivoCallUuid, CallStatus: 'completed' }));
    expect(await db.call.findUnique({ where: { id: call.id } })).toMatchObject({ status: 'completed', endedAt: expect.any(Date) });
    expect((await db.membership.findFirstOrThrow({ where: { organizationId, userId: users[1] } })).voiceBusy).toBe(false);
    const repeat = await reserve(); expect(repeat.call.assignedToId).toBe(users[1]);
    // A late hangup for the old call must not release the new reservation.
    await hangup(signed('hangup', { CallUUID: call.plivoCallUuid }));
    expect((await db.membership.findFirstOrThrow({ where: { organizationId, userId: users[1] } })).voiceBusy).toBe(true);
  });
  it('repairs completion when a prior status callback marked completed without releasing the agent', async () => {
    await assignContact(); const { call } = await reserve();
    await db.call.update({ where: { id: call.id }, data: { status: 'completed' } });
    await fallback(signed('fallback', { CallUUID: randomUUID(), DialALegUUID: call.plivoCallUuid, DialStatus: 'completed', DialBLegDuration: '4' }, 0));
    expect(await db.call.findUnique({ where: { id: call.id } })).toMatchObject({ status: 'completed', endedAt: expect.any(Date), agentOutcome: 'answered' });
    expect((await reserve()).call.assignedToId).toBe(users[1]);
  });
  it('releases the salesperson when the browser leg ends before parent completion callbacks arrive', async () => {
    await assignContact(); const { call } = await reserve();
    await dial(signed('dial', { DialALegUUID: call.plivoCallUuid, DialAction: 'hangup', DialBLegStatus: 'completed', DialBLegDuration: '8', DialBLegUUID: randomUUID() }, 0));
    expect(await db.call.findUnique({ where: { id: call.id } })).toMatchObject({ status: 'completed', endedAt: expect.any(Date), agentOutcome: 'answered' });
    expect((await reserve()).call.assignedToId).toBe(users[1]);
  });
  it('does not reserve a backup when the caller cancels before the parent hangup callback', async () => {
    await assignContact(); const { call } = await reserve();
    const response = await fallback(signed('fallback', { DialALegUUID: call.plivoCallUuid, DialStatus: 'cancel', DialHangupCause: 'ORIGINATOR_CANCEL' }, 0));
    expect(await response.text()).toContain('<Hangup');
    expect(await db.membership.count({ where: { organizationId, voiceBusy: true } })).toBe(0);
    expect((await db.call.findUniqueOrThrow({ where: { id: call.id } })).endedAt).toBeInstanceOf(Date);
  });
  it('does not start a backup after the caller has already hung up', async () => {
    await assignContact(); const { call } = await reserve();
    await hangup(signed('hangup', { CallUUID: call.plivoCallUuid }));
    const res = await fallback(signed('fallback', { DialALegUUID: call.plivoCallUuid, DialStatus: 'no-answer' }, 0));
    expect(await res.text()).toContain('<Hangup');
    expect(await db.membership.count({ where: { organizationId, voiceBusy: true } })).toBe(0);
  });
  it('does not use or modify another agency assignment or call', async () => {
    const otherOrg = await db.organization.create({ data: { name: 'Other agency', slug: randomUUID() } });
    try {
      const contact = await db.contact.create({ data: { organizationId: otherOrg.id, name: 'Other agency caller', phone: '+919876543210' } });
      await db.lead.create({ data: { organizationId: otherOrg.id, contactId: contact.id, title: 'Other agency lead', itinerary: '', assignedToId: users[1], assignedAt: new Date() } });
      const { call } = await reserve();
      expect(callRoutingState(call.requestedParams).responsibleUserId).toBeNull();
      expect(await retryInboundCall({ organizationId: otherOrg.id, callUuid: call.plivoCallUuid, attempt: 0, outcome: 'missed' })).toBeNull();
      await recordInboundAnswer({ organizationId: otherOrg.id, callUuid: call.plivoCallUuid, attempt: 0, completed: true });
      expect(await db.call.findUnique({ where: { id: call.id } })).toMatchObject({ status: 'ringing', endedAt: null });
    } finally { await db.organization.delete({ where: { id: otherOrg.id } }); }
  });
  it('recovers an expired unanswered ring only when its own browser reports ready, and ignores late retries', async () => {
    await assignContact(); const { call } = await reserve();
    await db.call.update({ where: { id: call.id }, data: { updatedAt: new Date(Date.now() - 120_000) } });
    const staffToken = await signAccessToken({ organizationId, userId: users[1], email: 'sales@example.test', role: 'sales' });
    const response = await presence(request('telephony/presence', { ready: true, busy: false }, 'POST', staffToken));
    expect((await response.json()).readiness).toMatchObject({ canReceiveAssignedCalls: true, canReceiveNewCalls: true, busy: false });
    const expired = await db.call.findUniqueOrThrow({ where: { id: call.id } });
    expect(expired).toMatchObject({ status: 'missed', agentOutcome: 'missed', endedAt: null });
    expect(callRoutingState(expired.requestedParams).browserReservationExpiredAt).toEqual(expect.any(String));
    const next = await reserve(); expect(next.call.assignedToId).toBe(users[1]);
    const late = await retryInboundCall({ organizationId, callUuid: call.plivoCallUuid, attempt: 0, outcome: 'missed' });
    expect(late?.hangup).toBe(true); expect(late?.sipUri).toBeNull();
    await recordInboundAnswer({ organizationId, callUuid: call.plivoCallUuid, attempt: 0 });
    expect(await db.call.findUnique({ where: { id: call.id } })).toMatchObject({ status: 'completed', endedAt: expect.any(Date) });
    expect((await db.membership.findFirstOrThrow({ where: { organizationId, userId: users[1] } })).voiceBusy).toBe(true);
  });
  it('never expires an answered browser call or a browser that reports busy', async () => {
    const { call } = await reserve();
    await db.call.update({ where: { id: call.id }, data: { updatedAt: new Date(Date.now() - 120_000) } });
    const staffToken = await signAccessToken({ organizationId, userId: call.assignedToId!, email: 'sales@example.test', role: 'sales' });
    await presence(request('telephony/presence', { ready: true, busy: true }, 'POST', staffToken));
    expect(await db.call.findUnique({ where: { id: call.id } })).toMatchObject({ status: 'ringing', agentOutcome: 'ringing' });
    await db.call.update({ where: { id: call.id }, data: { status: 'in-progress', agentOutcome: 'answered', agentAnsweredAt: new Date(), updatedAt: new Date(Date.now() - 120_000) } });
    const response = await presence(request('telephony/presence', { ready: true, busy: false }, 'POST', staffToken));
    expect((await response.json()).readiness).toMatchObject({ canReceiveAssignedCalls: false, busy: true });
    expect(await db.call.findUnique({ where: { id: call.id } })).toMatchObject({ status: 'in-progress', endedAt: null });
  });
  it('does not expire another user reservation when a different phone sends a ready heartbeat', async () => {
    const first = await reserve(); const second = await reserve();
    for (const call of [first.call, second.call]) await db.call.update({ where: { id: call.id }, data: { updatedAt: new Date(Date.now() - 120_000) } });
    const firstToken = await signAccessToken({ organizationId, userId: first.call.assignedToId!, email: 'sales@example.test', role: 'sales' });
    await presence(request('telephony/presence', { ready: true, busy: false }, 'POST', firstToken));
    expect(await db.call.findUnique({ where: { id: first.call.id } })).toMatchObject({ status: 'missed' });
    expect(await db.call.findUnique({ where: { id: second.call.id } })).toMatchObject({ status: 'ringing' });
    expect((await db.membership.findFirstOrThrow({ where: { organizationId, userId: second.call.assignedToId! } })).voiceBusy).toBe(true);
  });
  it('reports server-side phone eligibility and keeps endpoint credentials out of admin readiness responses', async () => {
    await db.membership.updateMany({ where: { organizationId, userId: users[1] }, data: { receivesLeads: false } });
    const staffToken = await signAccessToken({ organizationId, userId: users[1], email: 'sales@example.test', role: 'sales' });
    const response = await presence(request('telephony/presence', { ready: true, busy: false }, 'POST', staffToken));
    expect((await response.json()).readiness).toMatchObject({ canReceiveAssignedCalls: true, canReceiveNewCalls: false, reason: expect.stringContaining('assigned enquiries only') });
    await db.membership.updateMany({ where: { organizationId, userId: users[1] }, data: { availableForLeads: false } });
    const unavailable = await presence(request('telephony/presence', { ready: true, busy: false }, 'POST', staffToken));
    expect((await unavailable.json()).readiness).toMatchObject({ canReceiveAssignedCalls: false, reason: expect.stringContaining('Available is switched off') });
    const adminData = await (await intakeSettings(request('lead-intake'))).json();
    expect(JSON.stringify(adminData)).not.toMatch(/voiceEndpoint|ciphertext|test-password/);
    expect(adminData.members.find((m: any) => m.userId === users[1]).phoneReadiness.canReceiveAssignedCalls).toBe(false);
  });
  it('preserves the provider Dial failure reason for diagnosing a selected but non-ringing endpoint', async () => {
    const { call } = await reserve();
    await fallback(signed('fallback', { DialALegUUID: call.plivoCallUuid, DialStatus: 'failed', DialHangupCause: 'USER_NOT_REGISTERED' }, 0));
    const saved = await db.call.findUniqueOrThrow({ where: { id: call.id } });
    expect(saved.requestedParams).toMatchObject({ lastDialStatus: 'failed', lastDialHangupCause: 'USER_NOT_REGISTERED', initialRoutingReason: expect.stringContaining('Ringing'), routingReason: expect.stringContaining('voicemail') });
  });
});
