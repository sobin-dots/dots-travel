# CLAUDE.md — Architecture Invariants, Contracts & Maintenance Log

> **Layer 0: System Constitution**
> This file is the single source of architectural truth for the Plivo Communications Platform.
> All code, tests, and operational tools must strictly adhere to the invariants, contracts, and schema defined here.

---

## 1. Architecture Invariants (Non-Negotiable)

1. **API-First, Versioned, Mobile-Ready:**
   - Every capability exists as a stable HTTP endpoint under `/api/v1`.
   - The web console is the first consumer of that same API, never a privileged one.
   - No session-only endpoints, no `formAction` that executes unexposed business logic, no direct database mutations bypassing the API layer.
   - No endpoint under `/api/v1/**` may require a cookie. All API endpoints accept Bearer tokens.
2. **Strict Provider Boundary:**
   - Nothing outside `src/lib/telephony/**` may import the Plivo SDK or know Plivo-specific payload shapes.
   - All telephony operations flow through the `TelephonyProvider` interface with two implementations:
     - `PlivoProvider` (real Plivo SDK)
     - `SimulatorProvider` (offline, generates authentic `X-Plivo-Signature-V3` HMAC-SHA256 signatures over real HTTP).
   - Selection is controlled strictly via `TELEPHONY_MODE=live|simulator`.
3. **Multi-Tenant from Day One:**
   - Every business row belongs to an `Organization`.
   - Cross-tenant access is treated as a critical security vulnerability and tested as such.
   - Every database query must be organization-scoped.
4. **Credentials Encrypted at Rest:**
   - `PlivoAccount.authIdEncrypted` and `authTokenEncrypted` are stored AES-256-GCM encrypted using an environment Key-Encryption-Key (`ENCRYPTION_KEK`).
   - Plaintext credentials never touch the database, never reach the browser, and never appear in logs or error traces.
   - Only `authIdLast4` may be displayed in the UI.
5. **Webhooks are Untrusted Input:**
   - Signature validation via SDK (`plivo.validateV3Signature`) is mandatory before parsing or processing.
   - Unsigned or invalid requests return `403 Forbidden` immediately and are logged to `WebhookEvent` for forensics.
   - Handlers must be idempotent via `(provider, dedupeKey, kind)` unique constraint in PostgreSQL.
   - Handlers return `200 OK` rapidly; slow processing is enqueued/asynchronous. Handlers must never 500 on duplicate payloads.
6. **Deterministic Business Logic:**
   - Zero LLM runtime dependencies in telephony/messaging request paths.
   - Business rules live in typed, unit-tested code.
7. **Evidence Over Assertion:**
   - A phase is only complete when real command execution outputs are captured and recorded in `progress.md`.

---

## 2. The Plivo Contract & Platform Specifications

### 2.1 Platform Core
- **Base URL:** `https://api.plivo.com/v1/Account/{auth_id}/` (API version `v1`).
- **Authentication:** HTTP Basic Auth (`auth_id` as username, `auth_token` as password). No API keys, no OAuth.
- **Request Body:** JSON only (`Content-Type: application/json`). Query params for GET/DELETE.
- **Response Envelope:** Every response includes `api_id`. Errors are flat: `{"api_id":"...","error":"..."}` (no nested error object).
- **Paging:** `limit` (1–20, default 20) + `offset`. Loops must use offset paging with exponential backoff.
- **Rate Limit:** 300 requests / 5 seconds (HTTP 429). Token-bucket rate limiter enforced at client level.

