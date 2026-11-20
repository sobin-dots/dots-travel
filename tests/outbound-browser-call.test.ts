import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { db } from '../src/lib/db';
import { signAccessToken } from '../src/lib/auth-tokens';
import { computeV3Signature } from '../src/lib/telephony/webhook-validator';
import {
  extractPlivoCallUuid,
  isOutboundPlivoCall,
  parseDialBLegOutcome,
  resolveLiveCallPollState,
  resolveOutboundBrowserFinalStatus,
} from '../src/lib/telephony/outbound-browser-call';

describe('Outbound browser call state helpers', () => {
  it('extracts callUUID from callInfo or client session fallbacks', () => {
    expect(extractPlivoCallUuid({ callUUID: 'uuid-1' }, { callUUID: 'uuid-2' })).toBe('uuid-1');
    expect(extractPlivoCallUuid({ call_uuid: 'uuid-3' }, null)).toBe('uuid-3');
    expect(extractPlivoCallUuid(null, { callUUID: 'uuid-client' })).toBe('uuid-client');
    expect(extractPlivoCallUuid(null, { _currentSession: { callUUID: 'uuid-sess' } })).toBe('uuid-sess');
    expect(extractPlivoCallUuid(null, null)).toBeNull();
  });

  it('distinguishes outbound vs inbound calls reliably', () => {
    expect(isOutboundPlivoCall({ direction: 'outgoing' }, 'inbound')).toBe(true);
    expect(isOutboundPlivoCall({ direction: 'incoming' }, 'outbound')).toBe(false);
    expect(isOutboundPlivoCall(null, 'outbound')).toBe(true);
    expect(isOutboundPlivoCall(null, 'inbound')).toBe(false);
    expect(isOutboundPlivoCall(null, null)).toBe(false);
  });

  it('parses Dial B-leg hangup outcomes without falsely marking unanswered calls completed', () => {
    expect(
      parseDialBLegOutcome({
        DialBLegStatus: 'no-answer',
        DialBLegDuration: '0',
        DialBLegHangupCauseName: 'NO_ANSWER',
      })
    ).toEqual({
      answered: false,
      status: 'no-answer',
      durationSeconds: 0,
      hangupCauseName: 'NO_ANSWER',
    });

    expect(
      parseDialBLegOutcome({
        DialBLegStatus: 'busy',
        DialBLegDuration: '0',
        DialBLegHangupCauseName: 'USER_BUSY',
      })
    ).toEqual({
      answered: false,
      status: 'busy',
      durationSeconds: 0,
      hangupCauseName: 'USER_BUSY',
    });

    expect(
      parseDialBLegOutcome({
        DialBLegStatus: 'cancel',
        DialBLegDuration: '0',
        DialBLegHangupCauseName: 'ORIGINATOR_CANCEL',
      })
    ).toEqual({
      answered: false,
      status: 'canceled',
      durationSeconds: 0,
      hangupCauseName: 'ORIGINATOR_CANCEL',
    });

    expect(
      parseDialBLegOutcome({
        DialBLegStatus: 'completed',
        DialBLegDuration: '42',
        DialBLegHangupCauseName: 'NORMAL_CLEARING',
      })
    ).toEqual({
      answered: true,
      status: 'completed',
      durationSeconds: 42,
      hangupCauseName: 'NORMAL_CLEARING',
    });
  });

  it('maps unanswered A-leg NORMAL_CLEARING hangup to canceled instead of completed', () => {
    expect(
      resolveOutboundBrowserFinalStatus(
        { status: 'ringing', answeredAt: null },
        { hangupCauseCode: 4000, hangupCauseName: 'NORMAL_CLEARING', hangupSource: 'Caller' }
      )
    ).toBe('canceled');

    expect(
      resolveOutboundBrowserFinalStatus(
        { status: 'busy', answeredAt: null },
        { hangupCauseCode: 4000, hangupCauseName: 'NORMAL_CLEARING' }
      )
    ).toBe('busy');

    expect(
      resolveOutboundBrowserFinalStatus(
        { status: 'in-progress', answeredAt: new Date() },
        { hangupCauseCode: 4000, hangupCauseName: 'NORMAL_CLEARING' }
      )
    ).toBe('completed');
  });

  it('derives live poll state strictly from B-leg answer and terminal timestamps', () => {
    expect(resolveLiveCallPollState(null)).toEqual({ state: 'calling', answered: false, ended: false });
    expect(resolveLiveCallPollState({ status: 'ringing', answeredAt: null, endedAt: null })).toEqual({
      state: 'ringing',
      answered: false,
      ended: false,
    });
    expect(resolveLiveCallPollState({ status: 'in-progress', answeredAt: new Date(), endedAt: null })).toEqual({
      state: 'connected',
      answered: true,
      ended: false,
    });
    expect(resolveLiveCallPollState({ status: 'no-answer', answeredAt: null, endedAt: new Date() })).toEqual({
      state: 'ended',
      answered: false,
      ended: true,
    });
  });
});

