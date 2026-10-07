-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "transcriptionDefaultEnabled" BOOLEAN NOT NULL DEFAULT true,
    "transcriptionLanguage" TEXT NOT NULL DEFAULT 'en-US',
    "recordingRetentionDays" INTEGER,
    "notificationEmail" TEXT,
    "redactMessageContent" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "mfaSecretEnc" TEXT,
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "mfaRecoveryCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'active',
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'operator',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'console',
    "tokenHash" TEXT NOT NULL,
    "familyId" TEXT,
    "rotatedFromId" TEXT,
    "revokedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "userAgent" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "secretHash" TEXT NOT NULL,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plivo_accounts" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT 'Primary',
    "authIdEncrypted" TEXT NOT NULL,
    "authIdLast4" TEXT NOT NULL,
    "authTokenEncrypted" TEXT NOT NULL,
    "encIv" TEXT NOT NULL,
    "encAuthTag" TEXT NOT NULL,
    "encKeyVersion" INTEGER NOT NULL DEFAULT 1,
    "isSubaccount" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'unverified',
    "lastVerifiedAt" TIMESTAMP(3),
    "lastVerifyError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plivo_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "applications" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "plivoAccountId" TEXT NOT NULL,
    "plivoAppId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "answerUrl" TEXT NOT NULL,
    "answerMethod" TEXT NOT NULL DEFAULT 'POST',
    "fallbackAnswerUrl" TEXT,
    "hangupUrl" TEXT,
    "messageUrl" TEXT,
    "defaultNumberApp" BOOLEAN NOT NULL DEFAULT false,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "phone_numbers" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "plivoAccountId" TEXT NOT NULL,
    "applicationId" TEXT,
    "e164" TEXT NOT NULL,
    "countryIso" TEXT NOT NULL,
    "numberType" TEXT NOT NULL DEFAULT 'local',
    "region" TEXT,
    "city" TEXT,
    "friendlyName" TEXT,
    "answerUrlOverride" TEXT,
    "recordCalls" BOOLEAN NOT NULL DEFAULT true,
    "recordChannelType" TEXT NOT NULL DEFAULT 'stereo',
    "recordSession" BOOLEAN NOT NULL DEFAULT true,
    "machineDetection" BOOLEAN NOT NULL DEFAULT false,
    "transcribeEnabled" BOOLEAN NOT NULL DEFAULT true,
    "transcriptionLanguage" TEXT NOT NULL DEFAULT 'en-US',
    "voicemailEnabled" BOOLEAN NOT NULL DEFAULT false,
    "forwardTo" TEXT,
    "monthlyRental" DECIMAL(10,4),
    "smsRate" DECIMAL(10,4),
    "mmsRate" DECIMAL(10,4),
    "voiceRate" DECIMAL(10,4),
    "status" TEXT NOT NULL DEFAULT 'active',
    "source" TEXT NOT NULL DEFAULT 'purchased',
    "purchasedAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "phone_numbers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calls" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "phoneNumberId" TEXT,
    "plivoCallUuid" TEXT NOT NULL,
    "parentCallUuid" TEXT,
    "aledUuid" TEXT,
    "requestUuid" TEXT,
    "direction" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "from" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answeredAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "durationSeconds" INTEGER,
    "billDurationSeconds" INTEGER,
    "ringDurationSeconds" INTEGER,
    "totalCost" DECIMAL(12,6),
    "hangupCauseCode" INTEGER,
    "hangupCauseName" TEXT,
    "hangupSource" TEXT,
    "stirAttestation" TEXT,
    "recordingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "transcriptionEnabled" BOOLEAN NOT NULL DEFAULT false,
    "transcriptionLanguage" TEXT,
    "machineDetected" TEXT,
    "requestedMode" TEXT,
    "requestedParams" JSONB,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "call_events" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "status" TEXT,
    "payload" JSONB NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "webhookEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "call_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recordings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "callId" TEXT,
    "plivoRecordingId" TEXT NOT NULL,
    "recordingUrl" TEXT NOT NULL,
    "durationSeconds" INTEGER,
    "fileFormat" TEXT NOT NULL DEFAULT 'mp3',
    "channelType" TEXT,
    "sizeBytes" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "storageCost" DECIMAL(12,6),
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recordings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transcriptions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "recordingId" TEXT,
    "callId" TEXT,
    "plivoTranscriptionId" TEXT,
    "recordingSid" TEXT,
    "type" TEXT NOT NULL DEFAULT 'transcription',
    "status" TEXT NOT NULL DEFAULT 'queued',
    "language" TEXT,
    "text" TEXT,
    "segments" JSONB,
    "wordCount" INTEGER,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "source" TEXT NOT NULL DEFAULT 'callback',
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transcriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "phoneNumberId" TEXT,
    "threadId" TEXT,
    "plivoMessageUuid" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'sms',
    "from" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "body" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "errorCode" TEXT,
    "units" INTEGER,
    "totalRate" DECIMAL(12,6),
    "totalAmount" DECIMAL(12,6),
    "mcc" TEXT,
    "mnc" TEXT,
    "redacted" BOOLEAN NOT NULL DEFAULT false,
    "mediaUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_threads" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ownNumberE164" TEXT NOT NULL,
    "counterpartE164" TEXT NOT NULL,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'plivo',
    "kind" TEXT NOT NULL,
    "eventType" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "signatureValid" BOOLEAN NOT NULL,
    "headers" JSONB NOT NULL,
    "rawBody" TEXT NOT NULL,
    "contentType" TEXT,
    "sourceIp" TEXT,
    "status" TEXT NOT NULL DEFAULT 'received',
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "actorUserId" TEXT,
    "actorType" TEXT NOT NULL DEFAULT 'user',
    "actorLabel" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "metadata" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "result" TEXT NOT NULL DEFAULT 'success',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "memberships_organizationId_idx" ON "memberships"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_organizationId_userId_key" ON "memberships"("organizationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_tokenHash_key" ON "sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "sessions_userId_kind_idx" ON "sessions"("userId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_prefix_key" ON "api_keys"("prefix");

-- CreateIndex
CREATE INDEX "api_keys_organizationId_idx" ON "api_keys"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "plivo_accounts_organizationId_authIdLast4_label_key" ON "plivo_accounts"("organizationId", "authIdLast4", "label");

-- CreateIndex
CREATE UNIQUE INDEX "applications_plivoAppId_key" ON "applications"("plivoAppId");

-- CreateIndex
CREATE INDEX "applications_organizationId_idx" ON "applications"("organizationId");

-- CreateIndex
CREATE INDEX "phone_numbers_organizationId_status_idx" ON "phone_numbers"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "phone_numbers_organizationId_e164_key" ON "phone_numbers"("organizationId", "e164");

-- CreateIndex
CREATE UNIQUE INDEX "calls_plivoCallUuid_key" ON "calls"("plivoCallUuid");

-- CreateIndex
CREATE INDEX "calls_organizationId_startedAt_idx" ON "calls"("organizationId", "startedAt");

-- CreateIndex
CREATE INDEX "calls_organizationId_status_idx" ON "calls"("organizationId", "status");

-- CreateIndex
CREATE INDEX "calls_organizationId_direction_idx" ON "calls"("organizationId", "direction");

-- CreateIndex
CREATE INDEX "call_events_callId_occurredAt_idx" ON "call_events"("callId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "recordings_plivoRecordingId_key" ON "recordings"("plivoRecordingId");

-- CreateIndex
CREATE INDEX "recordings_organizationId_createdAt_idx" ON "recordings"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "transcriptions_plivoTranscriptionId_key" ON "transcriptions"("plivoTranscriptionId");

-- CreateIndex
CREATE INDEX "transcriptions_organizationId_createdAt_idx" ON "transcriptions"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "messages_plivoMessageUuid_key" ON "messages"("plivoMessageUuid");

-- CreateIndex
CREATE INDEX "messages_organizationId_createdAt_idx" ON "messages"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "messages_organizationId_status_idx" ON "messages"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "message_threads_organizationId_ownNumberE164_counterpartE16_key" ON "message_threads"("organizationId", "ownNumberE164", "counterpartE164");

-- CreateIndex
CREATE INDEX "webhook_events_status_idx" ON "webhook_events"("status");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_provider_dedupeKey_kind_key" ON "webhook_events"("provider", "dedupeKey", "kind");

-- CreateIndex
CREATE INDEX "audit_logs_organizationId_createdAt_idx" ON "audit_logs"("organizationId", "createdAt");

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plivo_accounts" ADD CONSTRAINT "plivo_accounts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_plivoAccountId_fkey" FOREIGN KEY ("plivoAccountId") REFERENCES "plivo_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "phone_numbers" ADD CONSTRAINT "phone_numbers_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "phone_numbers" ADD CONSTRAINT "phone_numbers_plivoAccountId_fkey" FOREIGN KEY ("plivoAccountId") REFERENCES "plivo_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "phone_numbers" ADD CONSTRAINT "phone_numbers_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calls" ADD CONSTRAINT "calls_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calls" ADD CONSTRAINT "calls_phoneNumberId_fkey" FOREIGN KEY ("phoneNumberId") REFERENCES "phone_numbers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_events" ADD CONSTRAINT "call_events_callId_fkey" FOREIGN KEY ("callId") REFERENCES "calls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_events" ADD CONSTRAINT "call_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recordings" ADD CONSTRAINT "recordings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recordings" ADD CONSTRAINT "recordings_callId_fkey" FOREIGN KEY ("callId") REFERENCES "calls"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transcriptions" ADD CONSTRAINT "transcriptions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transcriptions" ADD CONSTRAINT "transcriptions_recordingId_fkey" FOREIGN KEY ("recordingId") REFERENCES "recordings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transcriptions" ADD CONSTRAINT "transcriptions_callId_fkey" FOREIGN KEY ("callId") REFERENCES "calls"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_phoneNumberId_fkey" FOREIGN KEY ("phoneNumberId") REFERENCES "phone_numbers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "message_threads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_threads" ADD CONSTRAINT "message_threads_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
