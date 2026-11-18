BEGIN;

-- AlterTable
ALTER TABLE "memberships" ADD COLUMN     "lastCallAssignedAt" TIMESTAMP(3),
ADD COLUMN     "voiceBusy" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "voiceEndpoint" JSONB,
ADD COLUMN     "voicePresenceAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "calls" ADD COLUMN     "agentAnsweredAt" TIMESTAMP(3),
ADD COLUMN     "agentOutcome" TEXT,
ADD COLUMN     "assignedToId" TEXT;

-- CreateTable
CREATE TABLE "itinerary_options" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "budget" DECIMAL(12,2),
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "itinerary" TEXT NOT NULL,
    "durationDays" INTEGER NOT NULL,
    "departureDate" TIMESTAMP(3),
    "destination" TEXT NOT NULL,
    "revisionNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "itinerary_options_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "itinerary_options_organizationId_leadId_idx" ON "itinerary_options"("organizationId", "leadId");

-- AddForeignKey
ALTER TABLE "itinerary_options" ADD CONSTRAINT "itinerary_options_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itinerary_options" ADD CONSTRAINT "itinerary_options_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
