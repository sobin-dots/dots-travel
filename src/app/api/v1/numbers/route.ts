import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-auth';
import { getTenantTelephonyProvider } from '@/lib/telephony';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const { auth, errorResponse } = await authenticateRequest(req, 'viewer');
  if (errorResponse) return errorResponse;

  // Auto-sync numbers if live mode is active
  if (process.env.TELEPHONY_MODE === 'live') {
    try {
      const provider = await getTenantTelephonyProvider(auth!.organizationId);
      if (provider.mode === 'live') {
        const liveNumbers = await provider.listOwnedNumbers();
        const liveE164Set = new Set<string>();

        let plivoAccount = await db.plivoAccount.findFirst({
          where: { organizationId: auth!.organizationId },
        });

        for (const item of liveNumbers) {
          const e164 = item.number.startsWith('+') ? item.number : `+${item.number}`;
          liveE164Set.add(e164);
          const countryIso = e164.startsWith('+91') ? 'IN' : e164.startsWith('+1') ? 'US' : 'US';
          const friendlyName =
            item.alias ||
            (provider.name === 'msg91' ? `MSG91 Voice Line (${e164})` : `Plivo Carrier Line (${e164})`);

          const existing = await db.phoneNumber.findFirst({
            where: { e164, organizationId: auth!.organizationId },
          });

          if (!existing) {
            const created = await db.phoneNumber.create({
              data: {
                organizationId: auth!.organizationId,
                provider: provider.name || 'plivo',
                plivoAccountId: plivoAccount?.id || null,
                e164,
                countryIso,
                numberType: 'local',
                friendlyName,
                monthlyRental: item.monthlyRental ? Number(item.monthlyRental) : 2.5,
                voiceRate: item.voiceRate ? Number(item.voiceRate) : 0.0078,
                smsRate: item.smsRate ? Number(item.smsRate) : 0.0,
                recordCalls: true,
                status: 'active',
                source: 'purchased',
                purchasedAt: new Date(),
              },
            });

            // Link existing calls that match this line if they had null phoneNumberId
            const cleanDigits = e164.replace(/\D/g, '');
            await db.call.updateMany({
              where: {
                organizationId: auth!.organizationId,
                phoneNumberId: null,
                OR: [
                  { to: e164 },
                  { to: cleanDigits },
                  { from: e164 },
                  { from: cleanDigits },
                ],
              },
              data: {
                phoneNumberId: created.id,
              },
            });
          } else {
            await db.phoneNumber.update({
              where: { id: existing.id },
              data: {
                status: 'active',
                releasedAt: null,
                friendlyName,
                monthlyRental: item.monthlyRental ? Number(item.monthlyRental) : existing.monthlyRental,
                voiceRate: item.voiceRate ? Number(item.voiceRate) : existing.voiceRate,
              },
            });
          }
        }

        // Clean up or deactivate active numbers for this provider that do NOT belong to this tenant's live account
        const staleNumbers = await db.phoneNumber.findMany({
          where: {
            organizationId: auth!.organizationId,
            provider: provider.name,
            e164: { notIn: Array.from(liveE164Set) },
          },
          include: {
            calls: { select: { id: true }, take: 1 },
            messages: { select: { id: true }, take: 1 },
          },
        });

        for (const stale of staleNumbers) {
          if (stale.calls.length === 0 && stale.messages.length === 0) {
            // Delete bogus / test / seeded line that was never owned by this tenant
            await db.phoneNumber.delete({ where: { id: stale.id } });
          } else if (stale.status === 'active') {
            // Preserve historical audit trail if referenced by calls/messages, but mark as released
            await db.phoneNumber.update({
              where: { id: stale.id },
              data: {
                status: 'released',
                releasedAt: new Date(),
              },
            });
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
      ...(status !== 'all' ? { status } : {}),
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
