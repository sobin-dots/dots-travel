import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const queryOrgId = url.searchParams.get('orgId');
    const body = await req.json().catch(() => ({}));

    // Resolve tenant organization via query param or callerId
    let org = null;
    if (queryOrgId) {
      org = await db.organization.findUnique({ where: { id: queryOrgId } });
    }

    const callerId = body.caller_id || body.callerId || body.from || '';
    const destination = body.destination || body.to || '';
    const callUuid = body.call_id || body.call_uuid || body.requestId || `msg91_${crypto.randomBytes(8).toString('hex')}`;
    const status = (body.status || 'completed').toLowerCase();

    if (!org && (callerId || destination)) {
      const phone = await db.phoneNumber.findFirst({
        where: {
          OR: [
            { e164: callerId },
            { e164: destination },
          ],
        },
        include: { organization: true },
      });
      if (phone?.organization) {
        org = phone.organization;
      }
    }

    if (!org) {
      org = await db.organization.findFirst();
    }

    if (org) {
      // Find or create call record
      const existingCall = await db.call.findFirst({
        where: { plivoCallUuid: callUuid },
      });

      if (existingCall) {
        await db.call.update({
          where: { id: existingCall.id },
          data: {
            status,
            endedAt: status === 'completed' || status === 'hangup' ? new Date() : undefined,
            durationSeconds: Number(body.duration || existingCall.durationSeconds || 0),
          },
        });

        await db.callEvent.create({
          data: {
            organizationId: org.id,
            callId: existingCall.id,
            eventType: status === 'answered' ? 'answer' : 'hangup',
            status,
            payload: body,
            occurredAt: new Date(),
          },
        });
      } else {
        const newCall = await db.call.create({
          data: {
            organizationId: org.id,
            plivoCallUuid: callUuid,
            from: callerId || 'MSG91 Line',
            to: destination || 'Customer',
            direction: 'outbound',
            status,
            startedAt: new Date(),
            answeredAt: new Date(),
          },
        });

        await db.callEvent.create({
          data: {
            organizationId: org.id,
            callId: newCall.id,
            eventType: 'answer',
            status,
            payload: body,
            occurredAt: new Date(),
          },
        });
      }
    }

    return NextResponse.json({ success: true, api_id: `api_${crypto.randomBytes(6).toString('hex')}` });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
