import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { signAccessToken } from '@/lib/auth-tokens';
import { encryptData } from '@/lib/crypto';
import { createEnquiry } from '@/lib/lead-intake/service';
import { enquirySchema } from '@/lib/lead-intake/normalize';
import { reserveInboundCall } from '@/lib/telephony/agent-routing';
import { GET as listEnquiries, POST as addEnquiry } from '@/app/api/v1/enquiries/route';
import { GET as readEnquiry, PATCH as updateEnquiry } from '@/app/api/v1/enquiries/[id]/route';
import { GET as callDefaults, POST as convertCall } from '@/app/api/v1/calls/[id]/enquiry/route';

const suite = process.env.LEAD_INTAKE_DATABASE_TESTS === '1' ? describe : describe.skip;

suite('Contact-centered enquiry ownership and call conversion', () => {
  let organizationId: string;
  let otherOrganizationId: string;
  let userIds: string[];
  let tokens: string[];
  const profile = {
    name: 'Enquiry customer', phone: '+12025550123', email: 'customer@example.test',
    preferredTravelMonth: '2027-04', tourType: 'Family', numberOfChildren: 0,
    specialRequirements: 'Vegetarian meals\nAccessible room', city: 'Chennai',
  };

  function request(path: string, body?: object, userIndex = 0, method = body ? 'POST' : 'GET') {
    return new NextRequest(`http://localhost/api/v1/${path}`, {
      method, headers: { Authorization: `Bearer ${tokens[userIndex]}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  }
  const context = (id: string) => ({ params: Promise.resolve({ id }) });
  async function savedContact(extra: Record<string, unknown> = {}) {
    const response = await addEnquiry(request('enquiries', { ...profile, assignedToId: userIds[1], ...extra }));
    expect(response.status).toBe(201);
    return (await response.json()).contact;
  }
  async function savedCall(extra: Record<string, unknown> = {}) {
    return db.call.create({ data: {
      organizationId, plivoCallUuid: randomUUID(), direction: 'inbound', from: profile.phone, to: '+12025550999',
      status: 'completed', assignedToId: userIds[1], agentOutcome: 'answered', agentAnsweredAt: new Date(),
      answeredAt: new Date(), endedAt: new Date(), durationSeconds: 20, ...extra,
    } });
  }
  async function patch(id: string, body: object, userIndex = 0) {
    return updateEnquiry(request(`enquiries/${id}`, body, userIndex, 'PATCH'), context(id));
  }

  beforeEach(async () => {
    organizationId = (await db.organization.create({ data: { name: 'Enquiry workflow agency', slug: `enquiry-workflow-${randomUUID()}` } })).id;
    otherOrganizationId = (await db.organization.create({ data: { name: 'Other enquiry agency', slug: `other-enquiry-${randomUUID()}` } })).id;
    userIds = []; tokens = [];
    for (const role of ['owner', 'sales', 'sales', 'viewer']) {
      const user = await db.user.create({ data: { name: role, email: `${randomUUID()}@example.test`, passwordHash: 'unused' } });
      userIds.push(user.id);
      await db.membership.create({ data: {
        organizationId, userId: user.id, role, receivesLeads: role === 'sales', availableForLeads: true,
        voicePresenceAt: new Date(),
        ...(role === 'sales' ? { voiceEndpoint: { ...encryptData(JSON.stringify({ username: user.id, password: 'unused', sipUri: `sip:${user.id}@phone.plivo.com`, authId: 'unused', endpointId: user.id })) } } : {}),
      } });
      tokens.push(await signAccessToken({ userId: user.id, organizationId, email: user.email, role }));
    }
  });
  afterEach(async () => {
    await db.organization.deleteMany({ where: { id: { in: [organizationId, otherOrganizationId] } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
  });
  afterAll(async () => { await db.$disconnect(); });

  it('creates the complete enquiry profile with direct assignment, grouping tags and status', async () => {
    const contact = await savedContact({ enquiryStatus: 'contacted', enquiryTag: 'hot', tags: ['VIP', 'Family'] });
    expect(contact).toMatchObject({ ...profile, assignedToId: userIds[1], enquiryStatus: 'contacted', enquiryTag: 'hot', tags: ['VIP', 'Family'] });
    expect(await db.contact.findUnique({ where: { id: contact.id } })).toMatchObject({ assignedToId: userIds[1], numberOfChildren: 0, city: 'Chennai' });
    expect(await db.lead.count({ where: { organizationId, contactId: contact.id } })).toBe(0);
    const mine = await listEnquiries(request('enquiries?assignedTo=me', undefined, 1));
    expect((await mine.json()).objects).toContainEqual(expect.objectContaining({ id: contact.id, assignedToId: userIds[1] }));
  });

  it('assigns new enquiry profiles in round robin without requiring itinerary creation', async () => {
    const first = await addEnquiry(request('enquiries', { ...profile }));
    const second = await addEnquiry(request('enquiries', { ...profile, phone: '+12025550124', email: 'second@example.test' }));
    expect(first.status).toBe(201); expect(second.status).toBe(201);
    const a = (await first.json()).contact; const b = (await second.json()).contact;
    expect([a.assignedToId, b.assignedToId].sort()).toEqual([userIds[1], userIds[2]].sort());
    expect(await db.lead.count({ where: { organizationId } })).toBe(0);
  });

  it('limits assigned-to-me and detail access to the responsible staff member', async () => {
    const contact = await savedContact();
    const mine = await listEnquiries(request('enquiries?assignedTo=me', undefined, 1));
    const theirs = await listEnquiries(request('enquiries?assignedTo=me', undefined, 2));
    expect((await mine.json()).objects).toHaveLength(1);
    expect((await theirs.json()).objects).toHaveLength(0);
    expect((await readEnquiry(request(`enquiries/${contact.id}`, undefined, 2), context(contact.id))).status).toBe(404);
    expect((await patch(contact.id, { enquiryStatus: 'contacted' }, 2)).status).toBe(404);
    expect((await patch(contact.id, { enquiryStatus: 'contacted', enquiryTag: 'cold', tags: ['Follow up'] }, 1)).status).toBe(200);
    expect(await db.contact.findUnique({ where: { id: contact.id } })).toMatchObject({ enquiryStatus: 'contacted', enquiryTag: 'cold', tags: ['Follow up'] });
  });

  it('allows admin reassignment but prevents staff changing an existing owner', async () => {
    const contact = await savedContact();
    expect((await patch(contact.id, { assignedToId: userIds[2] }, 1)).status).toBe(403);
    expect((await patch(contact.id, { assignedToId: userIds[2] })).status).toBe(200);
    expect((await listEnquiries(request('enquiries?assignedTo=me', undefined, 1))).status).toBe(200);
    expect((await (await listEnquiries(request('enquiries?assignedTo=me', undefined, 1))).json()).objects).toHaveLength(0);
    expect((await (await listEnquiries(request('enquiries?assignedTo=me', undefined, 2))).json()).objects).toContainEqual(expect.objectContaining({ id: contact.id }));
  });

  it('preserves legacy assigned-lead access only until the enquiry has an authoritative owner', async () => {
    const contact = await db.contact.create({ data: { organizationId, ...profile } });
    await db.lead.create({ data: { organizationId, contactId: contact.id, title: 'Legacy trip', itinerary: '', assignedToId: userIds[1] } });
    expect((await readEnquiry(request(`enquiries/${contact.id}`, undefined, 1), context(contact.id))).status).toBe(200);
    await db.contact.update({ where: { id: contact.id }, data: { assignedToId: userIds[2], assignedAt: new Date() } });
    expect((await readEnquiry(request(`enquiries/${contact.id}`, undefined, 1), context(contact.id))).status).toBe(404);
    expect((await readEnquiry(request(`enquiries/${contact.id}`, undefined, 2), context(contact.id))).status).toBe(200);
  });

  it('validates status, tags and optimistic edit versions without losing saved changes', async () => {
    const contact = await savedContact();
    for (const body of [{ enquiryStatus: 'unknown-status' }, { enquiryTag: 'boiling' }, { numberOfChildren: -1 }]) {
      expect((await patch(contact.id, body)).status).toBe(400);
    }
    await db.contact.update({ where: { id: contact.id }, data: { updatedAt: new Date('2020-01-01T00:00:00Z') } });
    expect((await patch(contact.id, { city: 'Kochi', expectedUpdatedAt: '2020-01-01T00:00:00.000Z' })).status).toBe(200);
    expect((await patch(contact.id, { city: 'Stale city', expectedUpdatedAt: '2020-01-01T00:00:00.000Z' })).status).toBe(409);
    expect(await db.contact.findUnique({ where: { id: contact.id } })).toMatchObject({ city: 'Kochi', numberOfChildren: 0 });
  });

  it('prefills the correct customer endpoint and saved profile for inbound and outbound calls', async () => {
    const contact = await savedContact();
    const inbound = await savedCall();
    const response = await callDefaults(request(`calls/${inbound.id}/enquiry`, undefined, 1), context(inbound.id));
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.defaults).toMatchObject({ name: profile.name, phone: profile.phone, email: profile.email, assignedToId: userIds[1] });
    expect(data.contact.id).toBe(contact.id);
    const outbound = await savedCall({ direction: 'outbound', from: '+12025550999', to: profile.phone, requestedParams: { actorUserId: userIds[1] } });
    const outboundData = await (await callDefaults(request(`calls/${outbound.id}/enquiry`, undefined, 1), context(outbound.id))).json();
    expect(outboundData.defaults.phone).toBe(profile.phone);
  });

  it('uses the answering staff as default and permits another eligible assignee on a new conversion', async () => {
    const call = await savedCall();
    const defaults = await (await callDefaults(request(`calls/${call.id}/enquiry`, undefined, 1), context(call.id))).json();
    expect(defaults.defaults.assignedToId).toBe(userIds[1]);
    const response = await convertCall(request(`calls/${call.id}/enquiry`, { ...profile, assignedToId: userIds[2], enquiryTag: 'hot', enquiryStatus: 'contacted', tags: ['Call enquiry'] }, 1), context(call.id));
    expect(response.status).toBe(201);
    const result = await response.json();
    expect(result).toMatchObject({ created: true, converted: true, contact: { assignedToId: userIds[2], enquiryTag: 'hot' } });
    expect(await db.call.findUnique({ where: { id: call.id } })).toMatchObject({ enquiryContactId: result.contact.id, assignedToId: userIds[1] });
    expect(await db.lead.count({ where: { organizationId } })).toBe(0);
  });

  it('does not identify a missed reservation as the staff member who attended', async () => {
    const call = await savedCall({ status: 'missed', agentOutcome: 'missed', agentAnsweredAt: null, answeredAt: null, durationSeconds: 0 });
    const response = await callDefaults(request(`calls/${call.id}/enquiry`), context(call.id));
    expect(response.status).toBe(200);
    expect((await response.json()).defaults.assignedToId).not.toBe(userIds[1]);
  });

  it('serializes concurrent conversions and makes repeat conversion safe', async () => {
    const call = await savedCall();
    const payload = { ...profile, assignedToId: userIds[1] };
    const responses = await Promise.all([
      convertCall(request(`calls/${call.id}/enquiry`, payload), context(call.id)),
      convertCall(request(`calls/${call.id}/enquiry`, payload), context(call.id)),
    ]);
    expect(responses.map(r => r.status).sort()).toEqual([200, 201]);
    const results = await Promise.all(responses.map(r => r.json()));
    expect(results[0].contact.id).toBe(results[1].contact.id);
    expect(await db.contact.count({ where: { organizationId, phone: profile.phone } })).toBe(1);
    await db.contact.update({ where: { id: results[0].contact.id }, data: { city: 'Reviewed city', assignedToId: userIds[2] } });
    const replay = await convertCall(request(`calls/${call.id}/enquiry`, { ...payload, name: 'Stale conversion name', city: 'Stale conversion city' }), context(call.id));
    expect(replay.status).toBe(200);
    expect(await db.contact.findUnique({ where: { id: results[0].contact.id } })).toMatchObject({ name: profile.name, city: 'Reviewed city', assignedToId: userIds[2] });
  });

  it('reuses a matched enquiry without silently taking over its owner', async () => {
    const contact = await savedContact({ assignedToId: userIds[2] });
    const call = await savedCall();
    const response = await convertCall(request(`calls/${call.id}/enquiry`, { ...profile, assignedToId: userIds[1] }, 1), context(call.id));
    // An answered-call actor can link the existing enquiry, but must not use
    // conversion as a way to reassign somebody else's customer to themselves.
    expect([200, 403]).toContain(response.status);
    expect(await db.contact.findUnique({ where: { id: contact.id } })).toMatchObject({ assignedToId: userIds[2] });
    expect(await db.contact.count({ where: { organizationId, phone: profile.phone } })).toBe(1);
  });

  it('rejects unavailable-role and foreign-agency assignment targets', async () => {
    const foreign = await db.user.create({ data: { name: 'Foreign staff', email: `${randomUUID()}@example.test`, passwordHash: 'unused' } });
    userIds.push(foreign.id);
    await db.membership.create({ data: { organizationId: otherOrganizationId, userId: foreign.id, role: 'sales' } });
    for (const assignedToId of [userIds[3], foreign.id]) {
      expect((await addEnquiry(request('enquiries', { ...profile, assignedToId }))).status).toBe(400);
    }
    expect(await db.contact.count({ where: { organizationId } })).toBe(0);
    const call = await savedCall();
    expect((await convertCall(request(`calls/${call.id}/enquiry`, { ...profile, assignedToId: foreign.id }, 1), context(call.id))).status).toBe(400);
    expect(await db.call.findUnique({ where: { id: call.id } })).toMatchObject({ enquiryContactId: null });
  });

  it('rejects another salesperson and another agency converting an inaccessible call', async () => {
    const call = await savedCall();
    expect((await callDefaults(request(`calls/${call.id}/enquiry`, undefined, 2), context(call.id))).status).toBe(404);
    expect((await convertCall(request(`calls/${call.id}/enquiry`, profile, 2), context(call.id))).status).toBe(404);
    await db.membership.create({ data: { organizationId: otherOrganizationId, userId: userIds[0], role: 'owner' } });
    const previous = tokens[0];
    tokens[0] = await signAccessToken({ userId: userIds[0], organizationId: otherOrganizationId, email: 'owner@example.test', role: 'owner' });
    try {
      expect((await callDefaults(request(`calls/${call.id}/enquiry`), context(call.id))).status).toBe(404);
      expect((await convertCall(request(`calls/${call.id}/enquiry`, profile), context(call.id))).status).toBe(404);
    } finally { tokens[0] = previous; }
    expect(await db.contact.count({ where: { organizationId } })).toBe(0);
  });

  it('preserves the contact owner on repeat form enquiries and routes to that owner over newer lead assignments', async () => {
    const contact = await savedContact();
    await db.membership.updateMany({ where: { organizationId, userId: userIds[1] }, data: { lastLeadAssignedAt: new Date(), lastCallAssignedAt: new Date() } });
    const input = enquirySchema.parse({ name: profile.name, phone: profile.phone, email: profile.email, formId: 'test-trip', formName: 'Trip enquiry', submissionId: randomUUID(), city: 'New trip city' });
    const newLead = await db.$transaction(tx => createEnquiry(tx, organizationId, 'website', input));
    expect(newLead).toMatchObject({ contactId: contact.id, assignedToId: userIds[1] });
    expect(await db.contact.findUnique({ where: { id: contact.id } })).toMatchObject({ assignedToId: userIds[1], city: profile.city });
    await db.lead.create({ data: { organizationId, contactId: contact.id, title: 'Different trip assignee', itinerary: '', assignedToId: userIds[2], assignedAt: new Date(Date.now() + 1000) } });
    const reservation = await reserveInboundCall({ organizationId, callUuid: randomUUID(), from: profile.phone, to: '+12025550999' });
    expect(reservation.call.assignedToId).toBe(userIds[1]);
    expect(reservation.sipUri).toContain(userIds[1]);
  });

  it('denies viewer enquiry management', async () => {
    expect((await listEnquiries(request('enquiries', undefined, 3))).status).toBe(403);
    expect((await addEnquiry(request('enquiries', profile, 3))).status).toBe(403);
  });
});
