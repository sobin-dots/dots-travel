import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import {
  saveTenantIntegration,
  getTenantIntegration,
  getTenantIntegrationsSummary,
  deleteTenantIntegration,
} from '@/lib/integrations/credentials-manager';

describe('Settings & BYOK Multi-Tenant Isolation', () => {
  let orgA: any;
  let orgB: any;

  beforeEach(async () => {
    const nonce = Date.now() + '_' + crypto.randomBytes(4).toString('hex');
    orgA = await db.organization.create({
      data: {
        name: `Org A Settings Test ${nonce}`,
        slug: `org-a-${nonce}`,
        primaryTelephonyProvider: 'plivo',
        transcriptionDefaultEnabled: true,
        transcriptionLanguage: 'en-US',
        recordingRetentionDays: 90,
        redactMessageContent: false,
      },
    });

    orgB = await db.organization.create({
      data: {
        name: `Org B Settings Test ${nonce}`,
        slug: `org-b-${nonce}`,
        primaryTelephonyProvider: 'plivo',
        transcriptionDefaultEnabled: false,
        transcriptionLanguage: 'hi-IN',
        recordingRetentionDays: 30,
        redactMessageContent: true,
      },
    });
  });

  afterEach(async () => {
    if (orgA?.id) {
      await db.tenantIntegration.deleteMany({ where: { organizationId: orgA.id } });
      await db.organization.deleteMany({ where: { id: orgA.id } });
    }
    if (orgB?.id) {
      await db.tenantIntegration.deleteMany({ where: { organizationId: orgB.id } });
      await db.organization.deleteMany({ where: { id: orgB.id } });
    }
  });

  it('keeps organization policies strictly isolated when editing or saving', async () => {
    // Modify Org A policies
    await db.organization.update({
      where: { id: orgA.id },
      data: {
        recordingRetentionDays: 180,
        transcriptionDefaultEnabled: true,
        transcriptionLanguage: 'ta-IN',
        redactMessageContent: true,
      },
    });

    // Check Org B policies remain untouched
    const freshOrgB = await db.organization.findUnique({ where: { id: orgB.id } });
    expect(freshOrgB?.recordingRetentionDays).toBe(30);
    expect(freshOrgB?.transcriptionDefaultEnabled).toBe(false);
    expect(freshOrgB?.transcriptionLanguage).toBe('hi-IN');
    expect(freshOrgB?.redactMessageContent).toBe(true);

    // Check Org A policies updated accurately
    const freshOrgA = await db.organization.findUnique({ where: { id: orgA.id } });
    expect(freshOrgA?.recordingRetentionDays).toBe(180);
    expect(freshOrgA?.transcriptionLanguage).toBe('ta-IN');
  });

  it('ensures integrations saved in Org A never leak into or overwrite Org B', async () => {
    // Configure MSG91 in Org A
    await saveTenantIntegration(orgA.id, {
      provider: 'msg91',
      credentials: {
        authKey: '439248TestKeyOrgA12345',
        senderId: 'ORGA01',
        callerId: '+919876543210',
      },
    });

    // Verify Org A has the integration
    const integA = await getTenantIntegration(orgA.id, 'msg91');
    expect(integA).not.toBeNull();
    expect(integA?.maskedDetails.senderId).toBe('ORGA01');
    expect(integA?.maskedDetails.callerId).toBe('+919876543210');
    expect(integA?.credentials.authKey).toBe('439248TestKeyOrgA12345');

    // Verify Org B does NOT have the integration
    const integB = await getTenantIntegration(orgB.id, 'msg91');
    expect(integB).toBeNull();

    // Verify summary returns distinct scoped summaries
    const summaryA = await getTenantIntegrationsSummary(orgA.id);
    const summaryB = await getTenantIntegrationsSummary(orgB.id);

    expect(summaryA.organizationId).toBe(orgA.id);
    expect(summaryA.integrations.length).toBe(1);
    expect(summaryA.webhookUrls.voiceAnswer).toContain(`orgId=${orgA.id}`);

    expect(summaryB.organizationId).toBe(orgB.id);
    expect(summaryB.integrations.length).toBe(0);
    expect(summaryB.webhookUrls.voiceAnswer).toContain(`orgId=${orgB.id}`);
  });

  it('allows separate integrations and caller IDs for both organizations independently', async () => {
    // Configure MSG91 with different sender IDs and keys for Org A and Org B
    await saveTenantIntegration(orgA.id, {
      provider: 'msg91',
      credentials: {
        authKey: '439248KeyOrgA99999',
        senderId: 'ORGA99',
        callerId: '+919111111111',
      },
    });

    await saveTenantIntegration(orgB.id, {
      provider: 'msg91',
      credentials: {
        authKey: '439248KeyOrgB88888',
        senderId: 'ORGB88',
        callerId: '+919222222222',
      },
    });

    const resA = await getTenantIntegration(orgA.id, 'msg91');
    const resB = await getTenantIntegration(orgB.id, 'msg91');

    expect(resA?.maskedDetails.senderId).toBe('ORGA99');
    expect(resA?.maskedDetails.callerId).toBe('+919111111111');
    expect(resA?.credentials.authKey).toBe('439248KeyOrgA99999');

    expect(resB?.maskedDetails.senderId).toBe('ORGB88');
    expect(resB?.maskedDetails.callerId).toBe('+919222222222');
    expect(resB?.credentials.authKey).toBe('439248KeyOrgB88888');

    // Delete integration from Org A; Org B must remain untouched
    await deleteTenantIntegration(orgA.id, 'msg91');
    expect(await getTenantIntegration(orgA.id, 'msg91')).toBeNull();
    expect(await getTenantIntegration(orgB.id, 'msg91')).not.toBeNull();
  });
});

