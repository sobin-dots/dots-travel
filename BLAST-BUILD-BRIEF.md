# Build Brief — Plivo Communications Platform ("Comms Console")

> **How to use this file.** Paste this whole document as your first message to Antigravity, with the
> B.L.A.S.T. Master System Prompt installed as the system prompt. Everything the protocol demands before
> it is allowed to write code — the five Discovery answers, the data schema, the invariants, the phase
> blueprint — is already in here, so Phase 1 should complete without a round of questions. When it does
> ask something, answer from `DISCOVERY-ANSWERS.md` (the companion file), which contains the full schema,
> the payload contracts, the Plivo facts and a prepared answer bank.

---

## 0. Project identity

| Field | Value |
|---|---|
| **Project** | Plivo Communications Platform — a production-grade, multi-tenant web console + API for voice and messaging |
| **Directory** | `D:\Projects\plivo` (create it; this is a fresh project, not a modification of anything existing) |
| **One-line North Star** | Run a company's entire phone operation — calls in and out, SMS in and out, numbers, recordings and transcripts — from one secure web console backed by a versioned API that a mobile app will consume later **without an API rewrite**. |
| **Build target** | Runs locally today with zero Plivo credentials (simulator mode) and switches to live Plivo by changing environment variables only. |
| **Non-negotiable** | "Production grade" and "secure" are acceptance criteria, not adjectives. Every phase ends with real command output as evidence. |

### Interpretation note (read before building)

The original request said *"connect phone number from twilio"*. That is almost certainly dictation
carry-over from an earlier brief: this platform is built on **Plivo**, so "connect phone numbers" means
**search, buy and attach Plivo numbers to the application** (and, optionally, port existing Twilio
numbers into Plivo — the porting path exists and is documented, but it is a manual carrier process, not
an API call). Build the Plivo path. Do not build Twilio integration, and do not import TwiML/Twilio
concepts anywhere.

If the user later confirms they want to *bring* numbers from Twilio, the answer is Plivo number porting
plus a `source: 'ported'` flag on the number record — no code changes elsewhere.

---

## 1. Stack (locked)

| Layer | Choice | Notes |
|---|---|---|
| Framework | **Next.js (latest stable, App Router)** + TypeScript `strict` | Route Handlers under `src/app/api/v1/**` are the product API; the console is a client of that same API. Never call Plivo from a React component or a Server Action directly. |
| UI | **shadcn/ui** + Tailwind CSS | Dark-first operations console. Accessible components only; no bespoke date pickers or modals when shadcn has one. |
| DB | **PostgreSQL** + **Prisma** | Postgres in every environment. Docker Compose for local; a managed Postgres (Neon/Supabase/RDS) for deployed environments. No SQLite fallback in the app — dev/prod parity matters more than convenience here. |
| Auth | **Auth.js (NextAuth v5) for the console session** + **a first-class token API for mobile** | See §3.4 — the mobile app must never depend on cookies. |
| Validation/contracts | **Zod** as the single source of truth for every request/response DTO | One schema per DTO, reused as the runtime validator, the TS type, and the OpenAPI 3.1 document. |
| API docs | Generated OpenAPI 3.1 at `/api/v1/openapi.json`, rendered at `/docs` | Generated from Zod — never hand-written, never drifting from the implementation. |
| Plivo | **`plivo` Node SDK** — `const plivo = require('plivo'); new plivo.Client(authId, authToken)` | Use the SDK's `validateV3Signature` for webhooks. Pin the version in `package.json`; never copy an old version number from memory — resolve `latest` at install time. |
| Tests | **Vitest** (unit + integration against a real Postgres) and **Playwright** (console E2E) | Every security control has a failing-then-passing test. |
| Packaging | **Dockerfile + docker-compose.yml** | Local Postgres + the app. Production image is the same artifact. |

**Version policy:** resolve current stable versions at install time; never hard-code a version from
training data. Record every resolved version in `CLAUDE.md` as you install it.

---

## 2. Architecture invariants (these are law — see `CLAUDE.md`)

1. **API-first, versioned, mobile-ready.** Every capability exists as a stable HTTP endpoint under
   `/api/v1`. The console is the first client, not a special case. No session-only endpoint, no
   `formAction` that does business logic, no data access that bypasses the API layer.
2. **Provider boundary.** Nothing above `src/lib/telephony/**` may import the Plivo SDK or know Plivo's
   payload shapes. Everything talks to a `TelephonyProvider` interface with two implementations:
   `PlivoProvider` (real) and `SimulatorProvider` (offline, generates **real** `X-Plivo-Signature-V3`
   signatures). Selected by `TELEPHONY_MODE=live|simulator`. This is what makes the whole product
   buildable, testable and demoable with zero credentials — and it is mandatory, not a nice-to-have.