### 2.2 Voice Specifications
- **Outbound Calls:** `POST /Call/` (`from`, `to`, `answer_url` required). Time limit default 14,400s. Optional: `ring_url`, `hangup_url`, `fallback_url`, `machine_detection` (2,000–10,000ms), `sip_headers`.
- **Live Call Control:** Under `/Call/{call_uuid}/`: Hangup (`DELETE`), DTMF (`POST .../DTMF/`), Play (`POST .../Play/`), Speak (`POST .../Speak/`), Record (`POST .../Record/`), Stop Record (`DELETE .../Record/`).
- **Recordings:** `POST /Call/{call_uuid}/Record/`. Default transcription type is `auto` (must explicitly suppress if off).
- **Call Control Language (Plivo XML):** Valid XML served as `text/xml` or `application/xml`. Invalid XML causes hangup cause `8011` (`Invalid Answer XML`). Elements: `Speak`, `Play`, `DTMF`, `GetDigits`, `GetInput`, `Dial`, `Redirect`, `Hangup`, `Wait`, `Conference`, `MultiPartyCall`, `Record`, `PreAnswer`, `Stream`. Generated through audited builder module, never string concatenation.
- **Billing Semantics:** Billing starts when answered (not ringing). US Voice billing: 60/60 rounded up. India: 30/30. Inbound and outbound legs bill separately. Display `bill_duration` as Plivo reports it.
- **Hangup Codes:** 4000s (normal), 0/1xxx (cancelled/credit), 2xxx (destination/auth), 3xxx (callee state), 5030 (concurrency breach).

### 2.3 Messaging Specifications
- **Send Message:** `POST /Message/` with `src` or `powerpack_uuid`, `dst`, `text`, `type` (`sms` | `mms` | `whatsapp`), `url` (status callback).
- **Status Lifecycle:** `queued` -> `sent` -> `delivered` | `undelivered` | `failed`.
- **MMS Payload:** Up to 10 files per request, 2 MB per file, max 5 MB total payload cap via `POST /Media/`.
- **Character Encoding & Cost:**
  - GSM-7: 160 chars/unit (153 per concatenated unit, max 1,600).
  - UCS-2: 70 chars/unit (67 per concatenated unit, max 737).
  - Pre-send cost widget must compute and display units and encoding prior to dispatch.
- **Redaction:** `log: false` irreversibly redacts content and destination. Must display strict warning.

### 2.4 Transcription Policy Engine
- Plivo does not have an account-level transcription toggle.
- Resolution cascade:
  1. `Organization.transcriptionDefaultEnabled`
  2. `PhoneNumber.transcribeEnabled` + `PhoneNumber.transcriptionLanguage`
  3. Per-call explicit override.
- Explicit suppression enforced at record time (`transcription_type` not set to `auto` when disabled).
- Management endpoints: `GET/POST /Transcription/`, `GET /Transcription/{recording_id}/`, `DELETE /Transcription/{transcription_id}/`.

### 2.5 Webhooks & Signature Validation
- Algorithm: HMAC-SHA256 over:
  `public_url + sorted_alphabetical_POST_params(Name+Value) + nonce`
- Base64 encoded, verified in constant time.
- Headers: `X-Plivo-Signature-V3`, `X-Plivo-Signature-Ma-V3`, `X-Plivo-Signature-V3-Nonce`. Accept comma-separated token list.
- Use SDK validator: `plivo.validateV3Signature(...)`. Hand-rolling is prohibited.
- Signature validation failure returns HTTP 403 Forbidden.

### 2.6 Capacity & Concurrency
- Outbound CPS & Concurrency pools are shared between Voice API and SIP Trunking.
- US: Free tier (1 CPS / 2 conc), Pro <$100 (1/5), $100-$500 (2/10), >$500 (2/25), Enterprise (2/50).
- Inbound CPS: 10 calls/sec across all accounts.
- Exceeding concurrency triggers HTTP 403 at call creation time (no CallUUID created, no webhook fired).

---

## 3. Database Schema (Prisma)

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ─── tenancy & identity ────────────────────────────────────────────────────────

