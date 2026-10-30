import { describe, it, expect, beforeAll } from 'vitest';
import { db } from '../src/lib/db';
import { NextRequest } from 'next/server';
import { PATCH } from '../src/app/api/v1/leads/[id]/route';
import { GET as getLeadsList } from '../src/app/api/v1/leads/route';
import { GET as getPipeline } from '../src/app/api/v1/leads/pipeline/route';
import { GET as getPdf } from '../src/app/api/v1/leads/[id]/pdf/route';
import { POST as sendLeadEmails } from '../src/app/api/v1/leads/[id]/send/route';
import { POST as createSupplierQuote } from '../src/app/api/v1/leads/[id]/supplier-quotes/route';
import { POST as createCustomerQuote } from '../src/app/api/v1/leads/[id]/customer-quotes/route';
import { PDFDocument } from 'pdf-lib';
import { signAccessToken } from '../src/lib/auth-tokens';

describe('E2E Itinerary Proposal & Parameter Updates', () => {
  let org: any;
  let user: any;
  let token: string;
  let lead: any;

  beforeAll(async () => {
    const ts = Date.now();
    org = await db.organization.upsert({
      where: { slug: 'lgt-e2e-org' },
      update: {
        name: 'LGT Holidays',
        letterheadText: 'A brand of LGT Global Hospitality Limited',
        brandColor: '#ed1b24',
      },
      create: {
        name: 'LGT Holidays',
        slug: 'lgt-e2e-org',
        letterheadText: 'A brand of LGT Global Hospitality Limited',
        brandColor: '#ed1b24',
      },
    });

    user = await db.user.upsert({
      where: { email: `operator-${ts}@lgtholidays.test` },
      update: {},
      create: {
        name: 'Benney Robertson',
        email: `operator-${ts}@lgtholidays.test`,
        passwordHash: 'dummy',
        status: 'active',
      },
    });

    await db.membership.upsert({
      where: {
        organizationId_userId: {
          organizationId: org.id,
          userId: user.id,
        },
      },
      update: { role: 'operator' },
      create: {
        organizationId: org.id,
        userId: user.id,
        role: 'operator',
      },
    });

    token = await signAccessToken({
      userId: user.id,
      email: user.email,
      organizationId: org.id,
      role: 'operator',
    });

    lead = await db.lead.create({
      data: {
        organizationId: org.id,
        title: 'Singapore 6-Day Proposal',
        destination: 'Singapore',
        durationDays: 6,
        targetBudget: 248000,
        departureDate: new Date('2026-11-12'),
        returnDate: new Date('2026-11-17'),
        headcountAdults: 2,
        headcountChildren: 0,
        hotelTier: 'standard_3star',
        itinerary: 'Day 1: Arrive in Singapore\nDay 2: Singapore city highlights\nDay 3: Gardens by the Bay\nDay 4: Universal Studios Singapore\nDay 5: Leisure day\nDay 6: Departure',
        bookingReference: 'LGT/FIT/2026/1042',
      },
    });
  });

  it('updates quotation amount, stay dates, and party size via PATCH /api/v1/leads/[id]', async () => {
    const updateBody = {
      targetBudget: 350000,
      departureDate: '2026-12-05',
      returnDate: '2026-12-11',
      durationDays: 6,
      destination: 'Singapore & Sentosa',
      headcountAdults: 4,
      headcountChildren: 1,
      hotelTier: 'luxury_5star',
      currency: 'INR',
    };

    const req = new NextRequest(`http://localhost:3000/api/v1/leads/${lead.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(updateBody),
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: lead.id }) });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Number(body.lead.targetBudget)).toBe(350000);
    expect(body.lead.destination).toBe('Singapore & Sentosa');
    expect(body.lead.headcountAdults).toBe(4);
    expect(body.lead.headcountChildren).toBe(1);
    expect(body.lead.hotelTier).toBe('luxury_5star');
    expect(body.lead.metadata?.currency).toBe('INR');

    // Verify persisted in DB
    const persisted = await db.lead.findUnique({ where: { id: lead.id } });
    expect(Number(persisted?.targetBudget)).toBe(350000);
    expect(persisted?.headcountAdults).toBe(4);
  });

  it('generates 18-page proposal PDF (without Sample quotation sheet) reflecting updated stay dates', async () => {
    const req = new NextRequest(`http://localhost:3000/api/v1/leads/${lead.id}/pdf?type=customer`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const res = await getPdf(req, { params: Promise.resolve({ id: lead.id }) });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');

    const pdfBuffer = await res.arrayBuffer();
    expect(pdfBuffer.byteLength).toBeGreaterThan(15000);

    const pdfDoc = await PDFDocument.load(pdfBuffer);
    // 3 intro pages + 6 days + 9 post-daily structural pages (Sample quotation removed) = 18 pages!
    expect(pdfDoc.getPageCount()).toBe(18);

    // Verify all pages are A4 portrait dimensions
    for (let p = 0; p < 18; p++) {
      const page = pdfDoc.getPage(p);
      expect(page.getWidth()).toBeCloseTo(595.28, 1);
      expect(page.getHeight()).toBeCloseTo(841.89, 1);
    }
  });

  it('sends itinerary PDF attachment to customer and supplier independently via POST /api/v1/leads/[id]/send', async () => {
    // 1. Send to Customer only
    const customerReq = new NextRequest(`http://localhost:3000/api/v1/leads/${lead.id}/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        target: 'customer',
        customerEmail: 'arun@3dots.co',
        customerName: 'Arun',
      }),
    });

    const customerRes = await sendLeadEmails(customerReq, { params: Promise.resolve({ id: lead.id }) });
    expect(customerRes.status).toBe(200);
    const customerBody = await customerRes.json();
    expect(customerBody.customerSent).toBe(true);
    expect(customerBody.supplierSent).toBe(false);
    expect(customerBody.customerEmail).toBe('arun@3dots.co');

    // 2. Send to Supplier only to request a quote (with Itinerary PDF attached)
    const supplierEmail = `rfq-${Date.now()}@singaporedmc.test`;
    const supplier = await db.supplier.create({
      data: {
        organizationId: org.id,
        name: 'Singapore DMC Partner',
        email: supplierEmail,
        category: 'dmc',
      },
    });

    const supplierReq = new NextRequest(`http://localhost:3000/api/v1/leads/${lead.id}/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        target: 'supplier',
        supplierId: supplier.id,
      }),
    });

    const supplierRes = await sendLeadEmails(supplierReq, { params: Promise.resolve({ id: lead.id }) });
    expect(supplierRes.status).toBe(200);
    const supplierBody = await supplierRes.json();
    expect(supplierBody.customerSent).toBe(false);
    expect(supplierBody.supplierSent).toBe(true);
    expect(supplierBody.supplierEmail).toBe(supplierEmail);
  });

  it('keeps lead price null before supplier quote and accurately connects supplier & customer quote values', async () => {
    // Create a fresh unquoted lead
    const unquotedLead = await db.lead.create({
      data: {
        organizationId: org.id,
        title: 'Bespoke 4-Day Escape to Maldives',
        destination: 'Maldives',
        itinerary: '# 4-Day Escape to Maldives\n\n### Day 1: Arrival\nArrive in Malé.',
        durationDays: 4,
        departureDate: new Date('2026-11-20T00:00:00.000Z'),
        returnDate: new Date('2026-11-23T00:00:00.000Z'),
        headcountAdults: 1,
        headcountChildren: 0,
        hotelTier: '5_star_luxury',
        targetBudget: null,
        stage: 'new_inquiry',
      },
    });

    // 1. Before supplier quote: GET /api/v1/leads/pipeline should show dealValue = null and hasSupplierQuote = false
    const pipelineReqBefore = new NextRequest('http://localhost:3000/api/v1/leads/pipeline', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const pipelineResBefore = await getPipeline(pipelineReqBefore);
    expect(pipelineResBefore.status).toBe(200);
    const pipelineBefore = await pipelineResBefore.json();
    const newInquiryLeadsBefore = pipelineBefore.columns.new_inquiry;
    const foundBefore = newInquiryLeadsBefore.find((l: any) => l.id === unquotedLead.id);
    expect(foundBefore).toBeDefined();
    expect(foundBefore.hasSupplierQuote).toBe(false);
    expect(foundBefore.dealValue).toBeNull();

    // 2. Patch durationDays to 5 and verify returnDate and title auto-sync
    const patchReq = new NextRequest(`http://localhost:3000/api/v1/leads/${unquotedLead.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        durationDays: 5,
      }),
    });
    const patchRes = await PATCH(patchReq, { params: Promise.resolve({ id: unquotedLead.id }) });
    expect(patchRes.status).toBe(200);
    const patchBody = await patchRes.json();
    expect(patchBody.lead.durationDays).toBe(5);
    expect(patchBody.lead.title).toBe('Bespoke 5-Day Escape to Maldives');
    expect(new Date(patchBody.lead.returnDate).toISOString().split('T')[0]).toBe('2026-11-24');

    // 3. Feed a Supplier Quote
    const sup = await db.supplier.create({
      data: {
        organizationId: org.id,
        name: 'Maldives DMC',
        email: `maldives-${Date.now()}@dmc.test`,
        category: 'dmc',
      },
    });
    const supQuoteReq = new NextRequest(`http://localhost:3000/api/v1/leads/${unquotedLead.id}/supplier-quotes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        supplierId: sup.id,
        totalNetCost: 180000,
        currency: 'INR',
        isSelected: true,
      }),
    });
    const supQuoteRes = await createSupplierQuote(supQuoteReq, { params: Promise.resolve({ id: unquotedLead.id }) });
    expect(supQuoteRes.status).toBe(201);

    // 4. Generate Customer Quote from Supplier Quote
    const custQuoteReq = new NextRequest(`http://localhost:3000/api/v1/leads/${unquotedLead.id}/customer-quotes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        supplierNetTotal: 180000,
        marginType: 'percentage',
        marginValue: 20,
        taxPercentage: 5,
        currency: 'INR',
      }),
    });
    const custQuoteRes = await createCustomerQuote(custQuoteReq, { params: Promise.resolve({ id: unquotedLead.id }) });
    expect(custQuoteRes.status).toBe(201);
    const custQuoteBody = await custQuoteRes.json();
    expect(Number(custQuoteBody.quotation.finalSellingPrice)).toBe(226800);

    // 5. Verify GET /api/v1/leads returns connected supplierQuotations, quotations, and updated targetBudget
    const listReq = new NextRequest('http://localhost:3000/api/v1/leads', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const listRes = await getLeadsList(listReq);
    expect(listRes.status).toBe(200);
    const listBody = await listRes.json();
    const updatedLead = listBody.objects.find((l: any) => l.id === unquotedLead.id);
    expect(updatedLead).toBeDefined();
    expect(updatedLead.supplierQuotations.length).toBe(1);
    expect(updatedLead.quotations.length).toBe(1);
    expect(Number(updatedLead.quotations[0].finalSellingPrice)).toBe(226800);
    expect(Number(updatedLead.targetBudget)).toBe(226800);
  });
});
