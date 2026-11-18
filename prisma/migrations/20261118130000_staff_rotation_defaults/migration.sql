-- Existing front-line staff inherited receivesLeads=false from the original
-- release. Enrol untouched, available memberships once. An unavailable member
-- or one with a recorded rotation-settings change keeps their saved choice.
-- Keep the column's general default false: Owner/Admin/Viewer memberships must
-- not be enrolled implicitly. Staff creation sets role-specific defaults.
UPDATE "memberships" AS m
SET "receivesLeads" = true
WHERE m."role" IN ('sales', 'operator')
  AND m."receivesLeads" = false
  AND m."availableForLeads" = true
  AND NOT EXISTS (
    SELECT 1 FROM "audit_logs" AS a
    WHERE a."organizationId" = m."organizationId"
      AND a."action" = 'lead_intake.member'
      AND a."result" = 'success'
      AND a."metadata"->>'membershipId' = m."id"
  );
