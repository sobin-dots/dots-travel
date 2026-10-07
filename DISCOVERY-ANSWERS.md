# Discovery Answers & Answer Bank — Plivo Communications Platform

> **How to use this file.** It is the companion to `BLAST-BUILD-BRIEF.md`. Paste §A with the brief so
> Phase 1 needs no questions. When Antigravity asks anything, find it in §B and answer with the wording
> given — every answer is chosen to keep the build deterministic. §C–§J are the artefacts it will ask you
> to produce or confirm (schema, payloads, env vars, endpoints, simulator spec, acceptance tests).

---

## §A. The five Discovery Questions, answered

**1. North Star (the singular desired outcome).**
A deployed, secure, multi-tenant web console where a company runs its whole phone operation on Plivo —
outbound and inbound calls, SMS/MMS both ways, number management, call recordings and transcripts — on top
of a **versioned REST API (`/api/v1`)** that a future mobile app consumes **without any API rewrite**.
Success is not "the features exist": it is that a stranger can clone the repo, run four commands, log in,
place a call, hear the recording, read the transcript and see a threaded SMS conversation — and that the
same API works with a bearer token alone.

**2. Integrations (external services and whether keys are ready).**

| Service | Needed? | Status / instruction |
|---|---|---|
| **Plivo REST API** | Yes — the core integration | Auth ID + Auth Token. **Assume unavailable at the start**: the build must run fully in `TELEPHONY_MODE=simulator`, then flip to live by changing env vars. A trial account works but can only call/message **verified sandbox numbers**. |
| PostgreSQL | Yes | Local via Docker Compose; managed (Neon/Supabase/RDS) for deployment. |
| SMTP / transactional email | Optional (P1) | For invite/notification emails; leave a typed seam, do not block on it. |
| Object storage (S3-compatible) | Optional (P1) | Only if recordings must be archived off-platform. Default: stream from Plivo through the app. |
| Error monitoring (Sentry) | Optional | Nice to have; not a blocker. |
| Everything else (WhatsApp, Verify, Lookup, 10DLC, SIP) | **Out of scope** | Leave typed seams; do not implement. |

