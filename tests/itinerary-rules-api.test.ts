import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../src/lib/db';
import { signAccessToken } from '../src/lib/auth-tokens';
import { NextRequest } from 'next/server';
import { GET as getRules, POST as createRule } from '../src/app/api/v1/settings/itinerary-rules/route';
import {
  GET as getSingleRule,
  PATCH as updateRule,
  DELETE as deleteRule,
} from '../src/app/api/v1/settings/itinerary-rules/[id]/route';
import { POST as seedPresets } from '../src/app/api/v1/settings/itinerary-rules/seed/route';

describe('Itinerary Rules HTTP API Endpoints', () => {
  let org: any;
  let adminUser: any;
  let token: string;
  let createdRuleId: string;

  beforeAll(async () => {
    org = await db.organization.upsert({
      where: { slug: 'api-rules-test-org' },
      update: {},
      create: {
        name: 'API Rules Test Org',
        slug: 'api-rules-test-org',
      },
    });

    adminUser = await db.user.upsert({
      where: { email: 'admin-rules@test.local' },
      update: {},
      create: {
        email: 'admin-rules@test.local',
        name: 'Rules Admin',
        passwordHash: 'dummyhash',
      },
    });

    await db.membership.upsert({
      where: {
        organizationId_userId: {
          organizationId: org.id,
          userId: adminUser.id,
        },
      },
      update: { role: 'admin' },
      create: {
        organizationId: org.id,
        userId: adminUser.id,
        role: 'admin',
      },
    });

    token = await signAccessToken({
      userId: adminUser.id,
      email: adminUser.email,
      organizationId: org.id,
      role: 'admin',
    });

    await db.itineraryRule.deleteMany({
      where: { organizationId: org.id },
    });
  });

  afterAll(async () => {
    await db.itineraryRule.deleteMany({
      where: { organizationId: org.id },
    });
  });

  it('POST /api/v1/settings/itinerary-rules creates a new rule', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/settings/itinerary-rules', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        title: 'Morning Flight Recovery Buffer',
        category: 'pacing',
        priority: 2,
        condition: 'all',
        rulePrompt: 'Ensure at least 3 hours buffer between flight landing and first excursion.',
        isActive: true,
      }),
    });

    const res = await createRule(req);
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.rule).toBeDefined();
    expect(data.rule.title).toBe('Morning Flight Recovery Buffer');
    expect(data.rule.category).toBe('pacing');
    expect(data.rule.isActive).toBe(true);
    createdRuleId = data.rule.id;
  });

  it('GET /api/v1/settings/itinerary-rules lists rules with counts and filters', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/settings/itinerary-rules', {
      headers: { Authorization: `Bearer ${token}` },
    });

    const res = await getRules(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.rules).toHaveLength(1);
    expect(data.total).toBe(1);
    expect(data.activeCount).toBe(1);
    expect(data.rules[0].id).toBe(createdRuleId);
  });

  it('PATCH /api/v1/settings/itinerary-rules/[id] updates a rule', async () => {
    const req = new NextRequest(`http://localhost:3000/api/v1/settings/itinerary-rules/${createdRuleId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        priority: 3,
        isActive: false,
      }),
    });

    const res = await updateRule(req, { params: Promise.resolve({ id: createdRuleId }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.rule.priority).toBe(3);
    expect(data.rule.isActive).toBe(false);
  });

  it('POST /api/v1/settings/itinerary-rules/seed seeds preset rules', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/settings/itinerary-rules/seed', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });

    const res = await seedPresets(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.addedCount).toBeGreaterThanOrEqual(5);

    // Verify rules list now includes seeded presets
    const listReq = new NextRequest('http://localhost:3000/api/v1/settings/itinerary-rules', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const listRes = await getRules(listReq);
    const listData = await listRes.json();
    expect(listData.total).toBeGreaterThanOrEqual(6);
  });

  it('DELETE /api/v1/settings/itinerary-rules/[id] deletes a rule', async () => {
    const req = new NextRequest(`http://localhost:3000/api/v1/settings/itinerary-rules/${createdRuleId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });

    const res = await deleteRule(req, { params: Promise.resolve({ id: createdRuleId }) });
    expect(res.status).toBe(200);

    const getReq = new NextRequest(`http://localhost:3000/api/v1/settings/itinerary-rules/${createdRuleId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const getRes = await getSingleRule(getReq, { params: Promise.resolve({ id: createdRuleId }) });
    expect(getRes.status).toBe(404);
  });
});
