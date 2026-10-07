# Architecture SOP: Data Model & Persistence

## 1. Goal
Document database design invariants, indexing strategies, cascade behaviors, data retention policies, and forensic tracking guarantees across all multi-tenant domain models.

---

## 2. Invariants & Data Integrity Rules

1. **Root Tenancy:**
   `Organization` is the parent entity for all operational data. Deleting an organization cascades deletions across all child entities (`onDelete: Cascade`), with the exception of audit logs which retain immutable historical traces.
2. **String Enums at Application Boundary:**
   Status, role, direction, and type fields are modeled as `String` in PostgreSQL and strictly validated using Zod enums in TypeScript. This prevents carrier enum additions (such as Plivo introducing new call states or error reasons) from triggering schema migrations or application downtime.
3. **Forensic Retention (`rawPayload`):**
   `Call`, `CallEvent`, `Message`, `Recording`, `Transcription`, and `WebhookEvent` persist the verbatim JSON payload received from Plivo in `rawPayload Json?`.
4. **Financial and Temporal Precision:**
   - Costs, rates, and rental fees use `Decimal` with high precision (`Decimal(10, 4)` for rentals/rates, `Decimal(12, 6)` for fractional transaction costs).
   - All durations are stored as integer seconds as reported by the carrier (`durationSeconds`, `billDurationSeconds`).
   - All timestamps are UTC `DateTime` values.
5. **Idempotency Backbone:**
   - Unique constraints on carrier identifiers: `plivoCallUuid`, `plivoMessageUuid`, `plivoRecordingId`, `plivoTranscriptionId`.
   - Unique composite constraint on webhooks: `WebhookEvent.@@unique([provider, dedupeKey, kind])`.

---

## 3. Entity Relationships

```
Organization
├── Membership ── User
├── Session (Console / Refresh families)
├── ApiKey
├── PlivoAccount (AES-256-GCM encrypted)
│   ├── Application (Webhooks / URLs)
│   └── PhoneNumber
│       ├── Call
│       │   ├── CallEvent (append-only timeline)
│       │   ├── Recording
│       │   └── Transcription
│       └── Message
│           └── MessageThread (grouped by counterpart E.164)
├── WebhookEvent (forensic deduplication)
└── AuditLog (immutable security log)
```

---

## 4. Indexing Strategy

- **Tenant Scoping:** Every organization-scoped table has an index on `organizationId`.
- **Temporal Queries:** Composite indexes on `[organizationId, createdAt]` or `[organizationId, startedAt]` for performant paging and filtering.
- **State Filtering:** `[organizationId, status]` for filtering active vs. completed calls/messages.
- **Counterpart Lookup:** `[organizationId, ownNumberE164, counterpartE164]` unique index on `MessageThread`.

---

## 5. Soft vs. Hard Deletions

- **Soft Delete:**
  - `PhoneNumber`: Marked `status = 'released'`, `releasedAt = now()`. Retained to maintain call history continuity.
  - `Recording`: Marked `status = 'deleted'`, `deletedAt = now()`. File is purged from carrier/storage, but metadata row remains.
- **Hard Delete:**
  - Organizations (cascades to all children upon account closure).
  - API keys and user memberships upon administrative revocation.

---

## 6. Testing Strategy
- Schema validation test: Run `prisma validate` to ensure syntax, relations, and indexes are sound.
- Migration deploy test against clean PostgreSQL instance.
- Cascading delete integration test verifying that deleting an organization cleanly removes its calls, messages, and accounts.
