import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../src/lib/db';
import {
  getActiveItineraryRulesForOrg,
  generateItineraryFromTranscript,
  reviseItineraryWithDeepSeek,
} from '../src/lib/deepseek';

describe('Itinerary Preparation Rules & LLM Context Feeding', () => {
  let orgA: any;
  let orgB: any;

  beforeAll(async () => {
    // Setup test organization A
    orgA = await db.organization.upsert({
      where: { slug: 'rules-test-org-a' },
      update: {},
      create: {
        name: 'Rules Test Agency A',
        slug: 'rules-test-org-a',
      },
    });

    // Setup test organization B for multi-tenant isolation testing
    orgB = await db.organization.upsert({
      where: { slug: 'rules-test-org-b' },
      update: {},
      create: {
        name: 'Rules Test Agency B',
        slug: 'rules-test-org-b',
      },
    });

    // Clean up any pre-existing test rules
    await db.itineraryRule.deleteMany({
      where: { organizationId: { in: [orgA.id, orgB.id] } },
    });
  });

  afterAll(async () => {
    await db.itineraryRule.deleteMany({
      where: { organizationId: { in: [orgA.id, orgB.id] } },
    });
  });

  it('returns empty prompt context when no rules are configured', async () => {
    const rulesContext = await getActiveItineraryRulesForOrg(orgA.id);
    expect(rulesContext.ruleCount).toBe(0);
    expect(rulesContext.promptText).toBe('');
    expect(rulesContext.rules).toHaveLength(0);
  });

  it('creates rules and loads active rules formatted for LLM context', async () => {
    // Create rule 1: Pacing (Active, Mandatory Priority 3)
    await db.itineraryRule.create({
      data: {
        organizationId: orgA.id,
        title: 'Arrival Day Rest Mandate',
        category: 'pacing',
        priority: 3,
        condition: 'all',
        rulePrompt: 'On Day 1, do not schedule any tours before 6 PM; provide only hotel check-in and light welcome dinner.',
        isActive: true,
      },
    });

    // Create rule 2: Accommodation (Active, High Priority 2)
    await db.itineraryRule.create({
      data: {
        organizationId: orgA.id,
        title: 'VIP Chauffeur and Suite Tier',
        category: 'accommodation',
        priority: 2,
        condition: 'luxury_5star',
        rulePrompt: 'Always specify Mercedes-Benz S-Class chauffeur transfers and complimentary suite upgrades.',
        isActive: true,
      },
    });

    // Create rule 3: Disabled rule (isActive: false)
    await db.itineraryRule.create({
      data: {
        organizationId: orgA.id,
        title: 'Deprecated Protocol',
        category: 'general',
        priority: 1,
        rulePrompt: 'This rule is disabled and should never be fed to the LLM.',
        isActive: false,
      },
    });

    // Fetch rules for Luxury 5-star trip
    const rulesContext = await getActiveItineraryRulesForOrg(orgA.id, {
      hotelTier: 'luxury_5star',
      headcountChildren: 0,
    });

    expect(rulesContext.ruleCount).toBe(2);
    expect(rulesContext.promptText).toContain('MANDATORY AGENCY ITINERARY PREPARATION RULES');
    expect(rulesContext.promptText).toContain('ARRIVAL DAY REST MANDATE');
    expect(rulesContext.promptText).toContain('VIP CHAUFFEUR AND SUITE TIER');
    expect(rulesContext.promptText).toContain('STRICT / MANDATORY');
    expect(rulesContext.promptText).not.toContain('Deprecated Protocol');
  });

  it('respects conditional triggers (e.g. skips family rule when adults-only)', async () => {
    // Add child safety rule with condition 'has_children'
    await db.itineraryRule.create({
      data: {
        organizationId: orgA.id,
        title: 'Kids Pool Downtime Buffer',
        category: 'activities',
        priority: 3,
        condition: 'has_children',
        rulePrompt: 'For families with children, ensure an afternoon 2-hour buffer for pool relaxation.',
        isActive: true,
      },
    });

    // Test 1: Adults only (children = 0)
    const adultContext = await getActiveItineraryRulesForOrg(orgA.id, {
      headcountChildren: 0,
      headcountAdults: 2,
      hotelTier: 'standard_3star',
    });
    // Should include universal rule 1, but NOT the kids rule (since no kids) and NOT luxury rule (since standard tier)
    expect(adultContext.promptText).toContain('ARRIVAL DAY REST MANDATE');
    expect(adultContext.promptText).not.toContain('KIDS POOL DOWNTIME BUFFER');
    expect(adultContext.promptText).not.toContain('VIP CHAUFFEUR AND SUITE TIER');

    // Test 2: Family with children (children = 2)
    const familyContext = await getActiveItineraryRulesForOrg(orgA.id, {
      headcountChildren: 2,
      headcountAdults: 2,
      hotelTier: 'standard_3star',
    });
    expect(familyContext.promptText).toContain('ARRIVAL DAY REST MANDATE');
    expect(familyContext.promptText).toContain('KIDS POOL DOWNTIME BUFFER');
  });

  it('guarantees strict multi-tenant isolation (Org B cannot see Org A rules)', async () => {
    // Query rules for Org B (which has no rules created)
    const orgBContext = await getActiveItineraryRulesForOrg(orgB.id);
    expect(orgBContext.ruleCount).toBe(0);
    expect(orgBContext.promptText).toBe('');

    // Create a rule for Org B
    await db.itineraryRule.create({
      data: {
        organizationId: orgB.id,
        title: 'Org B Exclusive Budget Policy',
        category: 'pricing',
        priority: 2,
        rulePrompt: 'Always itemize airport shuttle fee as separate line item.',
        isActive: true,
      },
    });

    const orgBUpdated = await getActiveItineraryRulesForOrg(orgB.id);
    expect(orgBUpdated.ruleCount).toBe(1);
    expect(orgBUpdated.promptText).toContain('ORG B EXCLUSIVE BUDGET POLICY');
    expect(orgBUpdated.promptText).not.toContain('ARRIVAL DAY REST MANDATE');
  });

  it('incorporates active rules into itinerary generation and offline fallback', async () => {
    const result = await generateItineraryFromTranscript(
      'Client inquiry for 5 days in Paris with private tours.',
      { name: 'Arthur Dent', phone: '+14155550999', email: 'arthur@hitchhiker.test' },
      orgA.id,
      {
        destination: 'Paris, France',
        durationDays: 5,
        hotelTier: 'luxury_5star',
        headcountAdults: 2,
        headcountChildren: 0,
        targetBudget: 12000,
      }
    );

    expect(result.itinerary).toBeDefined();
    expect(result.title).toContain('Paris');
    // Verify applied agency guidelines section exists in the generated itinerary
    expect(result.itinerary).toContain('Applied Agency Guidelines');
    expect(result.itinerary).toContain('Arrival Day Rest Mandate');
  }, 25000);

  it('feeds active rules into itinerary revision with DeepSeek', async () => {
    const initialItinerary = `# Luxury Paris Journey\n## 1. Executive Summary\nParis trip summary.\n## 2. Day-by-Day Journey Itinerary\n### Day 1: Arrival`;
    const revised = await reviseItineraryWithDeepSeek(
      initialItinerary,
      'Add reservation at Le Jules Verne on Day 2 evening',
      orgA.id
    );

    expect(revised).toBeDefined();
    expect(typeof revised).toBe('string');
  }, 25000);
});
