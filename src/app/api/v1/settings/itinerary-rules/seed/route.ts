import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { authenticateRequest, logAuditEvent } from '@/lib/api-auth';

export const runtime = 'nodejs';

export const TRAVEL_INDUSTRY_PRESETS = [
  {
    title: 'Arrival Day Pace & Recovery',
    category: 'pacing',
    priority: 3,
    condition: 'all',
    description: 'Guarantees jetlag recovery buffer on the first day of arrival.',
    rulePrompt:
      'On Day 1 (Arrival Day), strictly avoid scheduling strenuous sightseeing, distant day-trips, or multiple activities before 6:00 PM. Limit Day 1 to VIP airport arrival greeting, executive chauffeur transfer to hotel, private concierge check-in, and an optional relaxed welcome dinner at or near the hotel.',
  },
  {
    title: 'Family & Child Friendly Scheduling',
    category: 'activities',
    priority: 3,
    condition: 'has_children',
    description: 'Imposes pacing buffers and child safety considerations for family vacations.',
    rulePrompt:
      'When traveling with children or infants, never schedule more than 2 major activities per calendar day. Guarantee a 2-hour afternoon downtime buffer (ideal for pool relaxation or rest), and explicitly suggest family-friendly culinary options, child-safe transport, and interactive educational or wildlife excursions.',
  },
  {
    title: 'Luxury 5-Star Preferred Amenities',
    category: 'accommodation',
    priority: 2,
    condition: 'luxury_5star',
    description: 'Defines executive amenities and vehicle classes for luxury tier clients.',
    rulePrompt:
      'When the accommodation category is Luxury 5-Star, always specify club lounge or executive suite privileges, complimentary artisan breakfast, guaranteed late check-out consideration, and executive Mercedes-Benz S-Class / V-Class (or regional equivalent) chauffeur transport.',
  },
  {
    title: 'Dietary Transparency & Special Cuisines',
    category: 'dining',
    priority: 2,
    condition: 'all',
    description: 'Ensures evening dining recommendations cater to dietary preferences.',
    rulePrompt:
      'In daily dinner and lunch suggestions, explicitly incorporate verified dining venues catering to stated dietary preferences (e.g. Halal-certified gourmet, Vegan / Vegetarian fine dining, Kosher, or Gluten-free). Mention specific restaurant atmospheres (e.g. rooftop panorama, Michelin-starred, or coastal terrace).',
  },
  {
    title: 'Excursion Buffer & Transit Time Buffer',
    category: 'transportation',
    priority: 2,
    condition: 'all',
    description: 'Prevents rushed schedules by reserving minimum 45-min transit buffers.',
    rulePrompt:
      'Between consecutive morning and afternoon destinations, mandate a minimum 45-minute travel and comfort buffer. Ensure all major landmarks explicitly include VIP skip-the-line admissions and dedicated private licensed guides.',
  },
  {
    title: 'Supplier Quotation Scope Breakdown',
    category: 'pricing',
    priority: 3,
    condition: 'all',
    description: 'Structures the quotation scope so suppliers provide accurate itemized bids.',
    rulePrompt:
      'Under the "Quotation Scope for Suppliers" section, format an itemized operational checklist for ground destination management companies: (1) Private airport and intercity transfers, (2) Selected hotel category with meal plan, (3) Admission tickets with priority skip-the-line access, (4) Certified private English-speaking guides, and (5) 24/7 dedicated local concierge support.',
  },
];

export async function POST(req: NextRequest) {
  const { auth, errorResponse } = await authenticateRequest(req, 'operator');
  if (errorResponse) return errorResponse;

  try {
    const existingCount = await db.itineraryRule.count({
      where: { organizationId: auth!.organizationId },
    });

    const createdRules = [];
    for (const preset of TRAVEL_INDUSTRY_PRESETS) {
      // Check if a rule with same title already exists
      const exists = await db.itineraryRule.findFirst({
        where: { organizationId: auth!.organizationId, title: preset.title },
      });

      if (!exists) {
        const rule = await db.itineraryRule.create({
          data: {
            organizationId: auth!.organizationId,
            title: preset.title,
            description: preset.description,
            category: preset.category,
            rulePrompt: preset.rulePrompt,
            condition: preset.condition,
            priority: preset.priority,
            isActive: true,
          },
        });
        createdRules.push(rule);
      }
    }

    await logAuditEvent({
      organizationId: auth!.organizationId,
      actorUserId: auth!.userId,
      action: 'settings.itinerary_rules.seed_presets',
      targetType: 'Organization',
      targetId: auth!.organizationId,
      metadata: { addedCount: createdRules.length, previousCount: existingCount },
    });

    return NextResponse.json({
      api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
      message: `Successfully seeded ${createdRules.length} luxury travel industry preset rules`,
      addedCount: createdRules.length,
      rules: createdRules,
    });
  } catch (err: any) {
    console.error('Error seeding itinerary rule presets:', err);
    return NextResponse.json(
      { api_id: 'server_err', error: err.message || 'Internal error seeding presets' },
      { status: 500 }
    );
  }
}