model Organization {
  id        String   @id @default(uuid())
  name      String
  slug      String   @unique
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  // policy
  transcriptionDefaultEnabled Boolean  @default(true)
  transcriptionLanguage       String   @default("en-US")
  recordingRetentionDays      Int?
  notificationEmail           String?
  redactMessageContent        Boolean  @default(false)   // maps to Plivo `log: false`

  members         Membership[]
  plivoAccounts   PlivoAccount[]
  applications    Application[]
  numbers         PhoneNumber[]
  calls           Call[]
  callEvents      CallEvent[]
  messages        Message[]
  messageThreads  MessageThread[]
  recordings      Recording[]
  transcriptions  Transcription[]
  apiKeys         ApiKey[]
  webhookEvents   WebhookEvent[]
  auditLogs       AuditLog[]

  @@map("organizations")
}

model User {
  id               String    @id @default(uuid())
  email            String    @unique
  name             String
  passwordHash     String
  mfaSecretEnc     String?                        // TOTP secret, encrypted
  mfaEnabled       Boolean   @default(false)
  mfaRecoveryCodes String[]  @default([])         // hashed recovery codes
  status           String    @default("active")   // active | disabled
  lastLoginAt      DateTime?
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt

  memberships Membership[]
  sessions    Session[]
  apiKeys     ApiKey[]
  auditLogs   AuditLog[]

  @@map("users")
}

model Membership {
  id             String   @id @default(uuid())
  organizationId String
  userId         String
  role           String   @default("operator") // owner | admin | operator | viewer
  createdAt      DateTime @default(now())

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  user         User         @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([organizationId, userId])
  @@index([organizationId])
  @@map("memberships")
}

model Session {                                  // console sessions (Auth.js) + refresh families
  id              String   @id @default(uuid())
  userId          String
  organizationId  String?
  kind            String   @default("console")   // console | api_refresh
  tokenHash       String   @unique
  familyId        String?
  rotatedFromId   String?
  revokedAt       DateTime?
  expiresAt       DateTime
  userAgent       String?
  ip              String?
  createdAt       DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, kind])
  @@map("sessions")
}

model ApiKey {                                    // server-to-server / mobile long-lived keys
  id              String    @id @default(uuid())
  organizationId  String
  createdByUserId String?
  name            String
  prefix          String    @unique              // shown in UI, e.g. "cms_ab12…"
  secretHash      String                         // sha256 of the secret half
  scopes          String[]  @default([])         // e.g. ["calls:write","messages:read"]
  lastUsedAt      DateTime?
  expiresAt       DateTime?
  revokedAt       DateTime?
  createdAt       DateTime  @default(now())

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  createdBy    User?        @relation(fields: [createdByUserId], references: [id], onDelete: SetNull)

  @@index([organizationId])
  @@map("api_keys")
}

// ─── provider configuration ────────────────────────────────────────────────────

model PlivoAccount {
  id                 String   @id @default(uuid())
  organizationId     String
  label              String   @default("Primary")
  authIdEncrypted    String                     // AES-256-GCM ciphertext (base64)
  authIdLast4        String                     // for masked display only
  authTokenEncrypted String
  encIv              String
  encAuthTag         String
  encKeyVersion      Int      @default(1)
  isSubaccount       Boolean  @default(false)
  status             String   @default("unverified") // unverified | verified | failed
  lastVerifiedAt     DateTime?
  lastVerifyError    String?
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  numbers      PhoneNumber[]
  applications Application[]

  @@unique([organizationId, authIdLast4, label])
  @@map("plivo_accounts")
}

model Application {                               // Plivo application = answer_url + urls
  id                String   @id @default(uuid())
  organizationId    String
  plivoAccountId    String
  plivoAppId        String   @unique
  name              String
  answerUrl         String
  answerMethod      String   @default("POST")
  fallbackAnswerUrl String?
  hangupUrl         String?
  messageUrl        String?
  defaultNumberApp  Boolean  @default(false)
  rawPayload        Json?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  organization Organization  @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  plivoAccount PlivoAccount  @relation(fields: [plivoAccountId], references: [id], onDelete: Cascade)
  numbers      PhoneNumber[]

  @@index([organizationId])
  @@map("applications")
}

