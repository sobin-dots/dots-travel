import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { authenticateRequest, logAuditEvent } from '@/lib/api-auth';
import { GenerateItineraryRulesSchema } from '@/lib/schemas';
import { extractRulesFromPlainText } from '@/lib/itinerary-rules-extractor';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const { auth, errorResponse } = await authenticateRequest(req, 'operator');
  if (errorResponse) return errorResponse;

  try {
    const body = await req.json();
    const parsed = GenerateItineraryRulesSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          api_id: 'bad_req',
          error: parsed.error.issues[0]?.message || 'Invalid rule generation parameters',
          details: parsed.error.issues,
        },
        { status: 400 }
      );
    }

    const { text, autoSave, replaceExisting } = parsed.data;

    // Extract structured rules using AI or deterministic section parser
    const extraction = await extractRulesFromPlainText(text, auth!.organizationId);

    if (extraction.rules.length === 0) {
      return NextResponse.json(
        {
          api_id: 'no_rules_found',
          error: 'No distinct rules or sections could be extracted from the provided text. Please provide structured guidelines, numbered sections, or bullet points.',
        },
        { status: 422 }
      );
    }

    let savedCount = 0;
    let savedRules: any[] = [];

    // Optional direct auto-save
    if (autoSave) {
      await db.$transaction(async (tx) => {
        if (replaceExisting) {
          await tx.itineraryRule.deleteMany({
            where: { organizationId: auth!.organizationId },
          });
        }

        for (const rule of extraction.rules) {
          const created = await tx.itineraryRule.create({
            data: {
              organizationId: auth!.organizationId,
              title: rule.title,
              description: rule.description || null,
              category: rule.category,
              rulePrompt: rule.rulePrompt,
              condition: rule.condition || 'all',
              priority: rule.priority,
              isActive: rule.isActive,
            },
          });
          savedRules.push(created);
        }
      });

      savedCount = savedRules.length;

      await logAuditEvent({
        organizationId: auth!.organizationId,
        actorUserId: auth!.userId,
        action: 'settings.itinerary_rules.generate_and_save',
        metadata: {
          totalRules: savedCount,
          replaceExisting,
          source: extraction.source,
        },
      });
    }

    return NextResponse.json({
      success: true,
      api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
      message: autoSave
        ? `Successfully generated and saved ${savedCount} rules into configured rules.`
        : `Extracted ${extraction.rules.length} rule directives ready for configuration.`,
      rules: extraction.rules,
      totalExtracted: extraction.rules.length,
      source: extraction.source,
      documentTitle: extraction.documentTitle,
      autoSaved: Boolean(autoSave),
      savedRules: autoSave ? savedRules : undefined,
    });
  } catch (err: any) {
    console.error('Error generating itinerary rules from text:', err);
    return NextResponse.json(
      { api_id: 'server_err', error: err.message || 'Internal error processing rules text' },
      { status: 500 }
    );
  }
}

