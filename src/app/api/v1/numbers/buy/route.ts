import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { authenticateRequest, logAuditEvent } from '@/lib/api-auth';
import { BuyNumberRequestSchema } from '@/lib/schemas';
import { getTelephonyProvider } from '@/lib/telephony';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const { auth, errorResponse } = await authenticateRequest(req, 'admin');
  if (errorResponse) return errorResponse;

  try {
    const body = await req.json();
    const parsed = BuyNumberRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { api_id: 'bad_req', error: parsed.error.issues[0]?.message || 'Invalid buy request' },
        { status: 400 }
      );
    }

    const { countryIso, e164, applicationId, cnam, complianceApplicationId } = parsed.data;

    // Check if number is already owned by this org
    const existing = await db.phoneNumber.findFirst({
      where: {
        organizationId: auth!.organizationId,
        e164,
        status: 'active',
      },
    });
    if (existing) {
      return NextResponse.json(
        { api_id: 'bad_req', error: `Phone number ${e164} is already active in this organization.` },
        { status: 409 }
      );
    }

    // Find organization's plivo account
    const plivoAccount = await db.plivoAccount.findFirst({
      where: { organizationId: auth!.organizationId },
    });
    if (!plivoAccount) {
      return NextResponse.json(
        { api_id: 'config_err', error: 'No Plivo account attached to organization.' },
        { status: 400 }
      );
    }

    // Provision via provider
    const provider = getTelephonyProvider();
    const buyResult = await provider.buyNumber({
      number: e164,
      appId: applicationId,
      cnam,
      complianceApplicationId,
    });

    // Save to database
    const newNumber = await db.phoneNumber.create({
      data: {
        organizationId: auth!.organizationId,
        plivoAccountId: plivoAccount.id,
        applicationId,
        e164,
        countryIso,
        friendlyName: `Purchased Number (${e164})`,
        status: 'active',
        source: 'purchased',
        purchasedAt: new Date(),
        monthlyRental: 1.0,
        smsRate: 0.0075,
        voiceRate: 0.012,
      },
    });

    await logAuditEvent({
      organizationId: auth!.organizationId,
      actorUserId: auth!.userId,
      action: 'number.buy',
      targetType: 'PhoneNumber',
      targetId: newNumber.id,
      metadata: { e164, countryIso },
    });

    return NextResponse.json({
      api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
      message: buyResult.message,
      number: newNumber,
    }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json(
      { api_id: 'provider_err', error: err.message },
      { status: 500 }
    );
  }
}