3. **Multi-tenant from day one.** Every row belongs to an `Organization`. No query anywhere may read or
   write without an organization scope. Cross-tenant access is a bug class, and there is a test for it.
4. **Credentials are encrypted at rest.** Each organization's Plivo Auth ID / Auth Token (and any
   subaccount credentials) is stored **AES-256-GCM encrypted** with a key-encryption-key from the
   environment. Plaintext credentials never touch the database, never reach the browser, and never appear
   in logs, error messages or audit rows. Only the last four characters of an Auth ID may be displayed.
5. **Webhooks are untrusted input.** Validate the signature before parsing anything, enforce idempotency,
   store the raw body, and never let a webhook handler throw a 500 that causes Plivo to retry a payload
   you already processed.
6. **Deterministic business logic.** LLM-free runtime: no model calls anywhere in the request path.
   Business rules live in code with tests, not in prompts.
7. **Evidence over assertion.** A phase is complete when a command was run and its real output is pasted
   into the walkthrough. "It should work" is not a result.

---

## 3. Product scope

### 3.1 Must have (P0) — the brief's core

| # | Capability | Behaviour |
|---|---|---|
| 1 | **Connect a Plivo account** | Store Auth ID + Auth Token per organization, encrypted; verify them live against Plivo (`GET /v1/Account/{auth_id}/`) and show verified/unverified status; support subaccounts later without schema change. |
| 2 | **Numbers** | Search the available inventory (`country_iso` required, region/city/prefix filters), buy a number (attach an application and compliance application where required), list owned numbers, configure per-number behaviour (answer URL, fallback URL, hangup URL, app assignment), release a number. |
| 3 | **Make outbound calls** | Choose from-number, destination, and call behaviour: inline TwiML-equivalent **Plivo XML**, forward to another number, or fetch XML from a URL. Options: record yes/no, transcribe yes/no, transcription language, machine detection, time limit, status callback URLs. |
| 4 | **Receive inbound calls** | A public, signature-validated Answer URL that returns **Plivo XML** the org can control from the console (voicemail, forward, IVR menu, reject, or "read a message"), configurable per number. |
| 5 | **Live call control** | For any in-progress call: hang up, transfer/redirect, send DTMF, start/stop recording, start/stop transcription, play audio, speak text. Buttons that only appear when the call is live. |
| 6 | **Call history & timeline** | Filterable, paged list (direction, status, number, date, searchable) with a per-call detail view: status timeline built from real callbacks, duration, cost, hangup cause + human explanation, recording(s), transcript. |
| 7 | **Send SMS/MMS** | From a chosen number or a powerpack, to one or many destinations, with optional media attachments, optional status callback URL. |
| 8 | **Receive SMS** | Public, signature-validated inbound Message URL; threaded two-way conversation view per counterpart number with delivery status per message. |
| 9 | **Recordings** | List/search recordings (by number, call, date, duration), stream them in the console with an inline player, download, and delete. **Media must be proxied through the app with a short-lived signed URL** — Plivo recording URLs are publicly reachable by default, so the console must never hand a raw Plivo URL to the browser. |
| 10 | **Transcription toggle + viewing** | Per-organization, per-number and per-call transcription preference; transcribed text stored, searchable, viewable inline next to its call, with word count/language/status, plus "transcribe this recording now" for something missed. See §4.4 — Plivo has no account-level switch, so this is an application policy. |
| 11 | **Status truth** | Delivery/status comes from Plivo callbacks, never from the assumption that a 200 from the send API means delivered. Every state transition is persisted as an event row. |

### 3.2 Should have (P1)

Audit log (who did what, from where) · API keys / personal access tokens for the mobile client · team
members with roles · organization settings (default transcription policy, recording retention days,
notification email) · usage & cost dashboard (calls, messages, minutes, spend, per number) · error-code
explainer using Plivo's MDR error dictionary · bulk calling and SMS campaign runner with CPS-aware
pacing · call quality/insights view.

### 3.3 Explicitly out of scope for this build

The mobile app itself (build the API it will need, not the app) · WhatsApp, Verify, Lookup, Number
Masking, SIP trunking and 10DLC registration (leave typed seams and a documented path, do not implement)
· AI voice agents / audio streaming (seam only) · billing/payment processing · number porting automation.

### 3.4 Authentication — two audiences, two mechanisms

This is the single most consequential decision, because the brief says a mobile app follows.

