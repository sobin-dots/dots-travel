import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const queryOrgId = url.searchParams.get('orgId');
    const body = await req.json().catch(() => ({}));

    let org = null;
    if (queryOrgId) {
      org = await db.organization.findUnique({ where: { id: queryOrgId } });
    }

    const sender = body.sender || body.from || 'MSG91';
    const destination = body.receiver || body.to || body.mobile || '';
    const messageId = body.requestId || body.msgId || `msg_${crypto.randomBytes(8).toString('hex')}`;
    const text = body.content || body.message || body.text || '';
    const status = (body.status || 'delivered').toLowerCase();

    if (!org && destination) {
      const phone = await db.phoneNumber.findFirst({
        where: { e164: destination },
        include: { organization: true },
      });
      if (phone?.organization) {
        org = phone.organization;
      }
    }

    if (!org) {
      org = await db.organization.findFirst();
    }

    if (org && text) {
      const existingMessage = await db.message.findFirst({
        where: { plivoMessageUuid: messageId },
      });

      if (existingMessage) {
        await db.message.update({
          where: { id: existingMessage.id },
          data: { status, deliveredAt: new Date() },
        });
      } else {
        await db.message.create({
          data: {
            organizationId: org.id,
            plivoMessageUuid: messageId,
            direction: 'inbound',
            type: 'sms',
            from: sender,
            to: destination,
            body: text,
            status,
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