model PhoneNumber {
  id                    String   @id @default(uuid())
  organizationId        String
  plivoAccountId        String
  applicationId         String?
  e164                  String
  countryIso            String
  numberType            String   @default("local")   // local | tollfree | mobile | shortcode
  region                String?
  city                  String?
  friendlyName          String?
  // behaviour
  answerUrlOverride     String?
  recordCalls           Boolean  @default(true)
  recordChannelType     String   @default("stereo")  // mono | stereo
  recordSession         Boolean  @default(true)
  machineDetection      Boolean  @default(false)
  transcribeEnabled     Boolean  @default(true)
  transcriptionLanguage String   @default("en-US")
  voicemailEnabled      Boolean  @default(false)
  forwardTo             String?
  // costs reported by Plivo
  monthlyRental         Decimal? @db.Decimal(10, 4)
  smsRate               Decimal? @db.Decimal(10, 4)
  mmsRate               Decimal? @db.Decimal(10, 4)
  voiceRate             Decimal? @db.Decimal(10, 4)
  // lifecycle
  status                String   @default("active")  // active | released
  source                String   @default("purchased") // purchased | ported
  purchasedAt           DateTime?
  releasedAt            DateTime?
  rawPayload            Json?
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt

  organization Organization  @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  plivoAccount PlivoAccount  @relation(fields: [plivoAccountId], references: [id], onDelete: Cascade)
  application  Application?  @relation(fields: [applicationId], references: [id], onDelete: SetNull)
  calls        Call[]
  messages     Message[]

  @@unique([organizationId, e164])
  @@index([organizationId, status])
  @@map("phone_numbers")
}

// ─── voice ─────────────────────────────────────────────────────────────────────

model Call {
  id                   String    @id @default(uuid())
  organizationId       String
  phoneNumberId        String?
  // provider truth
  plivoCallUuid        String    @unique
  parentCallUuid       String?
  aledUuid             String?
  requestUuid          String?
  direction            String                       // inbound | outbound
  status               String    @default("queued") // queued|ringing|in-progress|completed|busy|no-answer|failed|timeout|canceled
  from                 String
  to                   String
  // measured
  startedAt            DateTime  @default(now())
  answeredAt           DateTime?
  endedAt              DateTime?
  durationSeconds      Int?
  billDurationSeconds  Int?
  ringDurationSeconds  Int?
  totalCost            Decimal?  @db.Decimal(12, 6)
  hangupCauseCode      Int?
  hangupCauseName      String?
  hangupSource         String?
  stirAttestation      String?
  // policy actually applied
  recordingEnabled     Boolean   @default(false)
  transcriptionEnabled Boolean   @default(false)
  transcriptionLanguage String?
  machineDetected      String?                      // human | machine | unknown
  // what we asked for
  requestedMode        String?                      // twiml-inline | forward | url | voicemail
  requestedParams      Json?
  rawPayload           Json?
  createdAt            DateTime  @default(now())
  updatedAt            DateTime  @updatedAt

  organization Organization  @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  phoneNumber  PhoneNumber?  @relation(fields: [phoneNumberId], references: [id], onDelete: SetNull)
  events       CallEvent[]
  recordings   Recording[]
  transcriptions Transcription[]

  @@index([organizationId, startedAt])
  @@index([organizationId, status])
  @@index([organizationId, direction])
  @@map("calls")
}

model CallEvent {                                  // append-only projection of callbacks
  id              String   @id @default(uuid())
  organizationId  String
  callId          String
  eventType       String                          // ring | answer | hangup | recording | machine_detection | action | stream
  status          String?
  payload         Json
  occurredAt      DateTime
  webhookEventId  String?
  createdAt       DateTime @default(now())

  call         Call           @relation(fields: [callId], references: [id], onDelete: Cascade)
  organization Organization   @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@index([callId, occurredAt])
  @@map("call_events")
}

// ─── media & transcription ─────────────────────────────────────────────────────