- **Console (web):** Auth.js v5, Credentials provider (email + password) plus **TOTP MFA**, with the
  Prisma adapter. Sessions are httpOnly cookies with `SameSite=Lax`, rotating, revocable, and every
  login (success and failure) is audited.
- **API (mobile):** a separate, first-class token scheme. `POST /api/v1/auth/token` exchanges
  email+password (+TOTP) for a short-lived **access token** (JWT, ~15 minutes, `jose`) and a **rotating
  refresh token** (opaque, hashed in the DB, reuse-detected and family-revoked). Long-lived **API keys**
  are also supported for server-to-server integration, scoped per organization and shown once.
- **Rule:** no endpoint under `/api/v1/**` may require a cookie. The console authenticates by sending its
  own bearer token, obtained the same way the mobile app does. If it works in the browser, it works from
  a phone.

---

## 4. The Plivo contract — build against this, never against a guess

Every fact below is from the official docs. **Treat it as the authority; if implementation seems to
require something not listed here, stop and read
`D:\Projects\plivo-docs-study\md\<the relevant page>.md` before inventing an endpoint.**

### 4.1 Platform-level

| Thing | Value |
|---|---|
| Base URL | `https://api.plivo.com/v1/Account/{auth_id}/` — API version is `v1` |
| Auth to Plivo | **HTTP Basic Auth**: Auth ID as username, Auth Token as password. There is no API-key pair, no OAuth, no request signing. |
| Request body | **JSON only**, `Content-Type: application/json`. GET and DELETE take query parameters. |
| Response envelope | Every response includes `api_id`. Errors are **flat**: `{"api_id":"…","error":"answer_url parameter is missing"}`. There is no nested `error` object — model this in Zod exactly. |
| Paging | **`limit` (1–20, default 20) + `offset`.** Offset paging, not cursors. The single exception is the Usage Summary API (`page_token`/`next_page_token`, `page_size` 100). Any "sync everything" job must loop `offset` with backoff. |
| Rate limit | **300 requests / 5 seconds** → HTTP 429. Retry with exponential backoff + jitter. |
| Async | Any request may take `callback_url` + `callback_method` (default POST); the immediate answer is just an `api_id`. |
| Status codes | 200 / 201 created / 202 changed / 204 deleted; 400 / 401 / 403 / 404 / 405 / 429 / 500. |
| Credentials shape | Auth IDs start `MA` (main account) and `SA` (subaccount). |

### 4.2 Voice

- **Outbound:** `POST /Call/` with **required** `from`, `to`, `answer_url`. Optional: `ring_url`,
  `hangup_url`, `fallback_url` (invoked when `answer_url` fails after 3 retries or 60 s),
  `answer_method`/`ring_method`/`hangup_method`/`fallback_method` (default POST), `time_limit` (default
  **14400 s**), `machine_detection` + `machine_detection_time` (default 5000 ms, range 2000–10000) +
  `machine_detection_url`, `sip_headers` (arrive prefixed `X-PH-`; reserved prefixes and the name
  `ClientRegion` are silently dropped), `sip_auth_username`/`sip_auth_password` (SIP-URI destinations
  only), `call_type` (`voice` | `whatsapp_voice`).
- **Live control** (all under `/Call/{call_uuid}/`): hang up (`DELETE`), transfer/redirect, send digits
  (`POST .../DTMF/`), play audio, speak text, start recording (`POST .../Record/`), stop recording
  (`DELETE .../Record/`).
- **Recording a live call** — `POST /Call/{call_uuid}/Record/` with `time_limit` (default **60 s**),
  `file_format` (`mp3` | `wav`, default mp3), `transcription_type` (**`auto` | `hybrid` | `manual`,
  default `auto`**), `transcription_url`. *Note the default: transcriptions are produced unless you say
  otherwise — "transcription off" must be an explicit suppression, not an omission.*
- **Call control language is Plivo XML, not TwiML.** `answer_url` must return **valid Plivo XML**, served as
  `text/xml` or `application/xml`. Invalid XML ends the call — the record carries hangup cause **`8011`
  (`Invalid Answer XML`)** — and Plivo raises a Voice Alert once more than 5% of calls fail on
  configuration errors, so XML generation is a hardened, unit-tested module, never string concatenation.
  No size or wall-clock limit for the body is documented, but callback responses *are* bound by the
  timeout/retry knobs in §4.5 (2 s connect, 40 s read, 55 s total by default), so the endpoint must answer
  immediately and do its work off the response path. Elements:
  `Speak`, `Play`, `DTMF`, `GetDigits`, `GetInput` (DTMF *or speech*), `Dial`, `Redirect`, `Hangup`,
  `Wait`, `Conference`, `MultiPartyCall`, `Record`, `PreAnswer`, `Stream`. Nesting: `GetInput`/`GetDigits`
  contain `Speak`/`Play`; `Dial` contains `Number`/`User`; `PreAnswer` contains `Speak`/`Play`/`Wait`.
  An empty `<Response/>` hangs up. Generate XML through the SDK's builder or a single audited module —
  never by string concatenation.
