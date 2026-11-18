import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID, createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { encryptData } from '@/lib/crypto';
import { signAccessToken } from '@/lib/auth-tokens';
import { createEnquiry, processSubmission, receiveSubmission } from '@/lib/lead-intake/service';
import { enquirySchema } from '@/lib/lead-intake/normalize';
import { POST as webhook, GET as verifyMeta } from '@/app/api/v1/webhooks/leads/[connectionId]/route';
import { GET as leads } from '@/app/api/v1/leads/route';
import { GET as detail } from '@/app/api/v1/leads/[id]/route';
import { GET as settings, POST as connect, PATCH as changeSettings } from '@/app/api/v1/lead-intake/route';
import { PATCH as qualify } from '@/app/api/v1/leads/[id]/qualification/route';
import { POST as worker } from '@/app/api/v1/lead-intake/process/route';
import { POST as createStaff } from '@/app/api/v1/users/route';

const suite = process.env.LEAD_INTAKE_DATABASE_TESTS === '1' ? describe : describe.skip;
suite('Lead intake with an isolated PostgreSQL schema', () => {
  let organizationId: string; let ownerId: string; let salesIds: string[]; let tokens: string[]; let ownerToken: string;
  const secret = 'test-webhook-secret-at-least-24-characters';
  const userIds: string[] = [];
  const req = (path: string, body?: unknown, token?: string, method = 'POST', headers: Record<string, string> = {}) => new NextRequest(`http://localhost/api/v1/${path}`, { method: body === undefined && method === 'POST' ? 'GET' : method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const input = (id: string = randomUUID()) => enquirySchema.parse({ submissionId: id, name: 'Jane', phone: '+919876543210', email: 'jane@example.com', formId: 'trip', formName: 'Summer trips' });
  async function connection(provider = 'website', extra = {}) {
    return db.leadConnection.create({ data: { organizationId, name: 'Test form', provider, credentials: { ...encryptData(JSON.stringify({ webhookSecret: secret, ...extra })) }, formNames: { '12': 'Google summer form' } } });
  }
  async function create(id?: string) { return db.$transaction(tx => createEnquiry(tx, organizationId, 'website', input(id)), { maxWait: 15000, timeout: 15000 }); }
  beforeEach(async () => {
    const org = await db.organization.create({ data: { name: 'Intake test', slug: `intake-${randomUUID()}` } }); organizationId = org.id;
    const users = await Promise.all(['owner', 'sales', 'sales'].map(async role => {
      const user = await db.user.create({ data: { name: role, email: `${randomUUID()}@example.test`, passwordHash: 'unused-test-password' } }); userIds.push(user.id);
      await db.membership.create({ data: { organizationId, userId: user.id, role, receivesLeads: role === 'sales' } });
      return user;
    }));
    ownerId = users[0].id; salesIds = users.slice(1).map(u => u.id);
    ownerToken = await signAccessToken({ userId: ownerId, email: users[0].email, organizationId, role: 'owner' });
    tokens = await Promise.all(users.slice(1).map(u => signAccessToken({ userId: u.id, email: u.email, organizationId, role: 'sales' })));
  });
  afterEach(async () => { vi.unstubAllGlobals(); await db.organization.delete({ where: { id: organizationId } }); await db.user.deleteMany({ where: { id: { in: userIds.splice(0) } } }); });
  afterAll(async () => { await db.$disconnect(); });

  it('distributes concurrent enquiries from different customers evenly', async () => {
    const created = await Promise.all(Array.from({ length: 8 }, (_, i) => db.$transaction(tx => createEnquiry(tx, organizationId, 'website',
      enquirySchema.parse({ submissionId: randomUUID(), name: `Customer ${i}`, phone: `+9198765432${String(i).padStart(2, '0')}`, formId: 'trip', formName: 'Summer trips' })), { maxWait: 15000, timeout: 15000 })));
    expect(created.filter(l => l.assignedToId === salesIds[0])).toHaveLength(4);
    expect(created.filter(l => l.assignedToId === salesIds[1])).toHaveLength(4);
    expect(await db.contact.count({ where: { organizationId } })).toBe(8);
  });
  it('keeps one contact and one responsible owner across multiple enquiries from the same customer', async () => {
    const created = await Promise.all(Array.from({ length: 8 }, () => create()));
    expect(new Set(created.map(l => l.assignedToId)).size).toBe(1);
    expect(salesIds).toContain(created[0].assignedToId);
    expect(await db.contact.count({ where: { organizationId } })).toBe(1);
    expect(await db.contact.findFirst({ where: { organizationId } })).toMatchObject({ assignedToId: created[0].assignedToId });
    expect(created.filter(l => l.duplicateContactFlag)).toHaveLength(7);
    expect(created[0].firstContactDueAt!.getTime() - created[0].createdAt.getTime()).toBeGreaterThan(29 * 60_000);
  });
  it('skips unavailable and disabled staff and retains unassigned leads', async () => {
    await db.membership.updateMany({ where: { organizationId }, data: { availableForLeads: false } });
    expect((await create()).assignedToId).toBeNull();
    await db.membership.updateMany({ where: { organizationId, userId: salesIds[0] }, data: { availableForLeads: true } });
    await db.user.update({ where: { id: salesIds[0] }, data: { status: 'disabled' } });
    expect((await create()).assignedToId).toBeNull();
    await db.user.update({ where: { id: salesIds[0] }, data: { status: 'active' } });
    expect((await create()).assignedToId).toBe(salesIds[0]);
  });
  it('deduplicates webhook deliveries and concurrent processing', async () => {
    const c = await connection();
    const rows = await Promise.all(Array.from({ length: 4 }, () => receiveSubmission(c, 'same', input('same'))));
    expect(new Set(rows.map(r => r.id)).size).toBe(1);
    await Promise.all(rows.map(r => processSubmission(r.id)));
    expect(await db.lead.count({ where: { organizationId } })).toBe(1);
    expect((await db.leadSubmission.findUniqueOrThrow({ where: { id: rows[0].id } })).status).toBe('processed');
  });
  it('authenticates Google webhooks and captures exact form attribution', async () => {
    const c = await connection('google_ads'); const context = { params: Promise.resolve({ connectionId: c.id }) };
    const payload = { lead_id: 'google-1', google_key: secret, form_id: 12, campaign_id: 34, user_column_data: [{ column_id: 'EMAIL', string_value: 'Jane@example.com' }] };
    expect((await webhook(req(`webhooks/leads/${c.id}`, { ...payload, google_key: 'wrong' }), context)).status).toBe(401);
    expect(await db.leadSubmission.count({ where: { organizationId } })).toBe(0);
    expect((await webhook(req(`webhooks/leads/${c.id}`, payload), context)).status).toBe(200);
    const row = await db.leadSubmission.findFirstOrThrow({ where: { organizationId } });
    expect(JSON.stringify(row.payload)).not.toContain(secret);
    await processSubmission(row.id);
    expect(await db.lead.findFirst({ where: { organizationId } })).toMatchObject({ source: 'google_ads', formName: 'Google summer form', campaignId: '34' });
    expect(await db.contact.findFirst({ where: { organizationId } })).toMatchObject({ phone: null, email: 'jane@example.com' });
  });
  it('retains failed imports, recovers after configuration changes and ignores Google test leads', async () => {
    const c = await connection('google_ads');
    const payload = { lead_id: 'google-2', form_id: 99, user_column_data: [{ column_id: 'EMAIL', string_value: 'jane@example.com' }] };
    const row = await receiveSubmission(c, 'google-2', payload); await processSubmission(row.id);
    expect((await db.leadSubmission.findUniqueOrThrow({ where: { id: row.id } })).status).toBe('failed');
    await db.leadConnection.update({ where: { id: c.id }, data: { formNames: { '99': 'Correct form name' } } });
    expect((await changeSettings(req('lead-intake', { action: 'retry', id: row.id }, ownerToken, 'PATCH'))).status).toBe(200);
    await processSubmission(row.id);
    expect(await db.lead.findFirst({ where: { organizationId } })).toMatchObject({ formName: 'Correct form name' });
    const test = await receiveSubmission(c, 'test', { ...payload, is_test: true }); await processSubmission(test.id);
    expect((await db.leadSubmission.findUniqueOrThrow({ where: { id: test.id } })).status).toBe('ignored');
    expect(await db.lead.count({ where: { organizationId } })).toBe(1);
  });
  it('supports Google Forms and rejects unauthenticated website submissions', async () => {
    const c = await connection('google_forms'); const context = { params: Promise.resolve({ connectionId: c.id }) };
    expect((await webhook(req(`webhooks/leads/${c.id}`, input()), context)).status).toBe(401);
    expect((await webhook(req(`webhooks/leads/${c.id}`, input('forms-1'), undefined, 'POST', { 'X-Lead-Secret': secret }), context)).status).toBe(200);
    const row = await db.leadSubmission.findFirstOrThrow({ where: { organizationId } }); await processSubmission(row.id);
    expect(await db.lead.findFirst({ where: { organizationId } })).toMatchObject({ source: 'google_forms', formName: 'Summer trips' });
  });
  it('verifies Meta subscriptions, signatures and Page ownership, and retrieves the actual form name', async () => {
    const appSecret = 'meta-secret'; const c = await connection('meta', { appSecret, pageAccessToken: 'test-token', graphVersion: 'v25.0', pageId: '100' });
    const context = { params: Promise.resolve({ connectionId: c.id }) };
    const verification = new NextRequest(`http://localhost/api/v1/webhooks/leads/${c.id}?hub.mode=subscribe&hub.verify_token=${secret}&hub.challenge=123`);
    expect(await (await verifyMeta(verification, context)).text()).toBe('123');
    const payload = { object: 'page', entry: [{ id: '100', changes: [{ field: 'leadgen', value: { leadgen_id: '200' } }] }] };
    const signature = `sha256=${createHmac('sha256', appSecret).update(JSON.stringify(payload)).digest('hex')}`;
    expect((await webhook(req(`webhooks/leads/${c.id}`, payload), context)).status).toBe(401);
    expect((await webhook(req(`webhooks/leads/${c.id}`, payload, undefined, 'POST', { 'X-Hub-Signature-256': signature }), context)).status).toBe(200);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json({ id: '200', form_id: '300', field_data: [{ name: 'email', values: ['jane@example.com'] }] })).mockResolvedValueOnce(Response.json({ name: 'Meta exact form name' })));
    await processSubmission((await db.leadSubmission.findFirstOrThrow({ where: { organizationId } })).id);
    expect(await db.lead.findFirst({ where: { organizationId } })).toMatchObject({ source: 'meta', formName: 'Meta exact form name' });
    const wrongPage = { ...payload, entry: [{ ...payload.entry[0], id: '999' }] };
    const signedWrongPage = `sha256=${createHmac('sha256', appSecret).update(JSON.stringify(wrongPage)).digest('hex')}`;
    expect((await webhook(req(`webhooks/leads/${c.id}`, wrongPage, undefined, 'POST', { 'X-Hub-Signature-256': signedWrongPage }), context)).status).toBe(400);
  });
  it('recovers expired processing leases without creating another lead', async () => {
    const c = await connection(); const row = await receiveSubmission(c, 'lease', input('lease'));
    await db.leadSubmission.update({ where: { id: row.id }, data: { status: 'processing', claimToken: 'abandoned', claimedAt: new Date(Date.now() - 6 * 60_000) } });
    await Promise.all([processSubmission(row.id), processSubmission(row.id)]);
    expect(await db.lead.count({ where: { organizationId } })).toBe(1);
  });
  it('uses the original arrival time for contact deadlines after delayed processing', async () => {
    const c = await connection(); const row = await receiveSubmission(c, 'delayed', input('delayed'));
    const receivedAt = new Date(Date.now() - 60 * 60_000);
    await db.leadSubmission.update({ where: { id: row.id }, data: { createdAt: receivedAt } });
    await processSubmission(row.id);
    const lead = await db.lead.findFirstOrThrow({ where: { organizationId } });
    expect(lead.firstContactDueAt!.getTime()).toBe(receivedAt.getTime() + 30 * 60_000);
    expect(lead.firstContactDueAt!.getTime()).toBeLessThan(Date.now());
  });
  it('flags conflicting contact matches without overwriting either contact', async () => {
    const phoneContact = await db.contact.create({ data: { organizationId, name: 'Phone owner', phone: '+919876543210', email: 'original@example.com' } });
    const emailContact = await db.contact.create({ data: { organizationId, name: 'Email owner', email: 'jane@example.com' } });
    const lead = await create();
    expect(lead).toMatchObject({ contactId: phoneContact.id, duplicateContactFlag: true, metadata: { contactMatchNeedsReview: true } });
    expect(await db.contact.findUnique({ where: { id: phoneContact.id } })).toMatchObject({ email: 'original@example.com' });
    expect(await db.contact.findUnique({ where: { id: emailContact.id } })).toMatchObject({ phone: null });
  });
  it('preserves original answers and pauses delivery without discarding queued submissions', async () => {
    const c = await connection(); const row = await receiveSubmission(c, 'answers', { ...input('answers'), answers: { 'Preferred destination': 'Japan', 'Travel month': 'April' } });
    await db.leadConnection.update({ where: { id: c.id }, data: { enabled: false } });
    expect((await webhook(req(`webhooks/leads/${c.id}`, input('another'), undefined, 'POST', { 'X-Lead-Secret': secret }), { params: Promise.resolve({ connectionId: c.id }) })).status).toBe(404);
    await worker(req('lead-intake/process', {}, ownerToken));
    expect((await db.leadSubmission.findUniqueOrThrow({ where: { id: row.id } })).status).toBe('pending');
    await db.leadConnection.update({ where: { id: c.id }, data: { enabled: true } });
    await worker(req('lead-intake/process', {}, ownerToken));
    expect(await db.lead.findFirst({ where: { organizationId } })).toMatchObject({ metadata: { formAnswers: { 'Preferred destination': 'Japan', 'Travel month': 'April' } } });
  });
  it('restricts salesperson lists, detail endpoints, encoded paths, settings and reassignment', async () => {
    const lead = await create(); const owner = salesIds.indexOf(lead.assignedToId!); const other = 1 - owner;
    const mine = await (await leads(req('leads', undefined, tokens[owner]))).json(); expect(mine.objects).toHaveLength(1);
    const theirs = await (await leads(req('leads', undefined, tokens[other]))).json(); expect(theirs.objects).toHaveLength(0);
    expect((await detail(req(`leads/${lead.id}`, undefined, tokens[other]), { params: Promise.resolve({ id: lead.id }) })).status).toBe(404);
    const encodedId = `%${lead.id.charCodeAt(0).toString(16)}${lead.id.slice(1)}`;
    expect((await detail(req(`leads/${encodedId}`, undefined, tokens[other]), { params: Promise.resolve({ id: lead.id }) })).status).toBe(404);
    expect((await settings(req('lead-intake', undefined, tokens[owner]))).status).toBe(403);
    expect((await qualify(req(`leads/${lead.id}/qualification`, { assignedToId: salesIds[other] }, tokens[owner], 'PATCH'), { params: Promise.resolve({ id: lead.id }) })).status).toBe(403);
    expect((await qualify(req(`leads/${lead.id}/qualification`, { temperature: 'hot', tags: ['VIP'], contacted: true }, tokens[owner], 'PATCH'), { params: Promise.resolve({ id: lead.id }) })).status).toBe(200);
  });
  it('keeps integration credentials encrypted and omitted from settings responses', async () => {
    expect((await connect(req('lead-intake', { name: 'Website', provider: 'website', webhookSecret: secret }, ownerToken))).status).toBe(201);
    const row = await db.leadConnection.findFirstOrThrow({ where: { organizationId } });
    expect(JSON.stringify(row.credentials)).not.toContain(secret);
    const response = await (await settings(req('lead-intake', undefined, ownerToken))).json();
    expect(JSON.stringify(response)).not.toContain(secret); expect(response.connections[0]).not.toHaveProperty('credentials');
  });
  it('rejects cross-agency lead reads and connection updates', async () => {
    const lead = await create(); const c = await connection();
    const otherOrg = await db.organization.create({ data: { name: 'Other agency', slug: `other-${randomUUID()}` } });
    try {
      await db.membership.create({ data: { organizationId: otherOrg.id, userId: ownerId, role: 'owner' } });
      const otherToken = await signAccessToken({ userId: ownerId, email: 'owner@example.test', organizationId: otherOrg.id, role: 'owner' });
      expect((await detail(req(`leads/${lead.id}`, undefined, otherToken), { params: Promise.resolve({ id: lead.id }) })).status).toBe(404);
      expect((await changeSettings(req('lead-intake', { action: 'connection', id: c.id, enabled: false }, otherToken, 'PATCH'))).status).toBe(404);
      expect((await db.leadConnection.findUniqueOrThrow({ where: { id: c.id } })).enabled).toBe(true);
    } finally { await db.organization.delete({ where: { id: otherOrg.id } }); }
  });
  it('processes an agency queue through the authenticated worker and rejects unauthorized runs', async () => {
    const c = await connection(); await receiveSubmission(c, 'worker', input('worker'));
    expect((await worker(req('lead-intake/process', {}))).status).toBe(401);
    expect((await worker(req('lead-intake/process', {}, ownerToken))).status).toBe(200);
    expect(await db.lead.count({ where: { organizationId } })).toBe(1);
  });
  it('enrols new Sales and Operator staff by default, including an omitted role, without enrolling Admin or Viewer', async () => {
    for (const role of ['sales', 'operator', undefined, 'admin', 'viewer']) {
      const response = await createStaff(req('users', { name: 'New test staff', email: `${randomUUID()}@example.test`, password: 'StrongTestPass123!', ...(role ? { role } : {}) }, ownerToken));
      const data = await response.json(); if (data.user?.id) userIds.push(data.user.id);
      expect(response.status).toBe(201);
      const membership = await db.membership.findUniqueOrThrow({ where: { organizationId_userId: { organizationId, userId: data.user.id } } });
      expect(membership.role).toBe(role || 'operator');
      expect(membership.receivesLeads).toBe(!role || ['sales', 'operator'].includes(role));
      expect(membership.availableForLeads).toBe(true);
    }
  });
  it('keeps explicit rotation opt-outs saved across settings reloads', async () => {
    const member = await db.membership.findFirstOrThrow({ where: { organizationId, userId: salesIds[0] } });
    expect((await changeSettings(req('lead-intake', { action: 'member', membershipId: member.id, receivesLeads: false, availableForLeads: false }, ownerToken, 'PATCH'))).status).toBe(200);
    for (let i = 0; i < 2; i++) {
      const data = await (await settings(req('lead-intake', undefined, ownerToken))).json();
      expect(data.members.find((m: any) => m.id === member.id)).toMatchObject({ receivesLeads: false, availableForLeads: false });
    }
    expect(await db.membership.findUnique({ where: { id: member.id } })).toMatchObject({ receivesLeads: false, availableForLeads: false });
  });
  it('migrates default-off staff while preserving recorded opt-outs, unavailable staff and non-sales roles', async () => {
    const scenarios = [
      { role: 'sales', available: true, recordedChoice: false, expected: true },
      { role: 'operator', available: true, recordedChoice: false, expected: true },
      { role: 'sales', available: true, recordedChoice: true, expected: false },
      { role: 'operator', available: false, recordedChoice: false, expected: false },
      { role: 'admin', available: true, recordedChoice: false, expected: false },
      { role: 'owner', available: true, recordedChoice: false, expected: false },
      { role: 'viewer', available: true, recordedChoice: false, expected: false },
    ];
    const memberships = [];
    for (const scenario of scenarios) {
      const user = await db.user.create({ data: { name: 'Migration test staff', email: `${randomUUID()}@example.test`, passwordHash: 'unused' } }); userIds.push(user.id);
      const membership = await db.membership.create({ data: { organizationId, userId: user.id, role: scenario.role, receivesLeads: false, availableForLeads: scenario.available } });
      if (scenario.recordedChoice) await db.auditLog.create({ data: { organizationId, actorUserId: ownerId, action: 'lead_intake.member', metadata: { membershipId: membership.id, receivesLeads: false, availableForLeads: true } } });
      memberships.push({ id: membership.id, ...scenario });
    }
    const migration = readFileSync('prisma/migrations/20261118130000_staff_rotation_defaults/migration.sql', 'utf8');
    await db.$executeRawUnsafe(migration);
    await db.$executeRawUnsafe(migration);
    for (const expected of memberships) expect(await db.membership.findUnique({ where: { id: expected.id } })).toMatchObject({ receivesLeads: expected.expected, availableForLeads: expected.available });
  });
});
