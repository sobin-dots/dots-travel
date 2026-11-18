import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { signAccessToken } from '@/lib/auth-tokens';
import { GET as getPipeline } from '@/app/api/v1/leads/pipeline/route';
import { computePipelineKpis, getActiveCustomerQuotation, getLeadMarginAmount, getLeadQuotedPrice } from '@/lib/pipeline-metrics';

describe('Pipeline metrics and possible income calculation', () => {
  it('picks accepted or highest non-cancelled quotation version per lead', () => {
    const leadWithVersions = {
      quotations: [
        { version: 1, status: 'revised', marginAmount: '15000.00', finalSellingPrice: '165000.00' },
        { version: 2, status: 'sent', marginAmount: new Prisma.Decimal('22500.50'), finalSellingPrice: '172500.50' },
        { version: 3, status: 'cancelled', marginAmount: '99999.00', finalSellingPrice: '250000.00' },
      ],
    };

    expect(getActiveCustomerQuotation(leadWithVersions)?.version).toBe(2);
    expect(getLeadMarginAmount(leadWithVersions)).toBe(22500.5);

    const leadWithAcceptedOlderVersion = {
      quotations: [
        { version: 1, status: 'accepted', marginAmount: 18000, finalSellingPrice: 150000 },
        { version: 2, status: 'draft', marginAmount: 35000, finalSellingPrice: 185000 },
      ],
    };
    expect(getActiveCustomerQuotation(leadWithAcceptedOlderVersion)?.version).toBe(1);
    expect(getLeadMarginAmount(leadWithAcceptedOlderVersion)).toBe(18000);
  });

  it('sums active pipeline margins into possibleIncome while excluding Closed / Lost deals', () => {
    const leads = [
      {
        stage: 'negotiation',
        status: 'approved',
        supplierQuotations: [{ status: 'selected', totalNetCost: 1500000 }],
        quotations: [
          { version: 2, status: 'draft', marginAmount: '120000.00', finalSellingPrice: '1800000.00' },
          { version: 1, status: 'revised', marginAmount: '80000.00', finalSellingPrice: '1650000.00' },
        ],
      },
      {
        stage: 'quote_sent',
        status: 'sent_to_customer',
        supplierQuotations: [{ status: 'received', totalNetCost: 200000 }],
        quotations: [{ version: 1, status: 'sent', marginAmount: 30000.25, finalSellingPrice: 241500.26 }],
      },
      {
        stage: 'confirmed',
        status: 'converted',
        supplierQuotations: [{ status: 'selected', totalNetCost: 100000 }],
        quotations: [{ version: 1, status: 'accepted', marginAmount: 25000.1, finalSellingPrice: 131250 }],
      },
      {
        stage: 'lost',
        status: 'draft',
        supplierQuotations: [{ status: 'selected', totalNetCost: 85000 }],
        quotations: [{ version: 1, status: 'sent', marginAmount: 12881, finalSellingPrice: 97881 }],
      },
      {
        stage: 'new_inquiry',
        status: 'draft',
        supplierQuotations: [],
        quotations: [],
      },
    ];

    const kpis = computePipelineKpis(leads);
    expect(kpis).toEqual({
      activeLeadsCount: 4,
      activePipelineValue: 2172750.26,
      possibleIncome: 175000.35,
      confirmedRevenue: 131250,
    });
    expect(getLeadQuotedPrice(leads[4])).toBeNull();
    expect(getLeadMarginAmount(leads[4])).toBeNull();
  });
});

const dbSuite = process.env.LEAD_INTAKE_DATABASE_TESTS === '1' ? describe : describe.skip;

dbSuite('Pipeline API possible income summary', () => {
  let organizationId: string;
  let userId: string;
  let token: string;

  beforeEach(async () => {
    const org = await db.organization.create({
      data: { name: 'Margin KPI Agency', slug: `margin-kpi-${randomUUID()}` },
    });
    organizationId = org.id;
    const user = await db.user.create({
      data: { name: 'Owner', email: `${randomUUID()}@example.test`, passwordHash: 'unused', status: 'active' },
    });
    userId = user.id;
    await db.membership.create({ data: { organizationId, userId, role: 'owner' } });
    token = await signAccessToken({ userId, email: user.email, organizationId, role: 'owner' });
  });

  afterEach(async () => {
    await db.organization.deleteMany({ where: { id: organizationId } });
    await db.user.deleteMany({ where: { id: userId } });
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it('aggregates organization quotation margins for active pipeline deals only', async () => {
    const activeLead = await db.lead.create({
      data: { organizationId, title: 'Dubai Active', destination: 'Dubai', stage: 'negotiation', itinerary: '' },
    });
    const lostLead = await db.lead.create({
      data: { organizationId, title: 'Lost Trip', destination: 'Paris', stage: 'lost', itinerary: '' },
    });

    await db.customerQuotation.createMany({
      data: [
        {
          organizationId,
          leadId: activeLead.id,
          version: 1,
          status: 'revised',
          currency: 'INR',
          supplierNetTotal: 100000,
          marginType: 'percentage',
          marginValue: 10,
          marginAmount: 10000,
          finalSellingPrice: 115500,
        },
        {
          organizationId,
          leadId: activeLead.id,
          version: 2,
          status: 'sent',
          currency: 'INR',
          supplierNetTotal: 100000,
          marginType: 'fixed_dollar',
          marginValue: 25000,
          marginAmount: 25000,
          finalSellingPrice: 131250,
        },
        {
          organizationId,
          leadId: lostLead.id,
          version: 1,
          status: 'sent',
          currency: 'INR',
          supplierNetTotal: 50000,
          marginType: 'percentage',
          marginValue: 20,
          marginAmount: 10000,
          finalSellingPrice: 63000,
        },
      ],
    });

    const req = new NextRequest('http://localhost/api/v1/leads/pipeline', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const res = await getPipeline(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary.possibleIncome).toBe(25000);
  });
});
