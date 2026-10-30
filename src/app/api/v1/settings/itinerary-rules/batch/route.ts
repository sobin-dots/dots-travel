import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { authenticateRequest, logAuditEvent } from '@/lib/api-auth';
import { BatchCreateItineraryRulesSchema } from '@/lib/schemas';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const { auth, errorResponse } = await authenticateRequest(req, 'operator');
  if (errorResponse) return errorResponse;

  try {
    const body = await req.json();
    const parsed = BatchCreateItineraryRulesSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          api_id: 'bad_req',
          error: parsed.error.issues[0]?.message || 'Invalid batch rules payload',
          details: parsed.error.issues,
        },
        { status: 400 }
      );
    }

    const { rules, replaceExisting } = parsed.data;

    const createdRules: any[] = [];

    await db.$transaction(async (tx) => {
      if (replaceExisting) {
        await tx.itineraryRule.deleteMany({
          where: { organizationId: auth!.organizationId },
        });
      }

      for (const rule of rules) {
        const created = await tx.itineraryRule.create({
          data: {
            organizationId: auth!.organizationId,
            title: rule.title.trim(),
            description: rule.description ? rule.description.trim() : null,
            category: rule.category || 'general',
            rulePrompt: rule.rulePrompt.trim(),
            condition: rule.condition ? rule.condition.trim() : 'all',
            priority: rule.priority ?? 1,
            isActive: rule.isActive !== false,
          },
        });
        createdRules.push(created);
      }
    });

    await logAuditEvent({
      organizationId: auth!.organizationId,
      actorUserId: auth!.userId,
      action: 'settings.itinerary_rules.batch_create',
      metadata: {
        createdCount: createdRules.length,
        replaceExisting,
      },
    });

    return NextResponse.json(
      {
        success: true,
        api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
        message: `Successfully configured ${createdRules.length} rule(s) in your agency's itinerary rules.`,
        createdCount: createdRules.length,
        count: createdRules.length,
        rules: createdRules,
      },
      { status: 201 }
    );
  } catch (err: any) {
    console.error('Error batch creating itinerary rules:', err);
    return NextResponse.json(
      { api_id: 'server_err', error: err.message || 'Internal error saving rules' },
      { status: 500 }
    );
  }
}

