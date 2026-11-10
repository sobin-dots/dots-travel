import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../src/lib/db';
import { signAccessToken } from '../src/lib/auth-tokens';
import { NextRequest } from 'next/server';
import { normalizePhoneNumber, parseContactsCSV, parseCSVText, getSampleContactsCSV } from '../src/lib/csv-parser';
import { POST as bulkImportContacts } from '../src/app/api/v1/contacts/bulk/route';

describe('Bulk CSV Contacts Upload & Normalization', () => {
  let orgA: any;
  let orgB: any;
  let userA: any;
  let tokenA: string;

  beforeAll(async () => {
    orgA = await db.organization.upsert({
      where: { slug: 'test-bulk-contacts-a' },
      update: {},
      create: { name: 'Bulk Contacts Org A', slug: 'test-bulk-contacts-a' },
    });

    orgB = await db.organization.upsert({
      where: { slug: 'test-bulk-contacts-b' },
      update: {},
      create: { name: 'Bulk Contacts Org B', slug: 'test-bulk-contacts-b' },
    });

    userA = await db.user.upsert({
      where: { email: 'operator-bulk-a@test.local' },
      update: {},
      create: {
        email: 'operator-bulk-a@test.local',
        name: 'Bulk Operator A',
        passwordHash: 'dummyhash',
      },
    });

    await db.membership.upsert({
      where: {
        organizationId_userId: {
          organizationId: orgA.id,
          userId: userA.id,
        },
      },
      update: { role: 'operator' },
      create: {
        organizationId: orgA.id,
        userId: userA.id,
        role: 'operator',
      },
    });

    await db.membership.upsert({
      where: {
        organizationId_userId: {
          organizationId: orgB.id,
          userId: userA.id,
        },
      },
      update: { role: 'operator' },
      create: {
        organizationId: orgB.id,
        userId: userA.id,
        role: 'operator',
      },
    });

    tokenA = await signAccessToken({
      userId: userA.id,
      email: userA.email,
      organizationId: orgA.id,
      role: 'operator',
    });
  });

  afterAll(async () => {
    await db.contact.deleteMany({
      where: { organizationId: { in: [orgA.id, orgB.id] } },
    });
    await db.membership.deleteMany({
      where: { organizationId: { in: [orgA.id, orgB.id] } },
    });
    await db.organization.deleteMany({
      where: { id: { in: [orgA.id, orgB.id] } },
    });
    await db.$disconnect();
  });

  describe('1. Phone Number Normalization', () => {
    it('preserves valid standard E.164 phone numbers', () => {
      expect(normalizePhoneNumber('+919876543210')).toBe('+919876543210');
      expect(normalizePhoneNumber('+14155550199')).toBe('+14155550199');
      expect(normalizePhoneNumber('+447911123456')).toBe('+447911123456');
    });

    it('strips spaces, brackets, hyphens, and dots', () => {
      expect(normalizePhoneNumber('+91 98765-43210')).toBe('+919876543210');
      expect(normalizePhoneNumber('+1 (415) 555-0199')).toBe('+14155550199');
      expect(normalizePhoneNumber('+91.98765.43210')).toBe('+919876543210');
    });

    it('prepends default +91 for 10-digit Indian numbers without country code', () => {
      expect(normalizePhoneNumber('9876543210')).toBe('+919876543210');
      expect(normalizePhoneNumber('8765432109')).toBe('+918765432109');
    });

    it('converts leading 0 on 11-digit numbers to +91', () => {
      expect(normalizePhoneNumber('09876543210')).toBe('+919876543210');
    });

    it('prepends + on 12-digit numbers starting with 91', () => {
      expect(normalizePhoneNumber('919876543210')).toBe('+919876543210');
    });

    it('replaces international access code 00 with +', () => {
      expect(normalizePhoneNumber('00919876543210')).toBe('+919876543210');
    });

    it('supports custom defaultCountryCode', () => {
      expect(normalizePhoneNumber('4155550199', '+1')).toBe('+14155550199');
      expect(normalizePhoneNumber('7911123456', '+44')).toBe('+447911123456');
    });

    it('rejects clearly invalid strings', () => {
      expect(normalizePhoneNumber('123')).toBeNull();
      expect(normalizePhoneNumber('not-a-number')).toBeNull();
      expect(normalizePhoneNumber('')).toBeNull();
    });
  });

  describe('2. CSV Parsing & Column Alias Resolution', () => {
    it('parses RFC 4180 CSV with quotes and commas', () => {
      const csv = `"Name","Phone","Company"\r\n"Doe, John","+919876543210","Acme, Inc."\r\n"Jane Smith","9823456789","Tech Corp"`;
      const result = parseContactsCSV(csv);

      expect(result.totalRows).toBe(2);
      expect(result.validRows.length).toBe(2);
      expect(result.validRows[0].name).toBe('Doe, John');
      expect(result.validRows[0].phone).toBe('+919876543210');
      expect(result.validRows[0].company).toBe('Acme, Inc.');
      expect(result.validRows[1].phone).toBe('+919823456789');
    });

    it('resolves flexible header aliases (Full Name, Mobile Number, Email Address)', () => {
      const csv = `Full Name,Mobile Number,Email Address,Organization,Remarks
Aarav Sharma,9876543210,aarav@test.com,Sharma Tours,VIP customer
Priya Patel,9823456789,priya@test.com,Patel & Co,Pongal holiday`;

      const result = parseContactsCSV(csv);
      expect(result.validRows.length).toBe(2);
      expect(result.validRows[0].name).toBe('Aarav Sharma');
      expect(result.validRows[0].phone).toBe('+919876543210');
      expect(result.validRows[0].email).toBe('aarav@test.com');
      expect(result.validRows[0].company).toBe('Sharma Tours');
      expect(result.validRows[0].notes).toBe('VIP customer');
    });

    it('flags rows with missing names or invalid phones as invalid without throwing', () => {
      const csv = `Name,Phone,Email
A,+919876543210,valid@test.com
Valid Customer,invalid-phone,valid@test.com
Good Customer,9876543210,good@test.com`;

      const result = parseContactsCSV(csv);
      expect(result.totalRows).toBe(3);
      expect(result.validRows.length).toBe(1);
      expect(result.invalidRows.length).toBe(2);
      expect(result.invalidRows[0].error).toContain('Name must be at least 2 characters');
      expect(result.invalidRows[1].error).toContain('Invalid phone number format');
    });

    it('generates a valid downloadable sample CSV', () => {
      const sample = getSampleContactsCSV();
      expect(sample).toContain('Name,Phone,Email,Company,Notes');
      const parsed = parseContactsCSV(sample);
      expect(parsed.validRows.length).toBeGreaterThanOrEqual(4);
      expect(parsed.invalidRows.length).toBe(0);
    });
  });

  describe('3. POST /api/v1/contacts/bulk API Endpoint', () => {
    it('successfully bulk imports contacts and skips duplicates in database', async () => {
      // Pre-seed an existing contact in Org A
      const existingPhone = '+919999900001';
      await db.contact.create({
        data: {
          organizationId: orgA.id,
          name: 'Existing Client One',
          phone: existingPhone,
        },
      });

      const payload = {
        defaultCountryCode: '+91',
        contacts: [
          {
            name: 'New Client Alpha',
            phone: '9876500001', // Normalizes to +919876500001
            email: 'alpha@test.com',
            company: 'Alpha Corp',
          },
          {
            name: 'New Client Beta',
            phone: '+919876500002',
            company: 'Beta Ltd',
          },
          {
            name: 'Attempt Duplicate Client',
            phone: existingPhone, // Must be skipped!
            email: 'dup@test.com',
          },
          {
            name: 'Duplicate In Same Batch',
            phone: '9876500001', // Repeated phone within same upload!
          },
        ],
      };

      const req = new NextRequest('http://localhost:3000/api/v1/contacts/bulk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify(payload),
      });

      const res = await bulkImportContacts(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.importedCount).toBe(2); // Alpha and Beta
      expect(json.skippedCount).toBe(2); // existing in DB + duplicate in same batch
      expect(json.totalSubmitted).toBe(4);

      // Verify in database
      const dbAlpha = await db.contact.findUnique({
        where: {
          organizationId_phone: {
            organizationId: orgA.id,
            phone: '+919876500001',
          },
        },
      });
      expect(dbAlpha).not.toBeNull();
      expect(dbAlpha?.name).toBe('New Client Alpha');
      expect(dbAlpha?.company).toBe('Alpha Corp');

      const dbBeta = await db.contact.findUnique({
        where: {
          organizationId_phone: {
            organizationId: orgA.id,
            phone: '+919876500002',
          },
        },
      });
      expect(dbBeta).not.toBeNull();

      // Ensure original pre-seeded contact was not overwritten
      const dbExisting = await db.contact.findUnique({
        where: {
          organizationId_phone: {
            organizationId: orgA.id,
            phone: existingPhone,
          },
        },
      });
      expect(dbExisting?.name).toBe('Existing Client One');
    });

    it('enforces tenant isolation: importing phone in Org A does not conflict with Org B', async () => {
      const sharedPhone = '+919888800001';

      // Import in Org A
      const reqA = new NextRequest('http://localhost:3000/api/v1/contacts/bulk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({
          contacts: [{ name: 'Org A Customer', phone: sharedPhone }],
        }),
      });

      const resA = await bulkImportContacts(reqA);
      expect(resA.status).toBe(200);

      // Now create token for Org B and import identical phone in Org B
      const tokenB = await signAccessToken({
        userId: userA.id,
        email: userA.email,
        organizationId: orgB.id,
        role: 'operator',
      });

      const reqB = new NextRequest('http://localhost:3000/api/v1/contacts/bulk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenB}`,
        },
        body: JSON.stringify({
          contacts: [{ name: 'Org B Customer', phone: sharedPhone }],
        }),
      });

      const resB = await bulkImportContacts(reqB);
      const jsonB = await resB.json();

      expect(resB.status).toBe(200);
      expect(jsonB.importedCount).toBe(1);

      // Both contacts exist independently in their respective organizations
      const inOrgA = await db.contact.findUnique({
        where: { organizationId_phone: { organizationId: orgA.id, phone: sharedPhone } },
      });
      const inOrgB = await db.contact.findUnique({
        where: { organizationId_phone: { organizationId: orgB.id, phone: sharedPhone } },
      });

      expect(inOrgA?.name).toBe('Org A Customer');
      expect(inOrgB?.name).toBe('Org B Customer');
    });

    it('rejects payloads exceeding the 1,000 batch size limit', async () => {
      const overlimit = Array.from({ length: 1005 }, (_, i) => ({
        name: `Customer ${i}`,
        phone: `+91980000${String(i).padStart(4, '0')}`,
      }));

      const req = new NextRequest('http://localhost:3000/api/v1/contacts/bulk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({ contacts: overlimit }),
      });

      const res = await bulkImportContacts(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.api_id).toBe('limit_exceeded');
    });
  });
});
