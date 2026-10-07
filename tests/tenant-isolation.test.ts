import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../src/lib/db';

describe('Multi-Tenant Database Isolation & Idempotency', () => {
  let orgA: any;
  let orgB: any;

  beforeAll(async () => {
    // Create Org A and Org B
    orgA = await db.organization.upsert({
      where: { slug: 'test-tenant-a' },
      update: {},
      create: { name: 'Tenant A', slug: 'test-tenant-a' },
    });

    orgB = await db.organization.upsert({
      where: { slug: 'test-tenant-b' },
      update: {},
      create: { name: 'Tenant B', slug: 'test-tenant-b' },
    });
  });

  afterAll(async () => {
    await db.organization.deleteMany({
      where: { slug: { in: ['test-tenant-a', 'test-tenant-b'] } },
    });
    await db.$disconnect();
  });

  it('guarantees tenant isolation: Org B queries cannot access Org A call records', async () => {
    // Create Call in Org A
    const callA = await db.call.create({
      data: {
        organizationId: orgA.id,
        plivoCallUuid: `call_test_isolation_a_${Date.now()}`,
        direction: 'outbound',
        from: '+14155550001',
        to: '+14155550002',
        status: 'completed',
      },
    });

    // Query strictly scoped to Org B
    const resultInOrgB = await db.call.findFirst({
      where: {
        id: callA.id,
        organizationId: orgB.id,
      },
    });

    expect(resultInOrgB).toBeNull();

    // Query scoped to Org A succeeds
    const resultInOrgA = await db.call.findFirst({
      where: {
        id: callA.id,
        organizationId: orgA.id,
      },
    });

    expect(resultInOrgA).not.toBeNull();
    expect(resultInOrgA?.id).toBe(callA.id);
  });

  it('enforces webhook event unique deduplication constraint', async () => {
    const dedupeKey = `dedupe_test_key_${Date.now()}`;

    // First insertion succeeds
    const first = await db.webhookEvent.create({
      data: {
        provider: 'plivo',
        kind: 'voice',
        dedupeKey,
        signatureValid: true,
        headers: {},
        rawBody: '{}',
      },
    });

    expect(first.id).toBeDefined();

    // Replay with identical (provider, dedupeKey, kind) violates unique constraint
    await expect(
      db.webhookEvent.create({
        data: {
          provider: 'plivo',
          kind: 'voice',
          dedupeKey,
          signatureValid: true,
          headers: {},
          rawBody: '{}',
        },
      })
    ).rejects.toThrow();
  });
});
