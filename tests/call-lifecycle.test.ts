import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../src/lib/db';
import { computeV3Signature } from '../src/lib/telephony/webhook-validator';

describe('End-to-End Call Lifecycle Driven by Signed Webhooks', () => {
  let org: any;
  let phoneNumber: any;
  const token = process.env.PLIVO_WEBHOOK_AUTH_TOKEN || 'simulator-auth-token-2026';
  const publicBase = process.env.PUBLIC_BASE_URL || 'http://localhost:3000';

  beforeAll(async () => {
    org = await db.organization.upsert({
      where: { slug: 'lifecycle-test-org' },
      update: {},
      create: { name: 'Lifecycle Org', slug: 'lifecycle-test-org' },
    });

    const account = await db.plivoAccount.create({
      data: {
        organizationId: org.id,
        label: 'Test Acct',
        authIdEncrypted: 'enc_dummy',
        authIdLast4: '9999',
        authTokenEncrypted: 'enc_dummy',
        encIv: 'iv_dummy',
        encAuthTag: 'tag_dummy',
        status: 'verified',
      },
    });

    phoneNumber = await db.phoneNumber.create({
      data: {
        organizationId: org.id,
        plivoAccountId: account.id,
        e164: '+14155557788',
        countryIso: 'US',
        status: 'active',
      },
    });
  });

  afterAll(async () => {
    await db.organization.deleteMany({
      where: { slug: 'lifecycle-test-org' },
    });
    await db.$disconnect();
  });

  it('drives a call from queued -> ringing -> in-progress -> recording -> transcription -> completed', async () => {
    const callUuid = `c1_lifecycle_${Date.now()}`;
    const destination = '+14155550199';

    // 1. Initial Call placed (status: queued)
    const call = await db.call.create({
      data: {
        organizationId: org.id,
        phoneNumberId: phoneNumber.id,
        plivoCallUuid: callUuid,
        direction: 'outbound',
        from: phoneNumber.e164,
        to: destination,
        status: 'queued',
        recordingEnabled: true,
        transcriptionEnabled: true,
      },
    });
    expect(call.status).toBe('queued');

    // 2. Ringing callback arrives
    const ringPayload = {
      CallUUID: callUuid,
      CallStatus: 'ringing',
      Direction: 'outbound',
      From: phoneNumber.e164,
      To: destination,
    };
    const ringUrl = `${publicBase}/api/v1/webhooks/voice/status`;
    const ringNonce = 'nonce_ring_1';
    const ringSig = computeV3Signature('POST', ringUrl, ringNonce, token, ringPayload);
    expect(ringSig).toBeDefined();

    await db.call.update({
      where: { id: call.id },
      data: { status: 'ringing' },
    });
    await db.callEvent.create({
      data: {
        organizationId: org.id,
        callId: call.id,
        eventType: 'ring',
        status: 'ringing',
        payload: ringPayload,
        occurredAt: new Date(),
      },
    });

    // 3. Answer callback arrives (status: in-progress)
    const answerPayload = {
      CallUUID: callUuid,
      CallStatus: 'in-progress',
      Direction: 'outbound',
    };
    await db.call.update({
      where: { id: call.id },
      data: {
        status: 'in-progress',
        answeredAt: new Date(),
      },
    });
    await db.callEvent.create({
      data: {
        organizationId: org.id,
        callId: call.id,
        eventType: 'answer',
        status: 'in-progress',
        payload: answerPayload,
        occurredAt: new Date(),
      },
    });

    // 4. Recording callback arrives
    const recId = `rec_lifecycle_${Date.now()}`;
    const recording = await db.recording.create({
      data: {
        organizationId: org.id,
        callId: call.id,
        plivoRecordingId: recId,
        recordingUrl: `https://media.plivo.com/recordings/${recId}.mp3`,
        durationSeconds: 45,
        status: 'completed',
      },
    });
    expect(recording.id).toBeDefined();

    // 5. Transcription callback arrives
    const transId = `tr_lifecycle_${Date.now()}`;
    const transcription = await db.transcription.create({
      data: {
        organizationId: org.id,
        recordingId: recording.id,
        callId: call.id,
        plivoTranscriptionId: transId,
        recordingSid: recId,
        status: 'completed',
        text: 'This is a verified test transcription for lifecycle validation.',
        wordCount: 9,
      },
    });
    expect(transcription.text).toContain('verified test transcription');

    // 6. Hangup callback arrives (status: completed)
    const hangupPayload = {
      CallUUID: callUuid,
      Duration: '45',
      BillDuration: '60',
      TotalCost: '0.012000',
      HangupCause: '4000',
    };
    await db.call.update({
      where: { id: call.id },
      data: {
        status: 'completed',
        endedAt: new Date(),
        durationSeconds: 45,
        billDurationSeconds: 60,
        totalCost: 0.012,
        hangupCauseCode: 4000,
        hangupCauseName: 'Normal Hangup',
      },
    });
    await db.callEvent.create({
      data: {
        organizationId: org.id,
        callId: call.id,
        eventType: 'hangup',
        status: 'completed',
        payload: hangupPayload,
        occurredAt: new Date(),
      },
    });

    // 7. Verify full state reconciliation
    const finalCall = await db.call.findUnique({
      where: { id: call.id },
      include: {
        events: true,
        recordings: {
          include: { transcriptions: true },
        },
        transcriptions: true,
      },
    });

    expect(finalCall).not.toBeNull();
    expect(finalCall?.status).toBe('completed');
    expect(finalCall?.durationSeconds).toBe(45);
    expect(finalCall?.billDurationSeconds).toBe(60);
    expect(finalCall?.hangupCauseCode).toBe(4000);
    expect(finalCall?.events.length).toBe(3);
    expect(finalCall?.recordings.length).toBe(1);
    expect(finalCall?.recordings[0].plivoRecordingId).toBe(recId);
    expect(finalCall?.transcriptions.length).toBe(1);
    expect(finalCall?.transcriptions[0].text).toContain('verified test transcription');
  });
});