- **Request parameters Plivo posts to your XML/Answer URL:** `CallUUID`, `From`, `To`, `CallStatus`
  (`ringing`/`in-progress`/`completed`), `Direction` (`inbound`/`outbound`), plus `ALegUUID`,
  `ALegRequestUUID`, `ForwardedFrom` where relevant, and on completion `HangupCause`, `Duration`,
  `BillDuration`, `TotalCost`.
- **`Record` XML attributes:** `action`, `method`, `fileFormat`, `redirect`, `timeout` (15 s silence),
  `maxLength` (60), `finishOnKey` (`#`), `playBeep`, `recordSession`, `startOnDialAnswer`,
  `recordChannelType` (`mono`|`stereo`, default stereo), and the transcription set `transcriptionType`
  (`auto`|`hybrid`|`manual`), `transcriptionUrl`, `transcriptionMethod`, `transcriptionReportType`
  (`compact`|`full`).
- **Billing semantics that belong in the UI:** billing starts **when the call is answered, not when it
  rings**. Voice API billing is **60/60 in the US** (rounded up — a 10-second answered call bills a full
  minute) and **30/30 in the India data region**; **inbound and outbound legs bill separately**; numbers
  bill for the **full month even when released mid-month**. Display `bill_duration` as Plivo reports it
  instead of recomputing it, and treat machine detection as a cost control — an answered call is billable.
