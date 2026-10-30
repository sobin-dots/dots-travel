-- DropForeignKey
ALTER TABLE "phone_numbers" DROP CONSTRAINT "phone_numbers_plivoAccountId_fkey";

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "bookingConfirmedAt" TIMESTAMP(3),
ADD COLUMN     "bookingReference" TEXT,
ADD COLUMN     "departureDate" TIMESTAMP(3),
ADD COLUMN     "durationDays" INTEGER,
ADD COLUMN     "headcountAdults" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "headcountChildren" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "headcountInfants" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "hotelTier" TEXT,
ADD COLUMN     "returnDate" TIMESTAMP(3),
ADD COLUMN     "specialRequests" TEXT,
ADD COLUMN     "stage" TEXT NOT NULL DEFAULT 'new_inquiry',
ADD COLUMN     "targetBudget" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "address" TEXT,
ADD COLUMN     "brandColor" TEXT DEFAULT '#ed1b24',
ADD COLUMN     "letterheadText" TEXT,
ADD COLUMN     "letterheadUrl" TEXT,
ADD COLUMN     "logoUrl" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "primaryTelephonyProvider" TEXT NOT NULL DEFAULT 'plivo',
ADD COLUMN     "website" TEXT;

-- AlterTable
ALTER TABLE "phone_numbers" ADD COLUMN     "provider" TEXT NOT NULL DEFAULT 'plivo',
ALTER COLUMN "plivoAccountId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "supplier_quotations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "quoteReference" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "totalNetCost" DECIMAL(12,2) NOT NULL,
    "cancellationPolicy" TEXT,
    "inclusions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "exclusions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "hotelTier" TEXT,
    "roomCategory" TEXT,
    "validUntil" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'received',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_quotations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_quotation_line_items" (
    "id" TEXT NOT NULL,
    "supplierQuotationId" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'accommodation',
    "description" TEXT NOT NULL,
    "dayNumber" INTEGER,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitCost" DECIMAL(12,2) NOT NULL,
    "totalCost" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_quotation_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_quotations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "supplierNetTotal" DECIMAL(12,2) NOT NULL,
    "marginType" TEXT NOT NULL DEFAULT 'percentage',
    "marginValue" DECIMAL(10,2) NOT NULL,
    "marginAmount" DECIMAL(12,2) NOT NULL,
    "taxPercentage" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "finalSellingPrice" DECIMAL(12,2) NOT NULL,
    "floorGuardrailMin" DECIMAL(5,2) NOT NULL DEFAULT 10.0,
    "marginApproved" BOOLEAN NOT NULL DEFAULT true,
    "approvalNote" TEXT,
    "snapshotJson" JSONB,
    "pdfUrl" TEXT,
    "validUntil" TIMESTAMP(3),
    "sentViaWhatsApp" BOOLEAN NOT NULL DEFAULT false,
    "sentViaEmail" BOOLEAN NOT NULL DEFAULT false,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_quotations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_flights" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "airline" TEXT NOT NULL,
    "airlineCode" TEXT NOT NULL,
    "flightNumber" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "departureTime" TIMESTAMP(3) NOT NULL,
    "arrivalTime" TIMESTAMP(3) NOT NULL,
    "cabinClass" TEXT NOT NULL DEFAULT 'economy',
    "baggageAllowance" TEXT NOT NULL DEFAULT '1x 23kg check-in + 7kg cabin',
    "pnr" TEXT,
    "fareRules" TEXT,
    "ticketCost" DECIMAL(12,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trip_flights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_milestones" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "paidAt" TIMESTAMP(3),
    "paymentLink" TEXT,
    "reminderSentCount" INTEGER NOT NULL DEFAULT 0,
    "lastReminderSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_milestones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visa_requirements" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "countryIso" TEXT NOT NULL,
    "documentName" TEXT NOT NULL,
    "description" TEXT,
    "mandatory" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "fileUrl" TEXT,
    "reviewNotes" TEXT,
    "submittedAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "visa_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_logs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'email',
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "executedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "recipient" TEXT NOT NULL,
    "payload" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automation_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_integrations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT 'Default',
    "credentialsEncrypted" TEXT NOT NULL,
    "encIv" TEXT NOT NULL,
    "encAuthTag" TEXT NOT NULL,
    "encKeyVersion" INTEGER NOT NULL DEFAULT 1,
    "maskedDetails" JSONB,
    "status" TEXT NOT NULL DEFAULT 'unverified',
    "isDefault" BOOLEAN NOT NULL DEFAULT true,
    "lastVerifiedAt" TIMESTAMP(3),
    "lastVerifyError" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "itinerary_rules" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'general',
    "rulePrompt" TEXT NOT NULL,
    "condition" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "itinerary_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "supplier_quotations_organizationId_leadId_idx" ON "supplier_quotations"("organizationId", "leadId");

-- CreateIndex
CREATE INDEX "supplier_quotation_line_items_supplierQuotationId_idx" ON "supplier_quotation_line_items"("supplierQuotationId");

-- CreateIndex
CREATE INDEX "customer_quotations_organizationId_leadId_version_idx" ON "customer_quotations"("organizationId", "leadId", "version");

-- CreateIndex
CREATE INDEX "trip_flights_organizationId_leadId_idx" ON "trip_flights"("organizationId", "leadId");

-- CreateIndex
CREATE INDEX "payment_milestones_organizationId_leadId_idx" ON "payment_milestones"("organizationId", "leadId");

-- CreateIndex
CREATE INDEX "visa_requirements_organizationId_leadId_idx" ON "visa_requirements"("organizationId", "leadId");

-- CreateIndex
CREATE INDEX "automation_logs_organizationId_leadId_type_idx" ON "automation_logs"("organizationId", "leadId", "type");

-- CreateIndex
CREATE INDEX "automation_logs_scheduledFor_status_idx" ON "automation_logs"("scheduledFor", "status");

-- CreateIndex
CREATE INDEX "tenant_integrations_organizationId_category_idx" ON "tenant_integrations"("organizationId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_integrations_organizationId_provider_key" ON "tenant_integrations"("organizationId", "provider");

-- CreateIndex
CREATE INDEX "itinerary_rules_organizationId_isActive_idx" ON "itinerary_rules"("organizationId", "isActive");

-- CreateIndex
CREATE INDEX "itinerary_rules_organizationId_category_idx" ON "itinerary_rules"("organizationId", "category");

-- CreateIndex
CREATE INDEX "leads_organizationId_stage_idx" ON "leads"("organizationId", "stage");

-- AddForeignKey
ALTER TABLE "phone_numbers" ADD CONSTRAINT "phone_numbers_plivoAccountId_fkey" FOREIGN KEY ("plivoAccountId") REFERENCES "plivo_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_quotations" ADD CONSTRAINT "supplier_quotations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_quotations" ADD CONSTRAINT "supplier_quotations_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_quotations" ADD CONSTRAINT "supplier_quotations_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_quotation_line_items" ADD CONSTRAINT "supplier_quotation_line_items_supplierQuotationId_fkey" FOREIGN KEY ("supplierQuotationId") REFERENCES "supplier_quotations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_quotations" ADD CONSTRAINT "customer_quotations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_quotations" ADD CONSTRAINT "customer_quotations_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_flights" ADD CONSTRAINT "trip_flights_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_flights" ADD CONSTRAINT "trip_flights_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_milestones" ADD CONSTRAINT "payment_milestones_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_milestones" ADD CONSTRAINT "payment_milestones_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visa_requirements" ADD CONSTRAINT "visa_requirements_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visa_requirements" ADD CONSTRAINT "visa_requirements_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_logs" ADD CONSTRAINT "automation_logs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_logs" ADD CONSTRAINT "automation_logs_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_integrations" ADD CONSTRAINT "tenant_integrations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itinerary_rules" ADD CONSTRAINT "itinerary_rules_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
