import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { processIncomingWebhook } from '@/lib/webhook-helper';
import { recordInboundAnswer } from '@/lib/telephony/agent-routing';

export const runtime = 'nodejs';
export async function GET(req: NextRequest) {
  return POST(req);
}

export async function POST(req: NextRequest) {
  const attempt = Number(req.nextUrl.searchParams.get('attempt') || '0');
  if (!Number.isSafeInteger(attempt) || attempt < 0) return NextResponse.json({ error: 'Invalid call attempt' }, { status: 400 });
  const result = await processIncomingWebhook(req, 'voice', p => `${p.DialALegUUID || p.CallUUID}_dial_${attempt}_${p.DialAction}_${p.DialBLegUUID}`);
  if (!result.valid) return result.errorResponse!;
  const { params } = result;
  const callUuid = params.DialALegUUID || params.CallUUID;
  const call = callUuid && await db.call.findUnique({ where: { plivoCallUuid: callUuid } });
  const orgId = req.nextUrl.searchParams.get('orgId');
  if (!call || (orgId && orgId !== call.organizationId)) return NextResponse.json({ error: 'Call not found' }, { status: 404 });
  if (['answer', 'connected'].includes(String(params.DialAction).toLowerCase())) {
    await recordInboundAnswer({ organizationId: call.organizationId, callUuid, attempt });
  } else if (String(params.DialAction).toLowerCase() === 'hangup' &&
    (String(params.DialBLegStatus).toLowerCase() === 'completed' || Number(params.DialBLegDuration) > 0 || call.agentAnsweredAt)) {
    // The browser leg can end before the parent hangup/action callback arrives.
    const duration = String(params.DialBLegDuration ?? '');
    await recordInboundAnswer({ organizationId: call.organizationId, callUuid, attempt, completed: true,
      durationSeconds: /^\d+$/.test(duration) ? Number(duration) : undefined });
  }
  if (result.webhookEventId) await db.webhookEvent.update({ where: { id: result.webhookEventId }, data: { status: 'processed', processedAt: new Date() } });
  return NextResponse.json({ success: true });
}
