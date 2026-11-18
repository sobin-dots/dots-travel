import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { signAccessToken } from '@/lib/auth-tokens';
import { POST as create, GET as list } from '@/app/api/v1/contacts/route';
import { PATCH as update } from '@/app/api/v1/contacts/[id]/route';
import { POST as bulk } from '@/app/api/v1/contacts/bulk/route';
import { parseContactsCSV } from '@/lib/csv-parser';
import { createEnquiry } from '@/lib/lead-intake/service';
import { enquirySchema } from '@/lib/lead-intake/normalize';

const suite = process.env.LEAD_INTAKE_DATABASE_TESTS === '1' ? describe : describe.skip;
suite('Complete contact travel details and access controls', () => {
  let organizationId: string; let users: string[]; let ownerToken: string; let salesTokens: string[];
  const details = { name: 'Jane Customer', phone: '+91 (98765) 43210', email: 'JANE@Example.com', preferredTravelMonth: '2027-04', tourType: 'Family', numberOfChildren: 2,
    specialRequirements: 'Vegetarian meals\nAn accessible room', city: ' Chennai ', company: 'Example Company', notes: 'Repeat customer' };
  const req = (body?: object, token = ownerToken, path = 'contacts', method = 'POST') => new NextRequest(`http://localhost/api/v1/${path}`, { method: body ? method : 'GET', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const patch = (id: string, body: object, token = ownerToken) => update(req(body, token, `contacts/${id}`, 'PATCH'), { params: Promise.resolve({ id }) });
  const saved = async (extra = {}) => { const res = await create(req({ ...details, ...extra })); expect(res.status).toBe(201); return (await res.json()).contact; };
  beforeEach(async () => {
    const org = await db.organization.create({ data: { name: 'Contact details QA', slug: `contacts-${randomUUID()}` } }); organizationId = org.id; users = [];
    const tokens = [];
    for (const role of ['owner', 'sales', 'sales']) {
      const user = await db.user.create({ data: { name: role, email: `${randomUUID()}@example.test`, passwordHash: 'unused-test-password' } }); users.push(user.id);
      await db.membership.create({ data: { organizationId, userId: user.id, role } });
      tokens.push(await signAccessToken({ organizationId, userId: user.id, email: user.email, role }));
    }
    ownerToken = tokens[0]; salesTokens = tokens.slice(1);
  });
  afterEach(async () => { await db.organization.delete({ where: { id: organizationId } }); await db.user.deleteMany({ where: { id: { in: users } } }); });
  afterAll(async () => { await db.$disconnect(); });

  it('persists all eight fields and returns them on a fresh contact-directory request', async () => {
    const contact = await saved();
    const response = await list(req()); expect(response.status).toBe(200);
    expect((await response.json()).objects).toContainEqual(expect.objectContaining({ id: contact.id, name: details.name, phone: '+919876543210', email: 'jane@example.com',
      preferredTravelMonth: '2027-04', tourType: 'Family', numberOfChildren: 2, specialRequirements: details.specialRequirements, city: 'Chennai' }));
  });
  it('allows partial updates without erasing other travel preferences or existing company and notes', async () => {
    const contact = await saved();
    expect((await patch(contact.id, { city: 'Kochi', expectedUpdatedAt: contact.updatedAt })).status).toBe(200);
    expect(await db.contact.findUnique({ where: { id: contact.id } })).toMatchObject({ city: 'Kochi', preferredTravelMonth: '2027-04', tourType: 'Family', numberOfChildren: 2, company: 'Example Company', notes: 'Repeat customer' });
  });
  it('distinguishes zero children from unknown and permits clearing optional fields', async () => {
    const contact = await saved({ numberOfChildren: 0 });
    expect(contact.numberOfChildren).toBe(0);
    expect((await patch(contact.id, { preferredTravelMonth: '', tourType: '', specialRequirements: '', city: '', numberOfChildren: null })).status).toBe(200);
    expect(await db.contact.findUnique({ where: { id: contact.id } })).toMatchObject({ preferredTravelMonth: null, tourType: null, specialRequirements: null, city: null, numberOfChildren: null });
  });
  it('validates counts and months and rejects attempts to move a contact between agencies', async () => {
    const contact = await saved();
    for (const body of [{ numberOfChildren: -1 }, { numberOfChildren: 1.5 }, { preferredTravelMonth: '2027-13' }, { email: 'invalid' }, { organizationId: randomUUID() }]) expect((await patch(contact.id, body)).status).toBe(400);
    expect(await db.contact.findUnique({ where: { id: contact.id } })).toMatchObject({ organizationId, numberOfChildren: 2, preferredTravelMonth: '2027-04' });
  });
  it('supports email-only contacts and still prevents duplicate phone numbers', async () => {
    const first = await saved();
    expect((await create(req(details))).status).toBe(409);
    const second = await saved({ phone: '', email: 'second@example.com', numberOfChildren: 0 });
    expect(second.phone).toBeNull();
    expect((await patch(second.id, { phone: first.phone })).status).toBe(409);
    expect((await patch(second.id, { email: '', phone: '' })).status).toBe(400);
  });
  it('enforces salesperson assignment and agency isolation when updating contact details', async () => {
    const contact = await saved();
    await db.lead.create({ data: { organizationId, contactId: contact.id, assignedToId: users[1], title: 'Assigned trip', itinerary: '' } });
    expect((await patch(contact.id, { city: 'Mumbai' }, salesTokens[0])).status).toBe(200);
    expect((await patch(contact.id, { city: 'Unapproved change' }, salesTokens[1])).status).toBe(404);
    const other = await db.organization.create({ data: { name: 'Other agency', slug: `other-contact-${randomUUID()}` } });
    try {
      await db.membership.create({ data: { organizationId: other.id, userId: users[0], role: 'owner' } });
      const token = await signAccessToken({ organizationId: other.id, userId: users[0], email: 'owner@example.test', role: 'owner' });
      expect((await patch(contact.id, { city: 'Cross-agency change' }, token)).status).toBe(404);
    } finally { await db.organization.delete({ where: { id: other.id } }); }
    expect((await db.contact.findUniqueOrThrow({ where: { id: contact.id } })).city).toBe('Mumbai');
  });
  it('rejects stale edits instead of overwriting a newer contact update', async () => {
    const contact = await saved();
    expect((await patch(contact.id, { city: 'Delhi', expectedUpdatedAt: contact.updatedAt })).status).toBe(200);
    expect((await patch(contact.id, { city: 'Stale city', expectedUpdatedAt: contact.updatedAt })).status).toBe(409);
    expect((await db.contact.findUniqueOrThrow({ where: { id: contact.id } })).city).toBe('Delhi');
  });
  it('imports all travel fields from CSV, retaining zero children and reporting invalid months', async () => {
    const csv = 'Full name,Phone number,Email address,Preferred month of travel,Tour type,Number of children,Special requirements,City\nCSV Customer,+918765432109,csv@example.com,2027-05,Custom tour,0,Vegetarian meals,Kochi\nInvalid Month,+918765432108,bad@example.com,2027-13,Family,2,None,Delhi';
    const parsed = parseContactsCSV(csv); expect(parsed.validRows).toHaveLength(1); expect(parsed.invalidRows).toHaveLength(1);
    const response = await bulk(req({ contacts: parsed.validRows }, ownerToken, 'contacts/bulk')); expect(response.status).toBe(200);
    expect(await db.contact.findFirst({ where: { organizationId, phone: '+918765432109' } })).toMatchObject({ preferredTravelMonth: '2027-05', tourType: 'Custom tour', numberOfChildren: 0, specialRequirements: 'Vegetarian meals', city: 'Kochi' });
  });
  it('retains canonical form preferences on a new contact without overwriting an existing contact on repeat enquiries', async () => {
    const input = enquirySchema.parse({ ...details, phone: '+919876543210', submissionId: 'first', formId: 'trip', formName: 'Travel form' });
    const lead = await db.$transaction(tx => createEnquiry(tx, organizationId, 'website', input));
    expect(await db.contact.findUnique({ where: { id: lead.contactId! } })).toMatchObject({ preferredTravelMonth: '2027-04', numberOfChildren: 2, city: 'Chennai' });
    await db.$transaction(tx => createEnquiry(tx, organizationId, 'website', { ...input, preferredTravelMonth: '2027-06', city: 'Delhi', submissionId: 'second' }));
    expect(await db.contact.findUnique({ where: { id: lead.contactId! } })).toMatchObject({ preferredTravelMonth: '2027-04', city: 'Chennai' });
    expect(await db.lead.count({ where: { organizationId, contactId: lead.contactId } })).toBe(2);
  });
});
