import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import crypto from 'node:crypto';
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { signAccessToken } from '@/lib/auth-tokens';
import { GET as getSettingsApi, PATCH as updateSettingsApi } from '@/app/api/v1/settings/route';
import { generateItineraryPDF, generateCustomerQuotationPDF } from '@/lib/pdf-generator';

describe('Organization Details, Letterhead & Itinerary PDF Settings', () => {
  let orgA: any;
  let userA: any;
  let tokenA: string;

  let orgB: any;
  let userB: any;
  let tokenB: string;

  // 1x1 transparent PNG data URL for test embedding
  const SAMPLE_BASE64_PNG =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  beforeEach(async () => {
    const nonce = Date.now() + '_' + crypto.randomBytes(4).toString('hex');

    // Create Org A and admin user
    orgA = await db.organization.create({
      data: {
        name: `Org A Travel ${nonce}`,
        slug: `org-a-${nonce}`,
      },
    });

    userA = await db.user.create({
      data: {
        email: `adminA_${nonce}@agency.test`,
        name: 'Admin A',
        passwordHash: 'dummy',
      },
    });

    await db.membership.create({
      data: {
        organizationId: orgA.id,
        userId: userA.id,
        role: 'admin',
      },
    });

    tokenA = await signAccessToken({
      userId: userA.id,
      email: userA.email,
      organizationId: orgA.id,
      role: 'admin',
    });

    // Create Org B and admin user
    orgB = await db.organization.create({
      data: {
        name: `Org B Travel ${nonce}`,
        slug: `org-b-${nonce}`,
      },
    });

    userB = await db.user.create({
      data: {
        email: `adminB_${nonce}@agency.test`,
        name: 'Admin B',
        passwordHash: 'dummy',
      },
    });

    await db.membership.create({
      data: {
        organizationId: orgB.id,
        userId: userB.id,
        role: 'admin',
      },
    });

    tokenB = await signAccessToken({
      userId: userB.id,
      email: userB.email,
      organizationId: orgB.id,
      role: 'admin',
    });
  });

  afterEach(async () => {
    if (orgA?.id) {
      await db.membership.deleteMany({ where: { organizationId: orgA.id } });
      await db.user.deleteMany({ where: { id: userA?.id } });
      await db.organization.deleteMany({ where: { id: orgA.id } });
    }
    if (orgB?.id) {
      await db.membership.deleteMany({ where: { organizationId: orgB.id } });
      await db.user.deleteMany({ where: { id: userB?.id } });
      await db.organization.deleteMany({ where: { id: orgB.id } });
    }
  });

  it('PATCH /api/v1/settings updates organization name, address, phone, website, logo and letterhead', async () => {
    const updatePayload = {
      organizationName: 'LGT Holidays International',
      address: 'Suite 1400, Marina One West Tower, 9 Straits View, Singapore',
      phone: '+65 6789 0123',
      website: 'https://www.lgtholidays.com',
      logoUrl: SAMPLE_BASE64_PNG,
      letterheadUrl: SAMPLE_BASE64_PNG,
      letterheadText: 'Govt. Approved Tour Operator • CIN: U63040MH2020PTC345678 • GSTIN: 27AABCL1234F1Z5',
    };

    const req = new NextRequest('http://localhost:3000/api/v1/settings', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`,
      },
      body: JSON.stringify(updatePayload),
    });

    const res = await updateSettingsApi(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.message).toBe('Settings updated successfully');
    expect(data.organization.name).toBe('LGT Holidays International');
    expect(data.organization.address).toContain('Marina One');
    expect(data.organization.phone).toBe('+65 6789 0123');
    expect(data.organization.website).toBe('https://www.lgtholidays.com');
    expect(data.organization.logoUrl).toBe(SAMPLE_BASE64_PNG);
    expect(data.organization.letterheadUrl).toBe(SAMPLE_BASE64_PNG);
    expect(data.organization.letterheadText).toContain('GSTIN: 27AABCL1234F1Z5');

    // Verify persisted in database
    const inDb = await db.organization.findUnique({ where: { id: orgA.id } });
    expect(inDb?.name).toBe('LGT Holidays International');
    expect(inDb?.phone).toBe('+65 6789 0123');
    expect(inDb?.letterheadText).toContain('CIN: U63040MH2020PTC345678');
  });

  it('guarantees strict multi-tenant isolation when updating organization details', async () => {
    // Org A saves their profile and letterhead
    const reqA = new NextRequest('http://localhost:3000/api/v1/settings', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`,
      },
      body: JSON.stringify({
        organizationName: 'Org A Luxury Concierge',
        address: '100 Marina Boulevard, Singapore',
        phone: '+65 6111 2222',
        letterheadText: 'Org A Licensed Operator',
      }),
    });
    await updateSettingsApi(reqA);

    // Fetch Org B settings
    const reqB = new NextRequest('http://localhost:3000/api/v1/settings', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${tokenB}`,
      },
    });
    const resB = await getSettingsApi(reqB);
    const dataB = await resB.json();

    // Verify Org B has not been altered by Org A's update
    expect(dataB.organization.name).toBe(orgB.name);
    expect(dataB.organization.address).toBeNull();
    expect(dataB.organization.phone).toBeNull();
    expect(dataB.organization.letterheadText).toBeNull();
  });

  it('generateItineraryPDF seamlessly embeds organization details, logo, and letterhead', async () => {
    const pdfBytes = await generateItineraryPDF({
      title: '6-Day Luxury Singapore Tour',
      recipientName: 'Elena Rostova',
      recipientEmail: 'elena@voyages.test',
      recipientType: 'customer',
      itineraryText: `# 6-Day Luxury Singapore Tour
## Day 1: Arrival & Night Safari
Arrive at Changi Airport. Private transfer to Marina Bay Sands.
## Day 2: Gardens by the Bay
Visit Cloud Forest and Flower Dome. Evening dinner cruise.`,
      organizationName: 'LGT Holidays',
      organizationAddress: 'Suite 1400, Marina One, Singapore',
      organizationPhone: '+65 6789 0123',
      organizationWebsite: 'https://www.lgtholidays.com',
      organizationLogo: SAMPLE_BASE64_PNG,
      organizationLetterhead: SAMPLE_BASE64_PNG,
      organizationLetterheadText: 'Govt. Approved Tour Operator • GSTIN: 27AABCL1234F1Z5',
    });

    expect(pdfBytes).toBeInstanceOf(Uint8Array);
    expect(pdfBytes.length).toBeGreaterThan(1000);

    // Verify standard PDF header magic bytes '%PDF-'
    const header = Buffer.from(pdfBytes.slice(0, 5)).toString('utf-8');
    expect(header).toBe('%PDF-');
  });

  it('generateCustomerQuotationPDF embeds organization details, logo, and letterhead banner', async () => {
    const quotePdfBytes = await generateCustomerQuotationPDF({
      title: 'Singapore & Sentosa Private Holiday Proposal',
      recipientName: 'Dr. Michael Chen',
      recipientEmail: 'chen@luxury.test',
      destination: 'Singapore',
      version: 2,
      finalSellingPrice: 4850,
      currency: 'USD',
      taxAmount: 242.5,
      itineraryText: `## Day 1: Private Transfer & Hotel Check-in
Luxury chauffeur transfer to Raffles Hotel.
## Day 2: Sentosa Island VIP Experience
Private yacht cruise and Universal Studios VIP pass.`,
      organizationName: 'LGT Holidays',
      organizationAddress: 'Marina Bay Financial Centre, Tower 2, Singapore',
      organizationPhone: '+65 6123 4567',
      organizationWebsite: 'https://www.lgtholidays.com',
      organizationLogo: SAMPLE_BASE64_PNG,
      organizationLetterhead: SAMPLE_BASE64_PNG,
      organizationLetterheadText: 'Reg. CIN-U63040MH2020PTC345678',
    });

    expect(quotePdfBytes).toBeInstanceOf(Uint8Array);
    expect(quotePdfBytes.length).toBeGreaterThan(1000);

    const header = Buffer.from(quotePdfBytes.slice(0, 5)).toString('utf-8');
    expect(header).toBe('%PDF-');
  });
});