**3. Source of Truth.**
**Plivo is the source of truth for telephony state** (call status, message status, recording readiness,
transcription readiness) and it reports that state exclusively through **callbacks**. Our Postgres is a
projection of that truth, plus everything Plivo does not know: organizations, users, policies
(transcription defaults, retention), audit history and credentials. Consequence: **never** treat a
successful send request as the final state, and every reconciliation must be idempotent because callbacks
repeat. The docs mirror at `D:\Projects\plivo-docs-study\md\` is the source of truth for **how Plivo
behaves**.

**4. Delivery Payload (where the result is delivered).**
Two payloads. (a) **The product**: a deployed Next.js app + Postgres, reachable at `PUBLIC_BASE_URL`, with
the console usable end to end — this is the payload that makes the project "complete". (b) **The interface
for the mobile app**: a generated OpenAPI 3.1 document at `/api/v1/openapi.json`, rendered at `/docs`,
plus a bearer-token auth flow that a mobile client can implement today. The console is the first consumer
of that contract; it is never a privileged one.

**5. Behavioural Rules (how the system must act).**

*Must:*
- Be deterministic — no LLM calls in the request path, business rules in code with tests.
- Validate every webhook signature with the SDK, always, in every environment.
- Encrypt every Plivo credential at rest; show only a masked Auth ID.
- Reflect **callback truth**: statuses, hangup causes, costs and transcripts come from Plivo events.
- Prefer explicitness over defaults — especially "transcription off", which must be an explicit
  suppression because Plivo's own record default is `auto`.
- Explain failures in plain language (hangup cause, MDR error code, 403-is-capacity) instead of surfacing
  raw codes alone.
- Be honest about verification: if something was proven against the simulator rather than live Plivo,
  say so where it is recorded.

*Must not:*
- Never import Twilio concepts (TwiML, `PageSize`, `X-Twilio-Signature`, nested error objects, API-key pairs).
- Never invent a Plivo endpoint, parameter, callback field or limit — read the mirror first.
- Never hand-roll signature validation, and never disable it to make a test pass.
- Never expose a raw Plivo recording URL to the browser (`<audio>` cannot send auth headers — proxy it
  behind a short-lived signed app URL).
- Never put secrets, tokens or full Auth IDs in the client bundle, logs, error messages or git.
- Never assume "sent" means "delivered".
- Never let a webhook handler 500 on a duplicate payload.

---

## §B. Answer bank — what to reply when Antigravity asks

Answers are grouped the way the questions actually arrive.

### B1. Scope and product questions

| Antigravity asks | Your answer |
|---|---|
| "Should I build Twilio integration too?" | No. Plivo only. The Twilio mention was dictation carry-over. Optional later path: Plivo number porting plus a `source` flag on the number record. |
| "Do we need WhatsApp / Verify / Lookup / 10DLC / SIP trunking?" | Not now. Leave typed seams and document the path; implementing them delays P0 and each has commercial gating (WhatsApp and Verify both require a monthly commitment). |
| "Should I build the mobile app?" | No. Build the API it will need: `/api/v1`, stable DTOs, bearer-token auth, published OpenAPI. The mobile app is a separate project. |
| "Do we need billing/payments?" | No. Show usage and cost that Plivo reports; do not build payment processing. |
| "How far do we take the dashboard?" | Usage and cost summary (calls, minutes, messages, spend, per number, over a date range) is P1. Per-call cost display is P0. |
| "Should the console support multiple organizations?" | Yes — multi-tenancy is architectural and must exist from the first migration, even if you seed one organization. |
| "Do we implement P1 items now?" | No. P0 first, end to end, with tests. Then P1 in the order listed in the brief. |

### B2. Credentials and environment

| Antigravity asks | Your answer |
|---|---|
| "Please share your Plivo Auth ID and Auth Token." | Do not paste credentials in chat. Tell it: put placeholders in `.env` (git-ignored) and `.env.example`; verification happens by presence/shape only. I will add real values locally myself. |
| "I need real credentials to test." | You don't. Build `TELEPHONY_MODE=simulator` so the entire product is exercisable offline: the simulator must generate **real** `X-Plivo-Signature-V3` signatures so the webhook path is genuinely tested. Live verification happens in the Link phase when credentials exist. |
| "Which mode should default?" | `simulator` in development and tests, `live` in production. Fail loudly at boot if `live` is selected with missing credentials. |
| "Trial account limits?" | A Plivo trial account can only call/message phone numbers **verified** as sandbox numbers. That is expected; document it, don't code around it. |
| "Where do secrets live?" | `.env` in development (git-ignored), the host's secret store in production. `check-secrets.ts` runs in CI. `.env.example` documents every variable with no values. |
| "Do we need a USD account?" | For US/India work, an account with USD billing is the norm; INR accounts can only call within India. Note it as a deployment prerequisite, don't build around it. |

### B3. Architecture decisions

| Antigravity asks | Your answer |
|---|---|
| "Next.js API routes or a separate backend service?" | Next.js Route Handlers under `/api/v1/**` are the API, with the Node runtime (`export const runtime = 'nodejs'`). One deployable. If a media-streaming or webhook route later needs to outlive a serverless limit, it moves to a worker — keep provider access in `src/lib/**` so that move is mechanical. |
| "Auth.js sessions only, or a token API too?" | Both, and they are separate: Auth.js cookies for the console, bearer tokens + rotating refresh tokens for the API. **No endpoint under `/api/v1/**` may require a cookie.** |
| "Should the console call the API or query the DB directly?" | It calls the API, always. Server Components may call the service layer directly for read-only rendering, but never bypass organisation scoping, and never mutate the database outside the API layer. |
| "Where does the provider boundary live?" | `src/lib/telephony/` exporting a `TelephonyProvider` interface; `plivo/` (real, SDK-backed) and `simulator/` (in-process, signature-signing) implementations; selection by env. Nothing outside that folder may import the Plivo SDK. |
| "How do we page Plivo lists?" | `limit` is capped at **20** and paging is `offset`-based. Build one `paginate()` helper that loops `offset` with exponential backoff (Plivo allows 300 requests / 5 s) and returns a bounded async iterator. Never request more than 20. |
| "Do we need a job queue?" | Not for P0. Webhook handlers must return 200 within a couple of seconds and enqueue slow work; if that needs a queue, start with a Postgres-backed table + worker (no new infrastructure), and keep the interface replaceable. |
| "Do we need Redis?" | No. Rate limiting and short-lived tokens can live in Postgres for this scale; document the upgrade path. |
| "Deployment target?" | Recommend a container host (Fly.io / Railway / Render) + managed Postgres, because webhook signature validation, raw-body preservation and streaming media are all easier there. Vercel is acceptable if you use the Node runtime and streaming responses, but state the trade-off explicitly. **Ask me before choosing.** |
| "Should we use a monorepo?" | Single Next.js app + `tools/` is enough. Do not add a workspace unless a real second package appears. |

### B4. Plivo-specific questions (the ones that matter most)

| Antigravity asks | Your answer |
|---|---|
| "Which Plivo auth style? API keys? OAuth?" | **HTTP Basic Auth only**: Auth ID as username, Auth Token as password. There is no API-key pair and no OAuth. |
| "How do I validate the webhook signature?" | Use the SDK: `plivo.validateV3Signature(method, url, nonce, authToken, signature[, params])`. Never hand-roll it. Headers are `X-Plivo-Signature-V3`, `X-Plivo-Signature-Ma-V3`, `X-Plivo-Signature-V3-Nonce`; accept a comma-separated list (multiple active tokens); the `-Ma-V3` variant is signed with the **main account** token. |
| "Which parts of the URL and payload go into the signature?" | The **full URL including scheme, port and query string**, plus every POST parameter as `Name`+`Value` sorted **alphabetically, case-sensitively**, plus the nonce, signed with HMAC-SHA256 and Base64-encoded. The URL must be the public URL Plivo called — hence `PUBLIC_BASE_URL`. |
| "Should I support Signature V2?" | No. It is deprecated. V3 only; reject everything unsigned with 403. |
| "What returns TwiML?" | Nothing. Plivo returns **Plivo XML** from `answer_url`: **valid Plivo XML**, `text/xml` or `application/xml`. Invalid XML ends the call (hangup cause `8011`, `Invalid Answer XML`), and Plivo raises a Voice Alert above a 5% configuration-failure rate. No documented body size or wall-clock limit, but callback responses are bound by the timeout knobs (`#ct` default 2 s, `#rt` 40 s, `#tt` 55 s) — so respond immediately and work off the response path Elements include `Speak`, `Play`, `DTMF`, `GetDigits`, `GetInput`, `Dial`, `Redirect`, `Hangup`, `Wait`, `Conference`, `MultiPartyCall`, `Record`, `PreAnswer`, `Stream`. |
| "How do we implement 'enable/disable transcript'?" | There is **no account-level transcription switch in Plivo**. Implement it as app policy: org default → per-number override → per-call override, resolved at record time. When off, **explicitly suppress** (`transcription_type`/`transcriptionType` not set to auto) because the platform default is `auto`. Store the resolved decision on the call so the UI can explain a missing transcript. Manage existing ones via `/Transcription/` (`GET`, `POST /Transcription/{recording_id}/`, `DELETE /Transcription/{transcription_id}/`, `type` filter `transcription`/`raw`/`diarized`). |
| "Can we play the recording directly in `<audio>`?" | Only through our own proxy. Plivo recording URLs are **public by default** (unguessable, but public), and `<audio>` cannot send an Authorization header — so mint a short-lived signed URL on our domain that streams from Plivo server-side. Optionally enable Plivo-side Basic Auth on media as defence in depth (account-admin setting). |
| "How do we know a call or message really succeeded?" | Only from callbacks. Persist every callback as a `CallEvent` / message status row; show `queued` → `sent` → `delivered` rather than assuming. Billing is a projection of that truth too: it starts **when the call is answered, not when it rings**, Voice API increments are **60/60 in the US** and **30/30 in India**, and inbound and outbound legs bill separately. |
| "How should we handle 403 from Plivo?" | It is overloaded: geo permission blocked, IP not whitelisted, account unverified, feature disabled, **or the account is at its concurrency limit** (in which case no call UUID and no hangup callback are ever produced). Distinguish by response body, and surface "capacity limit reached" distinctly in the UI. |
| "Do we need to handle CPS/concurrency ourselves?" | Yes as a client concern: a token bucket around outbound sends, a clear error when Plivo rejects, and a documented capacity banner. Outbound CPS and concurrency are account-wide pools shared with SIP trunking; inbound CPS is a separate 10/s. |
| "Which number can we call from?" | Only a Plivo number owned by the account (or a verified caller ID where supported). Buying is `POST /PhoneNumber/{number}/`; search is `GET /PhoneNumber/` with **`country_iso` required** and `limit` max 20. India purchases may need a compliance application. |
| "Can we buy numbers in any country?" | No. Pay-as-you-go covers the **US** (and **India** with KYC). Canada/UK/AU/NZ/SG/BR/UAE/SA/MY/ID require an **Enterprise plan with a USD 1,000/month minimum commit**. Surface that in the buy flow rather than letting a purchase fail opaquely. |
| "Is there a sandbox/test mode in Plivo?" | Not a separate API environment. Test with a trial account and verified sandbox numbers, and build our own simulator for everything else. |
| "How do we store the Plivo credential securely?" | `PlivoAccount.authIdEncrypted` / `authTokenEncrypted`, AES-256-GCM with a KEK from env, unique IV per record, auth tag stored, decrypt only in the provider client. Never log, never return to the client, mask display to the last 4 characters. |
| "Can we send from multiple numbers / rotate?" | Yes — model a `PhoneNumber` per record and a future `Powerpack` seam. Pooling (Powerpack) is out of scope for P0 but the message send should accept "from number" so pooling can slot in. |
| "What about message encoding cost?" | Show it before send: GSM-7 is 160 chars/unit (153 concatenated, max 1,600); **UCS-2 is 70/67 (max 737)** — one emoji or non-Latin character halves capacity. Compute units client-side from the same helper the API uses. |
| "Do we implement DND/opt-out keywords?" | Not in P0 — Plivo enforces DND at the platform level for US/CA long codes and toll-free. Document it, and add an opt-out list in P1. |

### B5. Data, schema and contracts

| Antigravity asks | Your answer |
|---|---|
| "Where is the schema?" | §C below. Paste it into `CLAUDE.md` and use it as the Prisma schema basis. Change it only via a migration plus a note in `CLAUDE.md`. |
| "Should webhook payloads be strict or tolerant?" | **Tolerant.** Plivo may add fields without notice: parse with optional/passthrough semantics, store the raw payload, and only require the fields we act on. **Our own API DTOs are strict** (reject unknown fields). |
| "Do we store raw payloads?" | Yes — `rawPayload Json` on `CallEvent`, `Message`, `Recording`, `Transcription`, plus a `WebhookEvent` table with the untouched body, headers, signature validity, dedupe key and processing state. This is the forensic and replay substrate. |
| "Enums: strings or database enums?" | Plain strings with Zod enums at the boundary. Plivo adds statuses; a DB enum turns a new status into a migration and an outage. |
| "Timestamps and money?" | UTC `DateTime` everywhere; `Decimal` for costs; durations as integer seconds exactly as Plivo reports them. |
| "Soft delete?" | Only for numbers and recordings (recoverable release/delete). Everything else hard-deletes with the org cascade. |

### B6. UI/UX

| Antigravity asks | Your answer |
|---|---|
| "Layout?" | Dark operations console: left nav (Overview, Calls, Messages, Recordings, Transcripts, Numbers, Settings, Audit), sticky top bar with the active page title and the connection mode badge (Simulator/Live — this must be visible, never ambiguous), master–detail layouts for calls and messages. |
| "Which screens are P0?" | Login (+MFA) · Overview · Calls list + call detail (timeline, actions, recording player, transcript) · Messages (threaded, composer) · Recordings (player, download, delete, transcribe-now) · Transcripts (list, search, view) · Numbers (list, buy, per-number behaviour + transcription toggle) · Settings (Plivo account, transcription policy, retention, API keys, team) · Audit log · `/docs` (API reference). |
| "How should live calls look?" | Live controls only when `status` is live; a visible "recording" and "transcription" indicator; a timeline built from real events with timestamps; disabled states with a reason, never a silently dead button. |
| "Accessibility?" | shadcn/ui defaults, keyboard-navigable tables, focus rings, labelled inputs, `aria-live` for status changes. |
| "Branding?" | Neutral and professional; no Plivo branding in the console chrome (multi-tenant product), only in the connection settings. |

### B7. Testing and evidence

| Antigravity asks | Your answer |
|---|---|
| "How much testing?" | Unit for signature validation (valid, invalid, tampered param, replayed nonce, comma-separated multi-token), encryption round-trip, pager, encoding/units, policy resolution; integration against a real Postgres for tenant isolation, RBAC, idempotent webhook replay; Playwright for login, place-call → recording → transcript, send/receive SMS, buy number, toggle transcription. |
| "Are mocks acceptable?" | The **simulator is the mock** — it must produce real signatures and real HTTP round trips. Mocking `TelephonyProvider` inside the app is fine for unit tests; mocking the signature algorithm is forbidden. |
| "How do we prove live Plivo works?" | The Link-phase tools: verify credentials, list numbers, send a test SMS, place a test call, replay a webhook. Paste their real output. If credentials are unavailable, say so explicitly and rely on the simulator — do not imply live verification. |
| "Definition of done?" | §I below. |

### B8. Deployment and operations

| Antigravity asks | Your answer |
|---|---|
| "Deploy now?" | Phase 5 only, after the console is approved. Ask me for the host before provisioning anything. |
| "Migrations in production?" | `prisma migrate deploy` on release, never `db push`. Backups documented before the first deploy. |
| "Observability?" | Structured JSON logs with a request ID, `/api/v1/health` (liveness) and `/api/v1/ready` (DB + provider reachability), and a webhook section in the logs summarised by dedupe key. No PII in logs; message bodies and transcripts are never logged. |
| "Retention?" | Configurable per organization (`recordingRetentionDays`), enforced by a scheduled job in P1; the setting and the job must both exist or the claim is untrue. |
| "What is the maintenance log?" | The final section of `CLAUDE.md`: resolved dependency versions, environment variables, operational runbooks (rotate credentials, replay a webhook, backfill a day of events), and every learning the self-healing loop produced. |

---

## §C. Prisma schema (paste into `CLAUDE.md`, then into `prisma/schema.prisma`)

```prisma
// Multi-tenant Plivo communications platform.
// Invariants: every row is organisation-scoped; Plivo credentials are encrypted at rest;
// provider identifiers are unique (idempotency backbone); raw payloads are retained.

generator client { provider = "prisma-client-js" }
datasource db { provider = "postgresql"; url = env("DATABASE_URL") }

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
  numbers         PhoneNumber[]
  calls           Call[]
  messages        Message[]
  recordings      Recording[]
  transcriptions  Transcription[]
  apiKeys         ApiKey[]
  webhookEvents   WebhookEvent[]
  auditLogs       AuditLog[]

  @@map("organizations")
}

model User {
  id            String    @id @default(uuid())
  email         String    @unique
  name          String
  passwordHash  String
  mfaSecretEnc  String?                        // TOTP secret, encrypted
  mfaEnabled    Boolean   @default(false)
  mfaRecoveryCodes String[] @default([])       // hashed recovery codes
  status        String    @default("active")   // active | disabled
  lastLoginAt   DateTime?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

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
  id             String    @id @default(uuid())
  organizationId String
  createdByUserId String?
  name           String
  prefix         String    @unique              // shown in UI, e.g. "cms_ab12…"
  secretHash     String                         // sha256 of the secret half
  scopes         String[]  @default([])         // e.g. ["calls:write","messages:read"]
  lastUsedAt     DateTime?
  expiresAt      DateTime?
  revokedAt      DateTime?
  createdAt      DateTime  @default(now())

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
  applications Application?
  @@unique([organizationId, authIdLast4, label])
  @@map("plivo_accounts")
}

model Application {                               // Plivo application = answer_url + urls
  id               String   @id @default(uuid())
  organizationId   String
  plivoAccountId   String
  plivoAppId       String   @unique
  name             String
  answerUrl        String
  answerMethod     String   @default("POST")
  fallbackAnswerUrl String?
  hangupUrl        String?
  messageUrl       String?
  defaultNumberApp Boolean  @default(false)
  rawPayload       Json?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

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
  // policy actually applied (so the UI can explain outcomes)
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
  recordingUrl      String                        // Plivo-side URL; never sent to a browser
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
  id                String   @id @default(uuid())
  organizationId    String
  recordingId       String?
  callId            String?
  plivoTranscriptionId String? @unique
  recordingSid      String?                       // Plivo keys transcriptions by recording id
  type              String   @default("transcription") // transcription | raw | diarized
  status            String   @default("queued")   // queued | in-progress | completed | failed
  language          String?
  text              String?  @db.Text
  segments          Json?                          // speaker-tagged segments when diarized
  wordCount         Int?
  errorCode         String?
  errorMessage      String?
  source            String   @default("callback")  // callback | on_demand
  rawPayload        Json?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

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

**Notes to carry into `CLAUDE.md`:** status/role/type fields are strings validated by Zod enums (Plivo adds
statuses; a DB enum would turn that into an outage). `WebhookEvent.@@unique([provider, dedupeKey, kind])`
is the idempotency guard — the webhook handler inserts first and treats a unique-violation as "already
processed". Every organisation-scoped model gets an `organizationId` index.

---

## §D. Payload contracts (define these in `CLAUDE.md`)

**Inbound voice webhook (Answer URL)** — Plivo POSTs form-encoded fields (or query params on GET):

| Field | Notes |
|---|---|
| `CallUUID` | Unique identifier for the call — the idempotency anchor |
| `From`, `To` | Caller and called number, with country code |
| `CallStatus` | `ringing` \| `in-progress` \| `completed` |
| `Direction` | `inbound` \| `outbound` |
| `ALegUUID`, `ALegRequestUUID` | Outbound legs |
| `ForwardedFrom` | Only for forwarded calls (carrier-dependent) |
| `HangupCause`, `Duration`, `BillDuration`, `TotalCost` | On completion |
| `X-PH-*` headers | Custom SIP headers echo back prefixed |

**Message status callback** — `From`, `To`, `MessageUUID`, `Status`, `Units`, `TotalRate`, `TotalAmount`,
`ErrorCode`, `MCC`, `MNC`. **Inbound message callback** — `From`, `To`, `Type`, `Text`, `MessageUUID`,
media links for MMS. **Recording-ready callback** — recording id, `record_url`, duration, and the call
reference. **Transcription callback** — recording/transcription id, status, text or a text URL.

**Our API DTOs (strict):** `CreateCallRequest { phoneNumberId, to, mode: 'xml'|'forward'|'url'|'voicemail',
xml?, forwardTo?, url?, record, transcribe, transcriptionLanguage?, machineDetection? }`;
`SendMessageRequest { phoneNumberId, to: string[], text, mediaIds?, statusCallbackUrl? }`;
`BuyNumberRequest { countryIso, e164, applicationId?, cnam?, complianceApplicationId? }`;
`UpdateTranscriptionPolicyRequest { scope: 'organization'|'number'|'call', enabled, language? }`.

**Parsing rule:** webhook schemas are tolerant (unknown fields ignored and retained in `rawPayload`);
**our** DTOs reject unknown fields. Because Plivo may add parameters without notice, never validate a
webhook with a strict schema.

---

## §E. Environment variables (`check-secrets` must pass; `.env.example` documents all, no values)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `PUBLIC_BASE_URL` | The public origin Plivo calls — used to build webhook URLs **and** to validate signatures. Must match exactly in production. |
| `AUTH_SECRET` | Auth.js/NextAuth signing secret |
| `JWT_ACCESS_SECRET`, `ACCESS_TOKEN_TTL` | API access tokens (~15 min) |
| `REFRESH_TOKEN_TTL_DAYS` | Refresh rotation window |
| `ENCRYPTION_KEK` | 32-byte base64 key-encryption-key for AES-256-GCM credential encryption |
| `ENCRYPTION_KEK_VERSION` | Key version stamped on ciphertext (rotation) |
| `MEDIA_URL_SECRET`, `MEDIA_URL_TTL_SECONDS` | Signed playback URLs for recordings/transcripts |
| `TELEPHONY_MODE` | `simulator` \| `live` |
| `PLIVO_AUTH_ID`, `PLIVO_AUTH_TOKEN` | Only for `live`; never committed; boot check fails loud if missing |
| `PLIVO_WEBHOOK_AUTH_TOKEN` | Optional override for signature validation when callbacks belong to a subaccount |
| `RATE_LIMIT_*` | Auth and webhook flood limits |
| `LOG_LEVEL`, `SENTRY_DSN` (optional) | Observability |
| `SEED_OWNER_EMAIL`, `SEED_OWNER_PASSWORD` | Seed only; `SEED_OWNER_PASSWORD` must be generated, never a weak default |

---

## §F. Plivo endpoint map the app actually needs

| Capability | Endpoint |
|---|---|
| Verify credentials | `GET /Account/{auth_id}/` |
| Buy / search numbers | `POST /PhoneNumber/{number}/`, `GET /PhoneNumber/` (`country_iso` required, `limit` ≤ 20) |
| Owned numbers | `GET/POST/DELETE /Number/`, `POST /Number/{number}/` (attach application, URLs) |
| Applications | `POST/GET /Application/`, `POST/DELETE /Application/{app_id}/` |
| Place call | `POST /Call/` |
| Live control | `DELETE /Call/{call_uuid}/`, `POST /Call/{call_uuid}/DTMF/`, `POST /Call/{call_uuid}/Play/`, `POST /Call/{call_uuid}/Speak/`, `POST /Call/{call_uuid}/Record/`, `DELETE /Call/{call_uuid}/Record/` |
| Call history | `GET /Call/`, `GET /Call/{call_uuid}/` |
| Recordings | `GET /Recording/`, `GET/DELETE /Recording/{recording_id}/` |
| Transcriptions | `GET /Transcription/`, `GET/POST /Transcription/{recording_id}/`, `DELETE /Transcription/{transcription_id}/` |
| Send message | `POST /Message/` |
| Message history | `GET /Message/`, `GET /Message/{message_uuid}/` |
| MMS media | `POST /Media/` (10 files, 2 MB each) |
| Usage/cost | Usage Summary API (cursor-paged; `page_token`/`next_page_token`, `page_size` 100) |

All paths are relative to `https://api.plivo.com/v1/Account/{auth_id}`. Verify any path against
`D:\Projects\plivo-docs-study\md\` before adding one to code.

---

## §G. Simulator specification (`TELEPHONY_MODE=simulator`)

The simulator is not a stub — it is the test harness that makes the whole product provable without
credentials. Requirements:

1. **Deterministic IDs** that look like Plivo's (`CallUUID`, `MessageUUID`, recording ids) and stay stable
   for a given scenario seed.
2. **Real signatures.** Every callback the simulator delivers is signed with the genuine V3 algorithm
   (HMAC-SHA256 over URL + alphabetically-sorted params + nonce, Base64) using the configured token, and
   sent over a real HTTP request to the app's webhook route. If validation is broken, the tests fail — that
   is the point.
3. **Lifecycle scripting.** `simulateInboundCall()`, `simulateCallAnswered()`, `simulateRecordingReady()`,
   `simulateTranscriptionReady()`, `simulateInboundSms()`, `simulateMessageStatus()` — each firing the same
   chain of callbacks Plivo would.
4. **Media.** Generate a small real audio payload for recordings (a WAV tone of the right duration) so the
   player, the proxy route, the signed-URL flow and the download path are all genuinely exercised.
5. **Failure injection.** A switch to make `answer_url` time out, to return 403 (capacity), to send a
   duplicate callback (idempotency test), a tampered signature (must be rejected), and an `undelivered`
   message with an error code.
6. **Controlled via the API, not the UI internals.** Expose it under `/api/v1/dev/simulator/**`, guarded
   by `TELEPHONY_MODE=simulator` and disabled in production, so Playwright and the tools can drive scenarios.

---

## §H. Acceptance checklist (the payload in its final destination)

- [ ] Clean clone → `pnpm install && pnpm db:migrate && pnpm db:seed && pnpm dev` → console loads.
- [ ] Sign in, enrol TOTP, sign out, sign in with the code.
- [ ] Connect a Plivo account (real or simulator), see verification status and a masked Auth ID.
- [ ] Buy/list a number; configure Answer URL + behaviour toggles; see the exact XML the Answer URL will serve.
- [ ] Place an outbound call (inline XML / forward / URL); see status transition to a terminal state from callbacks.
- [ ] Receive a simulated inbound call; hear the configured greeting; see it appear live in the console.
- [ ] End, transfer, send DTMF, start/stop recording on a live call.
- [ ] Recording appears with duration, plays inline, downloads, deletes.
- [ ] Transcription toggle: off → recording has **no** transcript and the UI explains why; on → transcript appears, is readable and searchable; "transcribe this recording now" works for the recording made while off.
- [ ] Send an SMS; see `queued → sent → delivered` from callbacks; an `undelivered` one shows a plain-language reason.
- [ ] Receive a simulated inbound SMS; reply in the thread; the thread groups correctly.
- [ ] Message length widget shows units and encoding for GSM-7 and UCS-2.
- [ ] A tampered webhook is rejected 403, logged, never processed; a replayed webhook changes nothing.
- [ ] Tenant-isolation test: org B cannot read org A's call, recording, transcript or message.
- [ ] RBAC test: viewer is refused every mutation.
- [ ] `/api/v1/openapi.json` validates and renders at `/docs`; a script authenticates with a bearer token only.
- [ ] `pnpm test` and `pnpm e2e` green; `check-secrets` clean; no secret in git history.
- [ ] `CLAUDE.md` has the final schema, invariants, versions and maintenance log; `progress.md` marks clearly what was verified live vs simulated.

---

## §I. Limits and costs to design against (from the Plivo docs)

| Fact | Value |
|---|---|
| API rate limit | 300 requests / 5 s → 429 |
| List page size | `limit` 1–20, default 20 (`offset` paging) |
| Outbound CPS / concurrency | Account-wide pools shared with SIP trunking. US: free tier 1/2 · Professional <$100 1/5 · $100–500 2/10 · >$500 2/25 · Enterprise 2/50. India: Professional 2/50, Enterprise by contract. Ringing calls count; SIP-to-SIP and WhatsApp calls don't |
| Inbound CPS | 10 calls/s for every account |
| Call billing | Starts **when answered, not when ringing**. Voice API **60/60** in the US (rounded up: a 10 s answered call bills 1 minute); India data region **30/30**. Inbound and outbound legs bill separately. Numbers bill for the full month even if released mid-month |
| XML endpoint | Must return **valid Plivo XML** (`text/xml`). Invalid XML ends the call (hangup cause `8011`, `Invalid Answer XML`) and a >5% config-failure rate raises a Voice Alert. No documented size/time limit on the body, but callback responses are bound by the timeout knobs (`#ct` 2 s, `#rt` 40 s, `#tt` 55 s) |
| `answer_url` fallback | 3 retries or 60 s before `fallback_url` is used |
| Recording storage | Billed per stored minute per month (`recording_storage_rate`, e.g. `0.0004`), on duration rounded up to 60 s; the Recording object returns `recording_storage_duration` (days), `rounded_recording_duration` and `monthly_recording_storage_amount` |
| Call history windows | Completed calls retrievable for the last **90 days**; no `end_time` filter searches the last **7 days**; max range per query **30 days** |
| Queue expiry | `queue_time` 5–10,799 s, default 10,800 (3 hours) |
| MMS | 10 files/request, 2 MB/file, 5 MB total payload cap |
| SMS encoding | GSM-7 160/153 (max 1,600); UCS-2 70/67 (max 737) |
| Number eligibility | Pay-as-you-go: US + India (KYC). Others need Enterprise with a USD 1,000/month minimum commit |
| Concurrency breach at the API | **HTTP 403, no call UUID, no hangup callback** |