model Recording {
  id                String   @id @default(uuid())
  organizationId    String
  callId            String?
  plivoRecordingId  String   @unique
  recordingUrl      String                        // Plivo-side URL; never sent to browser
  durationSeconds   Int?
  fileFormat        String   @default("mp3")
  channelType       String?                       // mono | stereo
  sizeBytes         Int?
  status            String   @default("completed") // in-progress | completed | failed | deleted
  storageCost       Decimal? @db.Decimal(12, 6)
  startedAt         DateTime?
  endedAt           DateTime?
  deletedAt         DateTime?
  rawPayload        Json?
  createdAt         DateTime @default(now())

  organization   Organization   @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  call           Call?          @relation(fields: [callId], references: [id], onDelete: SetNull)
  transcriptions Transcription[]

  @@index([organizationId, createdAt])
  @@map("recordings")
}

model Transcription {
  id                   String   @id @default(uuid())
  organizationId       String
  recordingId          String?
  callId               String?
  plivoTranscriptionId String?  @unique
  recordingSid         String?                       // Plivo keys transcriptions by recording id
  type                 String   @default("transcription") // transcription | raw | diarized
  status               String   @default("queued")   // queued | in-progress | completed | failed
  language             String?
  text                 String?  @db.Text
  segments             Json?                         // speaker-tagged segments when diarized
  wordCount            Int?
  errorCode            String?
  errorMessage         String?
  source               String   @default("callback")  // callback | on_demand
  rawPayload           Json?
  createdAt            DateTime @default(now())
  updatedAt            DateTime @updatedAt

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  recording    Recording?   @relation(fields: [recordingId], references: [id], onDelete: Cascade)
  call         Call?        @relation(fields: [callId], references: [id], onDelete: SetNull)

  @@index([organizationId, createdAt])
  @@map("transcriptions")
}

// ─── messaging ─────────────────────────────────────────────────────────────────

model Message {
  id                String   @id @default(uuid())
  organizationId    String
  phoneNumberId     String?
  threadId          String?
  plivoMessageUuid  String   @unique
  direction         String                        // inbound | outbound
  type              String   @default("sms")      // sms | mms | whatsapp
  from              String
  to                String
  body              String?  @db.Text
  status            String   @default("queued")   // queued|sent|delivered|undelivered|failed|received|read
  errorCode         String?
  units             Int?
  totalRate         Decimal? @db.Decimal(12, 6)
  totalAmount       Decimal? @db.Decimal(12, 6)
  mcc               String?
  mnc               String?
  redacted          Boolean  @default(false)
  mediaUrls         String[] @default([])
  sentAt            DateTime?
  deliveredAt       DateTime?
  rawPayload        Json?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  organization Organization   @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  phoneNumber  PhoneNumber?   @relation(fields: [phoneNumberId], references: [id], onDelete: SetNull)
  thread       MessageThread? @relation(fields: [threadId], references: [id], onDelete: SetNull)

  @@index([organizationId, createdAt])
  @@index([organizationId, status])
  @@map("messages")
}

model MessageThread {                              // derived grouping: our number + counterpart
  id               String   @id @default(uuid())
  organizationId   String
  ownNumberE164    String
  counterpartE164  String
  lastMessageAt    DateTime @default(now())
  unreadCount      Int      @default(0)
  createdAt        DateTime @default(now())

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  messages     Message[]

  @@unique([organizationId, ownNumberE164, counterpartE164])
  @@map("message_threads")
}

// ─── platform plumbing ─────────────────────────────────────────────────────────

model WebhookEvent {                               // raw, deduped, replayable
  id             String   @id @default(uuid())
  organizationId String?
  provider       String   @default("plivo")
  kind           String                            // voice | message | recording | transcription | stream
  eventType      String?
  dedupeKey      String                            // CallUUID | MessageUUID | RecordingID | StreamID+event
  signatureValid Boolean
  headers        Json
  rawBody        String   @db.Text
  contentType    String?
  sourceIp       String?
  status         String   @default("received")     // received | processed | ignored | failed | rejected
  error          String?
  attempts       Int      @default(0)
  receivedAt     DateTime @default(now())
  processedAt    DateTime?

  organization Organization? @relation(fields: [organizationId], references: [id], onDelete: SetNull)

  @@unique([provider, dedupeKey, kind])
  @@index([status])
  @@map("webhook_events")
}

