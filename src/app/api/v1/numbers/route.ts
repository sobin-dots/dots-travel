import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-auth';

import { getTelephonyProvider } from '@/lib/telephony';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const { auth, errorResponse } = await authenticateRequest(req, 'viewer');
  if (errorResponse) return errorResponse;

  // Auto-sync numbers if live mode is active
  if (process.env.TELEPHONY_MODE === 'live') {
    try {
      const provider = getTelephonyProvider();
      if (provider.mode === 'live') {
        const liveNumbers = await provider.listOwnedNumbers();
        let plivoAccount = await db.plivoAccount.findFirst({
          where: { organizationId: auth!.organizationId },
        });

        if (plivoAccount) {
          for (const item of liveNumbers) {
            const e164 = item.number.startsWith('+') ? item.number : `+${item.number}`;
            const exists = await db.phoneNumber.findFirst({
              where: { e164, organizationId: auth!.organizationId },
            });
            if (!exists) {
              await db.phoneNumber.create({
                data: {
                  organizationId: auth!.organizationId,
                  plivoAccountId: plivoAccount.id,
                  e164,
                  countryIso: e164.startsWith('+91') ? 'IN' : 'US',
                  numberType: 'local',
                  friendlyName: item.alias || `Plivo Carrier Line (${e164})`,
                  recordCalls: true,
                  status: 'active',
                },
              });
            }
          }
        }
      }
    } catch (syncErr: any) {
      console.warn('Auto-sync live numbers warning:', syncErr.message);
    }
  }

  const url = new URL(req.url);
  const status = url.searchParams.get('status') || 'active';

  const numbers = await db.phoneNumber.findMany({
    where: {
      organizationId: auth!.organizationId,
      status,
    },
    include: {
      application: {
        select: {
          id: true,
          name: true,
          plivoAppId: true,
          answerUrl: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({
    api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
    count: numbers.length,
    objects: numbers,
  });
}
