import 'dotenv/config';
import { db } from '../src/lib/db';
import { hashPassword } from '../src/lib/auth-tokens';
import { encryptData } from '../src/lib/crypto';

async function main() {
  console.log('[Seed] Seeding database...');

  // 1. Create Organization
  const org = await db.organization.upsert({
    where: { slug: 'acme-comms' },
    update: {},
    create: {
      name: 'Acme Communications',
      slug: 'acme-comms',
      transcriptionDefaultEnabled: true,
      transcriptionLanguage: 'en-US',
      recordingRetentionDays: 90,
      notificationEmail: 'alerts@example.com',
    },
  });
  console.log(`[Seed] Organization: ${org.name} (${org.id})`);

  // 2. Create Admin User
  const email = process.env.SEED_OWNER_EMAIL || 'admin@example.com';
  const password = process.env.SEED_OWNER_PASSWORD || 'AdminSecurePassword2026!';
  const passwordHash = await hashPassword(password);

  const user = await db.user.upsert({
    where: { email },
    update: { passwordHash },
    create: {
      email,
      name: 'Admin Operator',
      passwordHash,
      status: 'active',
    },
  });
  console.log(`[Seed] Admin User: ${user.email} (${user.id})`);

  // 3. Create Membership
  await db.membership.upsert({
    where: {
      organizationId_userId: {
        organizationId: org.id,
        userId: user.id,
      },
    },
    update: { role: 'owner' },
    create: {
      organizationId: org.id,
      userId: user.id,
      role: 'owner',
    },
  });

  // 4. Create Encrypted PlivoAccount
  const isLive = process.env.TELEPHONY_MODE === 'live' && !!process.env.PLIVO_AUTH_ID;
  const rawAuthId = isLive ? process.env.PLIVO_AUTH_ID! : 'MAMOCKAUTHID12345678';
  const rawAuthToken = isLive ? (process.env.PLIVO_AUTH_TOKEN || '') : 'mock-auth-token-super-secret-999';
  const encAuthId = encryptData(rawAuthId);
  const encAuthToken = encryptData(rawAuthToken);
  const last4 = rawAuthId.slice(-4);
  const label = isLive ? 'Live Carrier Account (Plivo)' : 'Primary Account (Simulated)';

  const existingAccount = await db.plivoAccount.findFirst({
    where: { organizationId: org.id },
  });

  const plivoAccount = existingAccount
    ? await db.plivoAccount.update({
        where: { id: existingAccount.id },
        data: {
          label,
          authIdEncrypted: encAuthId.ciphertext,
          authIdLast4: last4,
          authTokenEncrypted: encAuthToken.ciphertext,
          encIv: encAuthId.iv,
          encAuthTag: encAuthId.authTag,
          encKeyVersion: encAuthId.keyVersion,
          status: 'verified',
          lastVerifiedAt: new Date(),
        },
      })
    : await db.plivoAccount.create({
        data: {
          organizationId: org.id,
          label,
          authIdEncrypted: encAuthId.ciphertext,
          authIdLast4: last4,
          authTokenEncrypted: encAuthToken.ciphertext,
          encIv: encAuthId.iv,
          encAuthTag: encAuthId.authTag,
          encKeyVersion: encAuthId.keyVersion,
          status: 'verified',
          lastVerifiedAt: new Date(),
        },
      });

  // 5. Create Default Plivo Application
  const publicBaseUrl = process.env.PUBLIC_BASE_URL || 'http://localhost:3000';
  const app = await db.application.upsert({
    where: { plivoAppId: 'app-sim-default' },
    update: {},
    create: {
      organizationId: org.id,
      plivoAccountId: plivoAccount.id,
      plivoAppId: 'app-sim-default',
      name: 'Default Voice & SMS App',
      answerUrl: `${publicBaseUrl}/api/v1/webhooks/voice/answer`,
      hangupUrl: `${publicBaseUrl}/api/v1/webhooks/voice/hangup`,
      messageUrl: `${publicBaseUrl}/api/v1/webhooks/messages/inbound`,
      defaultNumberApp: true,
    },
  });

  // 6. Create Phone Numbers
  const num1 = await db.phoneNumber.upsert({
    where: {
      organizationId_e164: {
        organizationId: org.id,
        e164: '+14155552671',
      },
    },
    update: {},
    create: {
      organizationId: org.id,
      plivoAccountId: plivoAccount.id,
      applicationId: app.id,
      e164: '+14155552671',
      countryIso: 'US',
      friendlyName: 'Support Hotline',
      recordCalls: true,
      transcribeEnabled: true,
      transcriptionLanguage: 'en-US',
      monthlyRental: 1.0,
      smsRate: 0.0075,
      voiceRate: 0.012,
      status: 'active',
      purchasedAt: new Date(),
    },
  });

  const num2 = await db.phoneNumber.upsert({
    where: {
      organizationId_e164: {
        organizationId: org.id,
        e164: '+14155552672',
      },
    },
    update: {},
    create: {
      organizationId: org.id,
      plivoAccountId: plivoAccount.id,
      applicationId: app.id,
      e164: '+14155552672',
      countryIso: 'US',
      friendlyName: 'Sales Dispatch',
      recordCalls: true,
      transcribeEnabled: false, // Explicitly false for policy demonstration
      transcriptionLanguage: 'en-US',
      monthlyRental: 1.0,
      smsRate: 0.0075,
      voiceRate: 0.012,
      status: 'active',
      purchasedAt: new Date(),
    },
  });

  // 7. Seed Sample Completed Call with Recording and Transcript
  const sampleCallUuid = 'c1sample0001deadbeef00000001';
  const call = await db.call.upsert({
    where: { plivoCallUuid: sampleCallUuid },
    update: {},
    create: {
      organizationId: org.id,
      phoneNumberId: num1.id,
      plivoCallUuid: sampleCallUuid,
      direction: 'inbound',
      status: 'completed',
      from: '+14155550199',
      to: num1.e164,
      startedAt: new Date(Date.now() - 3600000),
      answeredAt: new Date(Date.now() - 3590000),
      endedAt: new Date(Date.now() - 3545000),
      durationSeconds: 45,
      billDurationSeconds: 60,
      totalCost: 0.012,
      hangupCauseCode: 4000,
      hangupCauseName: 'Normal Hangup',
      recordingEnabled: true,
      transcriptionEnabled: true,
      transcriptionLanguage: 'en-US',
      requestedMode: 'xml',
    },
  });

  const sampleRecId = 'rec_sample0001feedbeef';
  const rec = await db.recording.upsert({
    where: { plivoRecordingId: sampleRecId },
    update: {},
    create: {
      organizationId: org.id,
      callId: call.id,
      plivoRecordingId: sampleRecId,
      recordingUrl: 'https://media.plivo.com/recordings/sample0001.mp3',
      durationSeconds: 45,
      fileFormat: 'mp3',
      status: 'completed',
      storageCost: 0.0003,
      startedAt: new Date(Date.now() - 3590000),
      endedAt: new Date(Date.now() - 3545000),
    },
  });

  await db.transcription.upsert({
    where: { plivoTranscriptionId: 'tr_sample0001cafebabe' },
    update: {},
    create: {
      organizationId: org.id,
      recordingId: rec.id,
      callId: call.id,
      plivoTranscriptionId: 'tr_sample0001cafebabe',
      recordingSid: sampleRecId,
      type: 'transcription',
      status: 'completed',
      language: 'en-US',
      text: 'Thank you for calling Acme Communications support. Your issue regarding routing configuration has been noted and resolved.',
      wordCount: 18,
      source: 'callback',
    },
  });

  // 8. Seed Message Thread & Messages
  const thread = await db.messageThread.upsert({
    where: {
      organizationId_ownNumberE164_counterpartE164: {
        organizationId: org.id,
        ownNumberE164: num1.e164,
        counterpartE164: '+14155550199',
      },
    },
    update: {},
    create: {
      organizationId: org.id,
      ownNumberE164: num1.e164,
      counterpartE164: '+14155550199',
      lastMessageAt: new Date(),
      unreadCount: 0,
    },
  });

  await db.message.upsert({
    where: { plivoMessageUuid: 'm1sample0001msg0001' },
    update: {},
    create: {
      organizationId: org.id,
      phoneNumberId: num1.id,
      threadId: thread.id,
      plivoMessageUuid: 'm1sample0001msg0001',
      direction: 'inbound',
      type: 'sms',
      from: '+14155550199',
      to: num1.e164,
      body: 'Hi, does your platform support webhook verification?',
      status: 'delivered',
      units: 1,
      totalRate: 0.0075,
      totalAmount: 0.0075,
      sentAt: new Date(Date.now() - 1800000),
      deliveredAt: new Date(Date.now() - 1799000),
    },
  });

  await db.message.upsert({
    where: { plivoMessageUuid: 'm1sample0001msg0002' },
    update: {},
    create: {
      organizationId: org.id,
      phoneNumberId: num1.id,
      threadId: thread.id,
      plivoMessageUuid: 'm1sample0001msg0002',
      direction: 'outbound',
      type: 'sms',
      from: num1.e164,
      to: '+14155550199',
      body: 'Yes, full HMAC-SHA256 Plivo V3 signature verification is built-in!',
      status: 'delivered',
      units: 1,
      totalRate: 0.0075,
      totalAmount: 0.0075,
      sentAt: new Date(Date.now() - 900000),
      deliveredAt: new Date(Date.now() - 899000),
    },
  });

  // 12. Create Sample Contacts
  await db.contact.upsert({
    where: {
      organizationId_phone: {
        organizationId: org.id,
        phone: '+14155550199',
      },
    },
    update: {},
    create: {
      organizationId: org.id,
      name: 'Sarah Connor',
      phone: '+14155550199',
      email: 'sarah@cyberdyne.corp',
      company: 'Cyberdyne Systems',
      notes: 'Key enterprise client - primary contact',
    },
  });

  await db.contact.upsert({
    where: {
      organizationId_phone: {
        organizationId: org.id,
        phone: '+14155550288',
      },
    },
    update: {},
    create: {
      organizationId: org.id,
      name: 'John Miller',
      phone: '+14155550288',
      email: 'jmiller@apexlogistics.io',
      company: 'Apex Logistics',
      notes: 'Support lead for dispatch operations',
    },
  });

  // 13. Create Sample Suppliers
  await db.supplier.upsert({
    where: {
      organizationId_email: {
        organizationId: org.id,
        email: 'reservations@grandhorizon.resorts',
      },
    },
    update: {},
    create: {
      organizationId: org.id,
      name: 'Grand Horizon Luxury Resorts & Hotels',
      category: 'hotels',
      email: 'reservations@grandhorizon.resorts',
      phone: '+18005554321',
      contactPerson: 'Elena Rostova',
      notes: 'Premier 5-star hotel and villa partner across Europe and North America',
    },
  });

  await db.supplier.upsert({
    where: {
      organizationId_email: {
        organizationId: org.id,
        email: 'charters@blueskyaviation.aero',
      },
    },
    update: {},
    create: {
      organizationId: org.id,
      name: 'BlueSky Air Charters & Transfer Services',
      category: 'flights',
      email: 'charters@blueskyaviation.aero',
      phone: '+18005558765',
      contactPerson: 'Capt. James Sterling',
      notes: 'Private air transfer and premium luxury group transport services',
    },
  });

  console.log('[Seed] Database seeding completed successfully.');
}

main()
  .catch((e) => {
    console.error('[Seed] Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
