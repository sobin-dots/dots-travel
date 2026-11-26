import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-auth';
import { resolveLiveCallPollState } from '@/lib/telephony/outbound-browser-call';

export const runtime = 'nodejs';

/**
 * Lightweight, lock-free tenant-scoped poll endpoint used by the in-browser
 * WebRTC dialer to determine when the customer B-leg of an outbound `<Dial>`
 * has actually answered (via Plivo's `DialAction=answer` callback).
 */
export async function GET(req: NextRequest) {
  const { auth, errorResponse } = await authenticateRequest(req, 'viewer');
  if (errorResponse) return errorResponse;

  const callUuid = (req.nextUrl.searchParams.get('callUuid') || '').trim();
  if (!callUuid) {
    return NextResponse.json(
      { error: 'callUuid query parameter is required' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const call = await db.call.findFirst({
    where: {
      organizationId: auth!.organizationId,
      plivoCallUuid: callUuid,
    },
    select: {
      id: true,
      plivoCallUuid: true,
      direction: true,
      status: true,
      startedAt: true,
      answeredAt: true,
      endedAt: true,
      durationSeconds: true,
      hangupCauseName: true,
      requestedMode: true,
      requestedParams: true,
    },
  });

  if (!call) {
    return NextResponse.json(
      {
        found: false,
        callUuid,
        state: 'calling',
        answered: false,
        ended: false,
      },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const resolved = resolveLiveCallPollState(call);

  return NextResponse.json(
    {
      found: true,
      callId: call.id,
      callUuid: call.plivoCallUuid,
      direction: call.direction,
      status: call.status,
      state: resolved.state,
      answered: resolved.answered,
      ended: resolved.ended,
      answeredAt: call.answeredAt,
      endedAt: call.endedAt,
      durationSeconds: call.durationSeconds,
      hangupCauseName: call.hangupCauseName,
    },
    { status: 200, headers: { 'Cache-Control': 'no-store' } }
  );
}
