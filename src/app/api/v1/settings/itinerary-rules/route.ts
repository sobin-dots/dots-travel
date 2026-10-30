import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { authenticateRequest, logAuditEvent } from '@/lib/api-auth';
import { CreateItineraryRuleSchema } from '@/lib/schemas';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const { auth, errorResponse } = await authenticateRequest(req, 'viewer');
  if (errorResponse) return errorResponse;

  const url = new URL(req.url);
  const category = url.searchParams.get('category');
  const isActiveParam = url.searchParams.get('isActive');
  const search = url.searchParams.get('search')?.trim();

  const where: any = {
    organizationId: auth!.organizationId,
  };

  if (category && category !== 'all') {
    where.category = category;
  }

  if (isActiveParam !== null && isActiveParam !== undefined && isActiveParam !== '') {
    where.isActive = isActiveParam === 'true';
  }

  if (search) {
    where.OR = [
      { title: { contains: search, mode: 'insensitive' } },
      { rulePrompt: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
      { condition: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [rules, total, activeCount] = await Promise.all([
    db.itineraryRule.findMany({
      where,
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    }),
    db.itineraryRule.count({
      where: { organizationId: auth!.organizationId },
    }),
    db.itineraryRule.count({
      where: { organizationId: auth!.organizationId, isActive: true },
    }),
  ]);

  return NextResponse.json({
    api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
    rules,
    total,
    activeCount,
  });
}

export async function POST(req: NextRequest) {
  const { auth, errorResponse } = await authenticateRequest(req, 'operator');
  if (errorResponse) return errorResponse;

  try {
    const body = await req.json();
    const parsed = CreateItineraryRuleSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          api_id: 'bad_req',
          error: parsed.error.issues[0]?.message || 'Invalid itinerary rule parameters',
          details: parsed.error.issues,
        },
        { status: 400 }
      );
    }

    const { title, description, category, rulePrompt, condition, priority, isActive } = parsed.data;

    const rule = await db.itineraryRule.create({
      data: {
        organizationId: auth!.organizationId,
        title,
        description: description || null,
        category: category || 'general',
        rulePrompt,
        condition: condition || null,
        priority: priority ?? 1,
        isActive: isActive !== undefined ? isActive : true,
      },
    });

    await logAuditEvent({
      organizationId: auth!.organizationId,
      actorUserId: auth!.userId,
      action: 'settings.itinerary_rule.create',
      targetType: 'ItineraryRule',
      targetId: rule.id,
      metadata: { title: rule.title, category: rule.category, priority: rule.priority },
    });

    return NextResponse.json(
      {
        api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
        message: 'Itinerary preparation rule created successfully',
        rule,
      },
      { status: 201 }
    );
  } catch (err: any) {
    console.error('Error creating itinerary rule:', err);
    return NextResponse.json(
      { api_id: 'server_err', error: err.message || 'Internal error creating itinerary rule' },
      { status: 500 }
    );
  }
}