model AuditLog {
  id             String   @id @default(uuid())
  organizationId String?
  actorUserId    String?
  actorType      String   @default("user")         // user | api_key | system | webhook
  actorLabel     String?
  action         String                            // call.create | message.send | number.buy | settings.update | auth.login …
  targetType     String?
  targetId       String?
  metadata       Json?
  ip             String?
  userAgent      String?
  result         String   @default("success")      // success | failure
  createdAt      DateTime @default(now())

  organization Organization? @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  actor        User?         @relation(fields: [actorUserId], references: [id], onDelete: SetNull)

  @@index([organizationId, createdAt])
  @@map("audit_logs")
}
```

---

## 4. JSON Payload & DTO Contracts

### 4.1 Inbound Voice Webhooks (Tolerant Parsing)
- **Answer URL Callback (`POST`):**
  - Parameters: `CallUUID`, `From`, `To`, `CallStatus` (`ringing`|`in-progress`|`completed`), `Direction` (`inbound`|`outbound`), `ALegUUID`, `ALegRequestUUID`, `ForwardedFrom`, `HangupCause`, `Duration`, `BillDuration`, `TotalCost`, `X-PH-*`
  - Tolerant Zod Schema: `.passthrough()` preserves unknown fields into `rawPayload`.
- **Status Callback:**
  - Reports state transitions (`ringing`, `in-progress`, `completed`).
- **Hangup Callback:**
  - Provides `HangupCause`, `Duration`, `BillDuration`, `TotalCost`.

### 4.2 Messaging Webhooks (Tolerant Parsing)
- **Inbound Message Callback:**
  - Parameters: `From`, `To`, `Type`, `Text`, `MessageUUID`, media attachments.
- **Message Status Callback:**
  - Parameters: `From`, `To`, `MessageUUID`, `Status` (`queued`|`sent`|`delivered`|`undelivered`|`failed`), `Units`, `TotalRate`, `TotalAmount`, `ErrorCode`, `MCC`, `MNC`.

### 4.3 Media & Transcription Webhooks (Tolerant Parsing)
- **Recording Callback:**
  - Parameters: `recording_id`, `record_url`, `recording_duration`, `call_uuid`.
- **Transcription Callback:**
  - Parameters: `transcription_id`, `recording_id`, `status`, `transcription_url` or inline text.

### 4.4 Outbound API DTOs (Strict Parsing)
- `CreateCallRequest`:
  - `phoneNumberId`: string (uuid)
  - `to`: string (E.164)
  - `mode`: `'xml' | 'forward' | 'url' | 'voicemail'`
  - `xml`?: string
  - `forwardTo`?: string
  - `url`?: string
  - `record`?: boolean
  - `transcribe`?: boolean
  - `transcriptionLanguage`?: string
  - `machineDetection`?: boolean
- `SendMessageRequest`:
  - `phoneNumberId`: string (uuid)
  - `to`: string[] (E.164 destinations)
  - `text`: string
  - `mediaIds`?: string[]
  - `statusCallbackUrl`?: string
- `BuyNumberRequest`:
  - `countryIso`: string (2-letter ISO)
  - `e164`: string
  - `applicationId`?: string
  - `cnam`?: `'enabled' | 'disabled'`
  - `complianceApplicationId`?: string
- `UpdateTranscriptionPolicyRequest`:
  - `scope`: `'organization' | 'number'`
  - `targetId`?: string
  - `enabled`: boolean
  - `language`?: string

---

## 5. Environment Variables & Configuration

| Variable | Description | Default / Example |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://postgres:postgres@localhost:5432/plivo_db?schema=public` |
| `PUBLIC_BASE_URL` | Public origin for signature computation and callbacks | `http://localhost:3000` |
| `AUTH_SECRET` | Secret key for Auth.js console session cookies | Generated 32-byte secret |
| `JWT_ACCESS_SECRET` | Secret for short-lived mobile API JWTs | Generated 32-byte secret |
| `ACCESS_TOKEN_TTL` | Access token lifespan | `900` (15 minutes) |
| `REFRESH_TOKEN_TTL_DAYS` | Refresh token retention window | `30` |
| `ENCRYPTION_KEK` | 32-byte Base64 key-encryption-key for AES-256-GCM | Generated Base64 key |
| `ENCRYPTION_KEK_VERSION` | Key version tracker | `1` |
| `MEDIA_URL_SECRET` | Secret for HMAC signing proxy playback URLs | Generated 32-byte secret |
| `MEDIA_URL_TTL_SECONDS` | Signed media URL lifetime | `300` (5 minutes) |
| `TELEPHONY_MODE` | Active provider (`simulator` or `live`) | `simulator` |
| `PLIVO_AUTH_ID` | Real Plivo Auth ID (required if `live`) | `MXXXXXXXXXXXXXXXXX` |
| `PLIVO_AUTH_TOKEN` | Real Plivo Auth Token (required if `live`) | Secret token |
| `PLIVO_WEBHOOK_AUTH_TOKEN` | Optional override for signature verification | Secret token |
| `RATE_LIMIT_MAX` | Global rate limit window cap | `300` |
| `RATE_LIMIT_WINDOW_MS` | Rate limit window in ms | `5000` |
| `SEED_OWNER_EMAIL` | Initial seed admin email | `admin@example.com` |
| `SEED_OWNER_PASSWORD` | Initial seed admin password | Strong random password |

