-- CreateIndex
CREATE INDEX "calls_organizationId_assignedToId_endedAt_status_idx" ON "calls"("organizationId", "assignedToId", "endedAt", "status");

-- CreateIndex
CREATE INDEX "calls_organizationId_endedAt_status_startedAt_idx" ON "calls"("organizationId", "endedAt", "status", "startedAt");

-- CreateIndex
CREATE INDEX "memberships_organizationId_availableForLeads_voiceBusy_last_idx" ON "memberships"("organizationId", "availableForLeads", "voiceBusy", "lastCallAssignedAt");

-- CreateIndex
CREATE INDEX "phone_numbers_e164_idx" ON "phone_numbers"("e164");
