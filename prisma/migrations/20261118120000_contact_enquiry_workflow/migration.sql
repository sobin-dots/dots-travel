ALTER TABLE "contacts"
  ADD COLUMN "assignedToId" TEXT,
  ADD COLUMN "assignedAt" TIMESTAMP(3),
  ADD COLUMN "enquiryStatus" TEXT NOT NULL DEFAULT 'new_inquiry',
  ADD COLUMN "enquiryTag" TEXT NOT NULL DEFAULT 'warm',
  ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "calls" ADD COLUMN "enquiryContactId" TEXT;

-- Preserve the responsible person and grouping used by the previous enquiry inbox.
WITH latest AS (
  SELECT DISTINCT ON (l."organizationId", l."contactId")
    l."organizationId", l."contactId", l."assignedToId", l."assignedAt", l."createdAt", l.stage, l.temperature, l.tags
  FROM leads l JOIN contacts c ON c.id = l."contactId" AND c."organizationId" = l."organizationId"
  WHERE l."assignedToId" IS NOT NULL
  ORDER BY l."organizationId", l."contactId", l."assignedAt" DESC NULLS LAST, l."createdAt" DESC, l.id ASC
)
UPDATE contacts c SET
  "assignedToId" = latest."assignedToId",
  "assignedAt" = COALESCE(latest."assignedAt", latest."createdAt"),
  "enquiryStatus" = CASE WHEN latest.stage IN ('new_inquiry','contacted','quote_prep','quote_sent','negotiation','confirmed','lost') THEN latest.stage ELSE 'new_inquiry' END,
  "enquiryTag" = CASE WHEN latest.temperature IN ('hot','warm','cold') THEN latest.temperature ELSE 'warm' END,
  tags = latest.tags
FROM latest WHERE c.id = latest."contactId" AND c."organizationId" = latest."organizationId";

WITH links AS (
  SELECT DISTINCT ON (l."callId") l."callId", l."contactId", l."organizationId"
  FROM leads l JOIN contacts c ON c.id = l."contactId" AND c."organizationId" = l."organizationId"
  WHERE l."callId" IS NOT NULL
  ORDER BY l."callId", l."createdAt" DESC, l.id ASC
)
UPDATE calls c SET "enquiryContactId" = links."contactId"
FROM links WHERE c.id = links."callId" AND c."organizationId" = links."organizationId";

ALTER TABLE "contacts" ADD CONSTRAINT "contacts_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "calls" ADD CONSTRAINT "calls_enquiryContactId_fkey" FOREIGN KEY ("enquiryContactId") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_enquiryStatus_check" CHECK ("enquiryStatus" IN ('new_inquiry','contacted','quote_prep','quote_sent','negotiation','confirmed','lost'));
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_enquiryTag_check" CHECK ("enquiryTag" IN ('hot','warm','cold'));
CREATE INDEX "contacts_organizationId_assignedToId_idx" ON "contacts"("organizationId", "assignedToId");
CREATE INDEX "calls_organizationId_enquiryContactId_idx" ON "calls"("organizationId", "enquiryContactId");
