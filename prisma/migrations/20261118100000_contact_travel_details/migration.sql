BEGIN;

ALTER TABLE "contacts"
  ADD COLUMN "preferredTravelMonth" TEXT,
  ADD COLUMN "tourType" TEXT,
  ADD COLUMN "numberOfChildren" INTEGER,
  ADD COLUMN "specialRequirements" TEXT,
  ADD COLUMN "city" TEXT;

ALTER TABLE "contacts" ADD CONSTRAINT "contacts_numberOfChildren_check"
  CHECK ("numberOfChildren" IS NULL OR "numberOfChildren" BETWEEN 0 AND 1000);

COMMIT;
