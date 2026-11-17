BEGIN;

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "firstContactMinutes" INTEGER NOT NULL DEFAULT 30;

-- AlterTable
ALTER TABLE "memberships" ADD COLUMN     "availableForLeads" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "lastLeadAssignedAt" TIMESTAMP(3),
ADD COLUMN     "receivesLeads" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "contacts" ALTER COLUMN "phone" DROP NOT NULL;

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "adGroupId" TEXT,
ADD COLUMN     "adId" TEXT,
ADD COLUMN     "adName" TEXT,
ADD COLUMN     "assignedAt" TIMESTAMP(3),
ADD COLUMN     "assignedToId" TEXT,
ADD COLUMN     "campaignId" TEXT,
ADD COLUMN     "campaignName" TEXT,
ADD COLUMN     "clickId" TEXT,
ADD COLUMN     "duplicateContactFlag" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "firstContactAt" TIMESTAMP(3),
ADD COLUMN     "firstContactDueAt" TIMESTAMP(3),
ADD COLUMN     "formId" TEXT,
ADD COLUMN     "formName" TEXT,
ADD COLUMN     "nextFollowUpAt" TIMESTAMP(3),
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'unknown',
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "temperature" TEXT NOT NULL DEFAULT 'warm',
ADD COLUMN     "utmCampaign" TEXT,
ADD COLUMN     "utmMedium" TEXT,
ADD COLUMN     "utmSource" TEXT;

-- CreateTable
CREATE TABLE "lead_connections" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "credentials" JSONB NOT NULL,
    "formNames" JSONB NOT NULL DEFAULT '{}',
    "lastReceivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lead_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_submissions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" TIMESTAMP(3),
    "claimToken" TEXT,
    "alertedAt" TIMESTAMP(3),
    "leadId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lead_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lead_connections_organizationId_idx" ON "lead_connections"("organizationId");

-- CreateIndex
CREATE INDEX "lead_submissions_status_nextAttemptAt_idx" ON "lead_submissions"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "lead_submissions_organizationId_status_idx" ON "lead_submissions"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "lead_submissions_connectionId_externalId_key" ON "lead_submissions"("connectionId", "externalId");

-- CreateIndex
CREATE INDEX "contacts_organizationId_email_idx" ON "contacts"("organizationId", "email");

-- CreateIndex
CREATE INDEX "leads_organizationId_assignedToId_createdAt_idx" ON "leads"("organizationId", "assignedToId", "createdAt");

-- CreateIndex
CREATE INDEX "leads_organizationId_source_formId_idx" ON "leads"("organizationId", "source", "formId");

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_connections" ADD CONSTRAINT "lead_connections_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_submissions" ADD CONSTRAINT "lead_submissions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_submissions" ADD CONSTRAINT "lead_submissions_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "lead_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_submissions" ADD CONSTRAINT "lead_submissions_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