describe('Outbound browser call webhook & live-status lifecycle', () => {
  const slug = `outbound-browser-test-${Date.now()}`;
  const testCallerNumber = `+1415555${String(Date.now()).slice(-4)}`;
  const token = process.env.PLIVO_WEBHOOK_AUTH_TOKEN || 'simulator-auth-token-2026';
  let orgId = '';
  let userId = '';
  let bearer = '';
  const createdCallUuids: string[] = [];

  function buildSignedPost(url: string, payload: Record<string, string>) {
    const nonce = `nonce_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const sig = computeV3Signature('POST', url, nonce, token, payload);
    return new NextRequest(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-plivo-signature-v3': sig,
        'x-plivo-signature-v3-nonce': nonce,
      },
      body: JSON.stringify(payload),
    });
  }

  beforeAll(async () => {
    const org = await db.organization.create({
      data: { name: 'Outbound Browser Test Org', slug },
    });
    orgId = org.id;

    const user = await db.user.create({
      data: {
        email: `${slug}@example.com`,
        name: 'Outbound Agent',
        passwordHash: 'test-hash',
        status: 'active',
      },
    });
    userId = user.id;

    await db.membership.create({
      data: {
        organizationId: org.id,
        userId: user.id,
        role: 'operator',
      },
    });

    const account = await db.plivoAccount.create({
      data: {
        organizationId: org.id,
        label: 'Test Acct',
        authIdEncrypted: 'enc_dummy',
        authIdLast4: '8888',
        authTokenEncrypted: 'enc_dummy',
        encIv: 'iv_dummy',
        encAuthTag: 'tag_dummy',
        status: 'verified',
      },
    });

    await db.phoneNumber.create({
      data: {
        organizationId: org.id,
        plivoAccountId: account.id,
        e164: testCallerNumber,
        countryIso: 'US',
        status: 'active',
      },
    });

    bearer = await signAccessToken({
      userId: user.id,
      email: user.email,
      organizationId: org.id,
      role: 'operator',
    });
  });

  afterAll(async () => {
    if (createdCallUuids.length > 0) {
      await db.call.deleteMany({ where: { plivoCallUuid: { in: createdCallUuids } } });
      await db.webhookEvent.deleteMany({
        where: {
          OR: createdCallUuids.map((uuid) => ({ dedupeKey: { startsWith: uuid } })),
        },
      });
    }
    if (orgId) {
      await db.organization.deleteMany({ where: { id: orgId } });
    }
    if (userId) {
      await db.user.deleteMany({ where: { id: userId } });
    }
    await db.$disconnect();
  });

  it('keeps call in ringing until DialAction=answer arrives, then transitions live-status to connected', async () => {
    const { POST: answerPost } = await import('../src/app/api/v1/webhooks/voice/answer/route');
    const { POST: statusPost } = await import('../src/app/api/v1/webhooks/voice/status/route');
    const { POST: dialPost } = await import('../src/app/api/v1/webhooks/voice/dial/route');
    const { POST: hangupPost } = await import('../src/app/api/v1/webhooks/voice/hangup/route');
    const { GET: liveStatusGet } = await import('../src/app/api/v1/calls/live-status/route');

    const callUuid = `out_browser_ans_${Date.now()}`;
    createdCallUuids.push(callUuid);
    const bLegUuid = `bleg_ans_${Date.now()}`;
    const answerUrl = `http://localhost:3000/api/v1/webhooks/voice/answer?orgId=${orgId}`;

    // 1. Plivo hits /answer when browser WebRTC A-leg connects to Plivo
    const answerRes = await answerPost(
      buildSignedPost(answerUrl, {
        CallUUID: callUuid,
        From: 'sip:agent_test@phone.plivo.com',
        To: '+919626333162',
        Direction: 'outbound',
        'X-PH-callerId': testCallerNumber,
      })
    );
    expect(answerRes.status).toBe(200);
    const xml = await answerRes.text();
    expect(xml).toContain('dialMusic="real"');
    expect(xml).toContain(`/api/v1/webhooks/voice/dial?orgId=${orgId}`);
    expect(xml).toContain('<Number>+919626333162</Number>');

    // 2. Immediately after A-leg answer, DB call must still be ringing with answeredAt=null
    const liveBeforePickup = await liveStatusGet(
      new NextRequest(`http://localhost:3000/api/v1/calls/live-status?callUuid=${callUuid}`, {
        headers: { Authorization: `Bearer ${bearer}` },
      })
    );
    expect(liveBeforePickup.status).toBe(200);
    const beforeData = await liveBeforePickup.json();
    expect(beforeData.found).toBe(true);
    expect(beforeData.status).toBe('ringing');
    expect(beforeData.state).toBe('ringing');
    expect(beforeData.answered).toBe(false);

    // 3. Even if an A-leg status webhook reports in-progress before B-leg answers, keep ringing
    const statusUrl = `http://localhost:3000/api/v1/webhooks/voice/status?orgId=${orgId}`;
    const statusRes = await statusPost(
      buildSignedPost(statusUrl, {
        CallUUID: callUuid,
        CallStatus: 'in-progress',
      })
    );
    expect(statusRes.status).toBe(200);
    const afterALegStatus = await db.call.findUnique({ where: { plivoCallUuid: callUuid } });
    expect(afterALegStatus?.status).toBe('ringing');
    expect(afterALegStatus?.answeredAt).toBeNull();

    // 4. Customer picks up -> Plivo posts DialAction=answer to /dial
    const dialUrl = `http://localhost:3000/api/v1/webhooks/voice/dial?orgId=${orgId}`;
    const dialAnswerRes = await dialPost(
      buildSignedPost(dialUrl, {
        CallUUID: callUuid,
        DialALegUUID: callUuid,
        DialBLegUUID: bLegUuid,
        DialAction: 'answer',
        DialBLegStatus: 'in-progress',
      })
    );
    expect(dialAnswerRes.status).toBe(200);

    // 5. live-status now reports connected + answeredAt
    const liveAfterPickup = await liveStatusGet(
      new NextRequest(`http://localhost:3000/api/v1/calls/live-status?callUuid=${callUuid}`, {
        headers: { Authorization: `Bearer ${bearer}` },
      })
    );
    const afterData = await liveAfterPickup.json();
    expect(afterData.found).toBe(true);
    expect(afterData.status).toBe('in-progress');
    expect(afterData.state).toBe('connected');
    expect(afterData.answered).toBe(true);
    expect(afterData.answeredAt).toBeTruthy();

    // 6. Call ends -> hangup marks completed
    const hangupUrl = `http://localhost:3000/api/v1/webhooks/voice/hangup?orgId=${orgId}`;
    const hangupRes = await hangupPost(
      buildSignedPost(hangupUrl, {
        CallUUID: callUuid,
        Duration: '28',
        BillDuration: '30',
        HangupCause: '4000',
        HangupCauseName: 'NORMAL_CLEARING',
      })
    );
    expect(hangupRes.status).toBe(200);
    const finalCall = await db.call.findUnique({ where: { plivoCallUuid: callUuid } });
    expect(finalCall?.status).toBe('completed');
    expect(finalCall?.durationSeconds).toBe(28);
  });

  it('marks an unanswered outbound browser call canceled/no-answer (never connected or completed)', async () => {
    const { POST: answerPost } = await import('../src/app/api/v1/webhooks/voice/answer/route');
    const { POST: dialPost } = await import('../src/app/api/v1/webhooks/voice/dial/route');
    const { POST: hangupPost } = await import('../src/app/api/v1/webhooks/voice/hangup/route');
    const { GET: liveStatusGet } = await import('../src/app/api/v1/calls/live-status/route');

    const callUuid = `out_browser_unans_${Date.now()}`;
    createdCallUuids.push(callUuid);
    const bLegUuid = `bleg_unans_${Date.now()}`;
    const answerUrl = `http://localhost:3000/api/v1/webhooks/voice/answer?orgId=${orgId}`;

    const answerRes = await answerPost(
      buildSignedPost(answerUrl, {
        CallUUID: callUuid,
        From: 'sip:agent_test@phone.plivo.com',
        To: '+919626333162',
        Direction: 'outbound',
        'X-PH-callerId': testCallerNumber,
      })
    );
    expect(answerRes.status).toBe(200);

    // Agent hangs up before customer answers: Plivo fires DialAction=hangup with cancel & 0s B-leg
    const dialUrl = `http://localhost:3000/api/v1/webhooks/voice/dial?orgId=${orgId}`;
    const dialHangupRes = await dialPost(
      buildSignedPost(dialUrl, {
        CallUUID: callUuid,
        DialALegUUID: callUuid,
        DialBLegUUID: bLegUuid,
        DialAction: 'hangup',
        DialBLegStatus: 'cancel',
        DialBLegDuration: '0',
        DialBLegHangupCauseName: 'ORIGINATOR_CANCEL',
      })
    );
    expect(dialHangupRes.status).toBe(200);

    // A-leg hangup reports NORMAL_CLEARING (4000) with 6s of ringing time
    const hangupUrl = `http://localhost:3000/api/v1/webhooks/voice/hangup?orgId=${orgId}`;
    const hangupRes = await hangupPost(
      buildSignedPost(hangupUrl, {
        CallUUID: callUuid,
        Duration: '6',
        BillDuration: '0',
        HangupCause: '4000',
        HangupCauseName: 'NORMAL_CLEARING',
        HangupSource: 'Caller',
      })
    );
    expect(hangupRes.status).toBe(200);

    const finalCall = await db.call.findUnique({ where: { plivoCallUuid: callUuid } });
    expect(finalCall?.status).toBe('canceled');
    expect(finalCall?.answeredAt).toBeNull();
    expect(finalCall?.durationSeconds).toBe(0);

    const liveAfterCancel = await liveStatusGet(
      new NextRequest(`http://localhost:3000/api/v1/calls/live-status?callUuid=${callUuid}`, {
        headers: { Authorization: `Bearer ${bearer}` },
      })
    );
    const cancelData = await liveAfterCancel.json();
    expect(cancelData.state).toBe('ended');
    expect(cancelData.answered).toBe(false);
  });
});