---

## 6. Maintenance Log & Resolved Dependencies

| Package / Tool | Version | Purpose |
|---|---|---|
| Node.js | v26.2.0 | Host runtime |
| pnpm | 12.5.1 | Package manager |
| Next.js | 16.3.8 | App Router web console & REST API |
| React | 19.2.8 | UI library |
| Tailwind CSS | 4.3.3 | Styling framework |
| TypeScript | 5.9.3 strict | Type checking & contracts |
| Prisma | 6.19.3 | ORM & PostgreSQL migrations |
| plivo | 4.79.0 | Official Plivo Node SDK |
| zod | 3.24.2 / 4.x | Request/response DTO schemas & OpenAPI |
| jose | 6.2.12 | JWT access token creation/verification |
| bcryptjs | 3.0.3 | Password hashing & token hashing |
| tsx | 4.23.15 | TypeScript script execution for Layer 3 tools |
| vitest | latest stable | Unit and integration testing |
| playwright | latest stable | End-to-end browser testing |

### Operational Runbooks
1. **Switching Telephony Mode:**
   - Change `TELEPHONY_MODE=simulator` to `TELEPHONY_MODE=live`.
   - Provide `PLIVO_AUTH_ID` and `PLIVO_AUTH_TOKEN` in `.env`.
   - Verify connectivity with `pnpm tsx tools/verify-plivo-credentials.ts`.
2. **Replaying Webhooks for Idempotency Validation:**
   - Run `pnpm tsx tools/replay-webhook.ts`.
3. **Secret Leak Audit:**
   - Run `pnpm tsx tools/check-secrets.ts` to ensure `.gitignore` and `.env.example` maintain zero-secret hygiene.
4. **Rotating Encryption KEK:**
   - Increment `ENCRYPTION_KEK_VERSION`, supply new KEK in env, run migration re-encryption tool.
5. **Containerized Deployment:**
   - Run `docker compose up -d` to launch PostgreSQL and the standalone Next.js container on port 3000.
   - Probes: `GET /api/v1/health` (liveness), `GET /api/v1/ready` (readiness with DB check).
