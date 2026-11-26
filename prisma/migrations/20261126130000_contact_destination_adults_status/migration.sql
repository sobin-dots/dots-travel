BEGIN;

-- Add destination and numberOfAdults columns
ALTER TABLE "contacts"
  ADD COLUMN "destination" TEXT,
  ADD COLUMN "numberOfAdults" INTEGER;

-- Add check constraint for numberOfAdults
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_numberOfAdults_check"
  CHECK ("numberOfAdults" IS NULL OR "numberOfAdults" BETWEEN 0 AND 1000);

-- Update default for enquiryStatus
ALTER TABLE "contacts" ALTER COLUMN "enquiryStatus" SET DEFAULT 'warm';

-- Allow enquiryTag to be nullable
ALTER TABLE "contacts" ALTER COLUMN "enquiryTag" DROP NOT NULL;

-- Update enquiryStatus check constraint to include the new and legacy statuses
ALTER TABLE "contacts" DROP CONSTRAINT IF EXISTS "contacts_enquiryStatus_check";
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_enquiryStatus_check"
  CHECK ("enquiryStatus" IN ('warm', 'cold', 'call_unanswered', 'whatsapp_sent', 'new_inquiry', 'contacted', 'quote_prep', 'quote_sent', 'negotiation', 'confirmed', 'lost'));

COMMIT;