- **Recording storage is billable, and the Recording object already reports the cost:**
  `recording_storage_rate` is the unit cost per stored minute per month (`0.0004` in the docs' example),
  `recording_storage_duration` is days stored (incrementing every 24 h), and `monthly_recording_storage_amount`
  is the current cycle's charge; duration is rounded up to the nearest 60 s for storage
  (`rounded_recording_duration`). Surface these so retention is a visible business decision.
- **Call history has hard retrieval windows:** completed calls are retrievable for the **last 90 days**;
  with no `end_time` filter Plivo searches the **last 7 days**; a single query spans **at most 30 days**.
  So "all history" must mean *our* tables, populated from callbacks — never an unbounded passthrough
  query against Plivo.
- **Cost of failure to expose:** hangup causes are numeric codes with names — group them (`4000`s normal,
  `0`/`1xxx` cancelled or credit, `2xxx` destination/authorisation, `3xxx` callee state) and explain the
  common ones in plain language. `2070` is a media-anchoring/regulatory failure (India), `5030`
  concurrency, `5180`/`5190` SIP-trunk capacity. Never surface the legacy `call_state` field.

### 4.3 Messaging

- **Send:** `POST /Message/` with `src` **or** `powerpack_uuid` (one is required), `dst`, `text`,
  `type` (`sms` | `mms` | `whatsapp`), `url` + `method` (status callback), `log` (`true` | `false` |
  `content_only` | `number_only`), `queue_time` (5–10,799 s, default 10,800), `trackable`.
- **Statuses:** outbound `queued` → `sent` → `delivered` | `undelivered` | `failed` (plus `read` for
  WhatsApp); inbound `received` | `delivered` | `undelivered`. Plivo **does** send a `queued` callback.
- **Status callback fields:** `From`, `To`, `MessageUUID`, `Status`, `Units`, `TotalRate`,
  `TotalAmount`, `ErrorCode`, `MCC`, `MNC` — enough to reconcile cost and route from the callback alone.
- **MMS:** upload media first (`POST /Media/` — **10 files per request, 2 MB per file**), then reference
  the returned media IDs. Total MMS payload cap is **5 MB**; over that fails with error `120`,
  unsupported media is `130`, processing failure `140`. Failed messages are not charged.
- **Encoding drives cost and must be shown to the user before sending:** GSM-7 = 160 chars/unit (153 per
  concatenated unit, max **1,600**); **UCS-2 = 70 chars/unit (67 per unit, max 737)** — one emoji or
  non-Latin character halves capacity. A "message length" widget showing units and encoding is P0-adjacent.
- **Two-way:** inbound messages arrive at your Message URL; store them, thread them by counterpart number,
  and make the reply a one-click action.
- **Redaction:** `log: false` redacts content **and** destination and is **irreversible** — Plivo cannot
  recover redacted content. Offer it as an explicit per-organization privacy setting with a warning, not
  as a casual checkbox.

### 4.4 Transcription — how "enable/disable transcript" must actually work

There is **no account-level or number-level transcription switch in Plivo's API**. Transcriptions are
produced when a recording/conference is created with transcription parameters, and managed afterwards
through the Transcription API. Therefore the product implements the toggle as an **application policy**:

1. `Organization.transcriptionDefaultEnabled` — the default for new calls.
2. `PhoneNumber.transcribeEnabled` + `PhoneNumber.transcriptionLanguage` — per-number override.
3. Per-call override chosen when placing the call.
4. **Resolved at record time:** if transcription is off, explicitly pass the "no transcription" choice
   (`transcription_type`/`transcriptionType` omitted/disabled — **not** omitted by accident) so the
   platform default (`auto`) cannot quietly turn it on. Log the resolved decision on the call record so
   the UI can explain *why* a call has no transcript.
5. Managing transcripts afterwards: `GET/POST /Transcription/`, `GET /Transcription/{recording_id}/`,
   `DELETE /Transcription/{transcription_id}/`, with the `type` filter (`transcription` | `raw` |
   `diarized`). Deleting a transcription returns 204.
6. "Transcribe this recording now" issues `POST /Transcription/{recording_id}/` for recordings captured
   with transcription off.

### 4.5 Webhooks — the security-critical surface

**Signature validation, exactly:**

1. Take the **full request URL, including scheme, port and query string.**
2. For POST: append every parameter as `Name` + `Value`, with names **sorted alphabetically,
   case-sensitive** (Unix-style). For GET: parameters are already in the query string.
3. Append the value from the `X-Plivo-Signature-V3-Nonce` header.
4. Compute `Base64(HMAC-SHA256(assembledString, authToken))` and compare in **constant time**.

Headers on every Plivo request: `X-Plivo-Signature-V3`, `X-Plivo-Signature-Ma-V3`,
`X-Plivo-Signature-V3-Nonce`.

- `-V3` is signed with the token of the account/subaccount that **owns the request entity**;
  `-Ma-V3` is **always** signed with the **main account** token. With multiple active tokens the header
  carries a **comma-separated list** — accept any match.
- **Use the SDK validator** — `plivo.validateV3Signature(method, url, nonce, authToken, signature[, params])`
  — do **not** hand-roll it. (The docs' own hand-worked example is internally inconsistent, which is
  exactly why the SDK path is the requirement.)
- **V2 is deprecated.** Do not implement it. Do not accept unsigned webhooks in any environment. On
  validation failure: respond **403**, store the rejected payload for forensics, and never process it.
- The signature must be computed over **the URL and the parameters as configured**, so the public base URL
  must be an explicit environment variable (`PUBLIC_BASE_URL`) and every webhook route must be tested
  against it. A mismatch here is the #1 cause of "signature invalid" in the wild.

**Retry/timeout knobs ride on URL fragments** (callback URLs only, never audio URLs):
`#ct=` connection timeout (100–10000 ms, default **2000**), `#rt=` read timeout (100–40000, default
**40000**), `#tt=` total (100–55000, default **55000**), `#rc=` retries (0–5, default **1**),
`#rp=` policy (`4xx`,`5xx`,`ct`,`rt`,`all`; default `ct,rt`), `#er=` edge region. A **partial** response
is never retried. Audio URLs are fixed: ct 2 s, rt 120 s, rc 1, rp all.

**Idempotency is mandatory** — Plivo resends callbacks. Dedupe on `CallUUID` (ring/hangup),
`CallUUID` + element context (action URLs), `RecordingID` (recording callback), `StreamID` + event
(stream status). Store every webhook in a `WebhookEvent` table with a unique constraint on
`(provider, dedupe_key, event_type)` and process state (`received` → `processed` | `ignored` | `failed`).

**Inbound SMS delivery to your Message URL is retried several times before the message is marked
undelivered**, and the resulting error code is `2xxx` — where `xxx` is the HTTP status **your** server
returned. An inbound handler that 500s therefore converts a deliverable message into an undelivered one:
return 200 immediately, persist the raw body, and process it asynchronously. Return 200 fast and
do the work asynchronously.

### 4.6 Numbers

- Search: `GET /PhoneNumber/` with **`country_iso` required**, plus `prefix`, `region`, `city`, `lata`,
  `rate_center`, `limit` (max 20), `offset`.
- Buy: `POST /PhoneNumber/{number}/` with `app_id`, `cnam` (US only: `enabled`/`disabled`), and
  `compliance_application_id` where the country requires it (India).
- Owned numbers: list/retrieve/update/delete under `.../Number/`. Update is where the application
  (Answer URL, Fallback URL, Hangup URL) gets attached.
- Availability is plan- and country-gated, and the commercial gate is an **Enterprise agreement** (from a
  **USD 1,000/month minimum commit** in the US data region, ₹1,00,000/month in India). Do not hardcode a
  country allow-list from memory: resolve eligibility per country at search time and surface the plan
  requirement in the buy flow, so a purchase fails with a reason instead of opaquely.

### 4.7 Capacity — surface it, don't discover it in production

Outbound **CPS** and **concurrency** are two account-wide pools **shared by the Voice API and SIP
Trunking** — capacity bought for one product is capacity for the other. Inbound CPS is separate: **10
inbound calls/second for every account, in every data region**.

| Data region | Plan / lifetime voice + SIP spend | Outbound CPS | Concurrent calls |
| - | - | - | - |
| US | Free tier (before first payment) | 1 | 2 |
| US | Professional — under USD 100 | 1 | 5 |
| US | Professional — USD 100–500 | 2 | 10 |
| US | Professional — over USD 500 | 2 | 25 |
| US | Enterprise | 2 | 50 |
| India | Professional | 2 | 50 |
| India | Enterprise | by contract | by contract |

**Above CPS the Voice API queues; above concurrency it rejects instantly** — concurrency never queues, so
there is no ring and no grace period. **Ringing/connecting calls count toward concurrency** (only completed
calls don't), every PSTN leg counts, and SIP-to-SIP and WhatsApp calls don't. India's **140- and 160-series
numbers draw on a separate per-series allocation**; exceeding it fails the Make a Call API with HTTP `403`
and the error `Series Concurrency Limit Breached for 91160` (or `91140`), while a call dropped at dial time
carries hangup cause `5030`. **If the account is already at its concurrency limit, the Make a Call API
request itself fails with HTTP 403 — no call is created, so there is no call UUID, no hangup callback and
no call-log entry for the attempt.** Plivo emails the account owner at most once per 24 hours per breached
limit, and the limits live in **Organization settings → Account limits**, with minute-level usage
exportable from **Logs → Voice → Export → Export Concurrency Data** (up to 30 days) — so the console should
show the account's limits and usage rather than letting the operator discover them in production.

---

## 5. Data-first: the schema (Protocol 0 requirement)

The full Prisma schema is in `DISCOVERY-ANSWERS.md` §C — **paste it as the first artifact and treat it as
part of this brief.** The invariants it encodes:

- Multi-tenant: `Organization` is the root; every other table carries `organizationId` with a cascading
  FK, and a Prisma middleware/extension enforces the scope on every query.
- Credentials: `PlivoAccount.authIdEncrypted` / `authTokenEncrypted` (AES-256-GCM ciphertext + IV + auth
  tag), never plaintext, never logged.
- Money and time: store timestamps in UTC (`DateTime`), prices as `Decimal`, durations in integer seconds
  as Plivo reports them.
- Provider truth: `Call`, `CallEvent`, `Message`, `Recording`, `Transcription` all keep the Plivo SID/UUID
  as a **unique** column (the idempotency backbone) plus `rawPayload Json` for forensics.
- Policy: `Organization.transcriptionDefaultEnabled`, `PhoneNumber.transcribeEnabled` +
  `transcriptionLanguage`, `Call.transcriptionEnabled` (the **resolved** decision) — §4.4.
- Audit: append-only `AuditLog` (actor, actor type, action, target, IP, user agent, metadata).

Also define, in `CLAUDE.md`, the **JSON payload contracts** for: inbound call webhook, call status
webhook, recording-ready webhook, transcription webhook, inbound SMS webhook, message status webhook,
and the outbound DTOs (`CreateCallRequest`, `SendMessageRequest`, `BuyNumberRequest`,
`UpdateTranscriptionPolicyRequest`) — because Twilio-shaped intuition will produce the wrong shapes.
Because Plivo may add webhook fields without notice, webhook schemas must be **tolerant**
(`.passthrough()` / optional), while **our** API DTOs are strict.

---

## 6. Phases — B.L.A.S.T. adapted to a TypeScript codebase

Protocol 0's file set is kept verbatim: `task_plan.md`, `findings.md`, `progress.md`, and the project
constitution. The protocol names the constitution `claude.md` in one place and `gemini.md` in another —
**use `CLAUDE.md`** consistently as Layer 0 (schema, rules, invariants, maintenance log).

One adaptation, stated explicitly: **Layer 3 "tools" are TypeScript scripts, not Python.** The stack is
TS end to end and mixing languages for ops scripts would double the toolchain for no benefit. The intent
of Layer 3 — atomic, deterministic, individually testable, environment-driven, writing intermediates to
`.tmp/` — is preserved exactly. Run them with `pnpm tool <name>` (tsx). Nothing in `tools/` may contain
business logic that the application also needs; shared logic lives in `src/lib/**` and is imported by both.

### Phase 0 — Initialization (Protocol 0)
Create `.tmp/`, `architecture/`, `tools/`, `CLAUDE.md`, `task_plan.md`, `findings.md`, `progress.md`.
Write the schema and invariants into `CLAUDE.md`. Produce the **Implementation Plan artifact** with the
phase checklist. Then halt for approval — the protocol forbids writing `tools/` before the blueprint is
approved, and that rule applies here.

**Exit criteria:** the four memory files exist; `CLAUDE.md` contains the schema, the invariants of §2, the
Plivo contract of §4 and the maintenance log; the plan is approved by the user.

### Phase 1 — B: Blueprint
Write the SOPs in `architecture/`: `telephony-provider.md`, `webhooks-and-signatures.md`, `calls.md`,
`messaging.md`, `numbers.md`, `recordings-transcription.md`, `auth-and-security.md`, `data-model.md`,
`deployment.md`. Each SOP: goal, inputs, outputs, tool logic, edge cases, and the exact Plivo endpoints
with parameters. Record in `findings.md` that the docs mirror at `D:\Projects\plivo-docs-study\md\` is
the authority and how to read it (`md/<path>.md`).

**Exit criteria:** every P0 capability has an SOP naming its endpoints, its failure modes and its tests.

### Phase 2 — L: Link (do not skip, do not fake)
Build the connectivity tools and prove them before any product code: `verify-plivo-credentials.ts`
(verifies Auth ID/Token against `GET /v1/Account/{auth_id}/`), `list-plivo-numbers.ts`,
`send-test-sms.ts`, `place-test-call.ts`, `replay-webhook.ts` (signs a payload with the real algorithm and
posts it at the local webhook route). **If real credentials are unavailable, the Link phase is satisfied
by the SimulatorProvider end to end** — a real signature, a real HTTP round trip, a real database write —
and that must be stated plainly in `progress.md` rather than implying live Plivo was exercised. Trial
accounts can only reach **verified/sandbox** numbers; that is expected, not a bug.

**Exit criteria:** `progress.md` shows real command output for each tool; the handshake works or the
simulator substitute is documented as such.

### Phase 3 — A: Architect (the build)
Build in this order, each item gated by tests: Prisma schema + migrations + seed → auth (console +
token API) → organization/credential management with encryption → provider interface + simulator →
numbers → calls (place, list, detail, live control) → webhooks (all of them, with signature validation and
idempotency) → recordings (list, proxy-play, download, delete) → transcription (policy resolution, toggle,
view, search, on-demand transcribe) → messages (send, threads, inbound) → audit + settings → usage
dashboard. The console is built against the API as its only data source.

**Exit criteria:** `pnpm test` and `pnpm e2e` green; a signed webhook replay drives a call from
`queued` to `completed` with a recording and a transcript visible in the console; a cross-tenant access
test fails safely.

### Phase 4 — S: Stylize
shadcn/ui polish on the operations surfaces: the call timeline, the inline recording player, the
transcript view with search highlighting, the message thread, the number cards with their toggles, empty
and error states, loading skeletons, keyboard-accessible tables, and a dark operations theme. Produce a
**Walkthrough artifact**: screenshots or the app running with real data. Get user feedback before
deploying.

**Exit criteria:** the user has seen the working console with real (or simulated, and labelled as such) data.

### Phase 5 — T: Trigger (deployment)
Dockerfile + compose for local, environment-driven configuration, migrations run on deploy, health and
readiness endpoints, structured logging with request IDs, a backup/restore note for Postgres, the
`PUBLIC_BASE_URL` wired into every webhook registration, cron/worker for retention pruning and backlog
sync, and the maintenance log finalised in `CLAUDE.md`. **A project is complete when the payload is in
its final destination** — which here means: the deployed app, on the deployed database, with the console
demonstrably working, and the OpenAPI document published.

**Exit criteria:** a live URL, migrations applied, a seeded organization, and the acceptance checklist in
`DISCOVERY-ANSWERS.md` §H all passing.

---

## 7. Security requirements (each needs a test)

1. Plivo credentials AES-256-GCM encrypted at rest; KEK from env; rotate-by-re-encrypt documented.
2. Webhook signature validation mandatory, constant-time comparison, 403 on failure, raw body preserved,
   rejected payloads retained for forensics.
3. Idempotent webhook processing with a DB unique constraint — a replayed payload must change nothing.
4. RBAC: `owner` > `admin` > `operator` > `viewer`, enforced **server-side per route**, with a test that a
   viewer cannot mutate.
5. Tenant isolation on every query; a test asserting one org cannot read another's call/recording/message.
6. Rate limiting on `/api/v1/auth/**` (brute force), on public webhook routes (flood), and awareness of
   Plivo's 300 req/5 s outbound limit (a token-bucket around the provider client).
7. Passwords: Argon2id (or bcrypt cost ≥ 12), min length 12, breach-list check optional, no plaintext ever.
8. TOTP MFA support with recovery codes; MFA state visible to the org owner.
9. Recordings and transcripts served only through short-lived signed URLs minted by the app; raw Plivo
   media URLs never leave the server; consider enabling Plivo-side Basic Auth on media as defence in depth.
10. `log: false`-style redaction offered for outbound messages **with an irreversible-action warning**.
11. Security headers (HSTS, CSP, `X-Content-Type-Options`, frame-ancestors), CSRF protection on cookie-auth
    mutations, and strict CORS (the API is bearer-token based, so CORS can be narrow).
12. Secrets: `.env*` git-ignored, `.env.example` documents every variable with no values, a
    `check-secrets.ts` tool runs in CI, and no secret ever reaches client bundles or logs.
13. Audit every privileged action with actor, action, target, IP and result.
14. **Consent to record is a product requirement, not a footnote**: the console must support playing a
    recording notice (or a jurisdiction check) before recording begins, and must let the operator mark
    whether consent was obtained. For India, surface the regulatory constraints (media anchoring; 140 =
    promotional only, landline = service/transactional only, 160 = BFSI only; consent windows of 30
    minutes for transactional and 7 days for service calls) where they affect what can be dialled.

---

## 8. Standing rules for the agent

1. **Never invent a Plivo endpoint, parameter, callback field or limit.** Read
   `D:\Projects\plivo-docs-study\md\<page>.md` first; if the mirror does not answer it, say so and ask.
2. **Never hand-roll signature validation** and never disable it — including in tests.
3. **Never write Twilio concepts** into this codebase: no TwiML, no `PageSize`, no
   `X-Twilio-Signature`, no nested error objects, no API-key pair.
4. **Never assume a message was delivered** because the send call returned 200.
5. **Never let a Plivo credential, secret, or full Auth ID into the client, the logs, or git.**
6. **Update the SOP before the code** when logic changes ("if logic changes, update the SOP first").
7. **Self-healing loop:** on any failure — read the stack trace, patch the tool, re-run, then write the
   learning into the matching `architecture/*.md` so the same error cannot recur.
8. **Evidence, always.** Every completion claim carries the command that produced it and its real output.
   A phase is not done because it "should" work.
9. **Ask, don't guess** on: deployment host, whether recording consent must be enforced, whether
   Plivo-side media Basic Auth should be enabled, target countries (this changes number eligibility and
   compliance), whether WhatsApp/Verify/10DLC are in scope, and any real credential values.
10. **Never ask for secrets in chat.** Instruct the user to place them in `.env` (git-ignored) and verify
    by presence/shape only.

---

## 9. Definition of done

- [ ] `pnpm install && pnpm db:migrate && pnpm db:seed && pnpm dev` brings the console up from a clean clone.
- [ ] `pnpm test` (unit + integration) and `pnpm e2e` (Playwright) pass, with the security tests of §7 included.
- [ ] A signed, replayed webhook chain moves a call through its real statuses and produces a recording + transcript.
- [ ] The console can place a call, read the timeline, play the recording, toggle transcription off and on, read a transcript, send and receive SMS in a threaded view, buy/list a number, and show cost per call.
- [ ] The same API works with a bearer token only — demonstrated by a script or a Playwright test that never uses a cookie.
- [ ] `/api/v1/openapi.json` is generated, accurate, and rendered at `/docs`.
- [ ] No secret in the repository; `check-secrets` clean; `.env.example` complete.
- [ ] `CLAUDE.md` contains the final schema, the invariants, the resolved dependency versions and the maintenance log.
- [ ] `progress.md` records what was verified against real Plivo and what was verified against the simulator — with no ambiguity between the two.
