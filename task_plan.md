# Task Plan: Plivo Communications Platform

## Project Overview
A production-grade, multi-tenant web console and versioned REST API (`/api/v1`) for voice, messaging, numbers, recordings, and transcripts powered by Plivo, featuring offline simulator mode with authentic V3 signature signing.

---

## Phase Checklist

### Phase 0: Initialization (Protocol 0)
- [x] Create project memory directories (`.tmp/`, `architecture/`, `tools/`)
- [x] Establish Layer 0 constitution (`CLAUDE.md`) with schema, invariants, contracts, and runbooks
- [x] Create core Protocol 0 tracking files (`task_plan.md`, `findings.md`, `progress.md`)
- [x] Produce Implementation Plan artifact and obtain user approval before starting Phase 1

### Phase 1: Blueprint (B.L.A.S.T. Architecture SOPs)
- [x] `architecture/telephony-provider.md`: Provider boundary abstraction (`TelephonyProvider`, `PlivoProvider`, `SimulatorProvider`)
- [x] `architecture/webhooks-and-signatures.md`: Signature V3 algorithm, SDK usage, deduplication, idempotency
- [x] `architecture/calls.md`: Outbound call dispatch, Plivo XML generation, live call controls, billing rules
- [x] `architecture/messaging.md`: SMS/MMS outbound & inbound, thread aggregation, unit calculation (GSM-7/UCS-2)
- [x] `architecture/numbers.md`: Inventory search, purchasing, application binding, country eligibility
- [x] `architecture/recordings-transcription.md`: Storage costs, proxying signed media URLs, transcription policy cascade
- [x] `architecture/auth-and-security.md`: Console session cookies vs mobile Bearer tokens, AES-256-GCM credential encryption, RBAC, tenant isolation
- [x] `architecture/data-model.md`: Prisma schema invariants, indexing strategy, audit logging
- [x] `architecture/deployment.md`: Containerization, env vars, health/ready probes, maintenance log

### Phase 2: Link (Connectivity Verification)
- [x] Implement `tools/verify-plivo-credentials.ts`: Validate credentials against `GET /v1/Account/{auth_id}/` (or simulator)
- [x] Implement `tools/list-plivo-numbers.ts`: Test inventory query against API
- [x] Implement `tools/send-test-sms.ts`: Test message dispatch
- [x] Implement `tools/place-test-call.ts`: Test call placement
- [x] Implement `tools/replay-webhook.ts`: Generate authentic V3 signed payload and post to local webhook endpoint
- [x] Execute each tool, capture real CLI outputs, and record proof in `progress.md`

### Phase 3: Architect (Core Implementation)
- [x] Next.js project bootstrap with TypeScript strict mode, Tailwind CSS, shadcn/ui
- [x] Prisma setup, schema creation, PostgreSQL migrations, seeding (`admin`, demo organization)
- [x] Security utilities: AES-256-GCM encryption/decryption, TOTP MFA, JWT + refresh token family rotation
- [x] Provider boundary: `TelephonyProvider` interface, `SimulatorProvider` with authentic signature generation, `PlivoProvider`
- [x] Authentication API (`/api/v1/auth/**`) with Bearer token authentication
- [x] Telephony endpoints (`/api/v1/numbers/**`, `/api/v1/calls/**`, `/api/v1/messages/**`)
- [x] Signature-verified webhook endpoints (`/api/v1/webhooks/**`) with idempotency and audit trail
- [x] Recordings & proxy playback (`/api/v1/recordings/**`) with short-lived signed URLs
- [x] Transcription policy engine, inline retrieval, and on-demand trigger (`/api/v1/transcriptions/**`)
- [x] OpenAPI 3.1 generation (`/api/v1/openapi.json`) and Swagger/Scalar UI rendering at `/docs`
- [x] Unit & integration test suites (Vitest): tenant isolation, RBAC, signature verification, webhook deduplication

### Phase 4: Stylize (Operations Console UI)
- [x] Dark operations theme, navigation, connection status badge (`Simulator` vs `Live`)
- [x] Dashboard & Overview: usage metrics, recent activity, capacity alerts
- [x] Calls View: filterable call history, call detail modal/drawer, live call controls, timeline, inline audio player
- [x] Messages View: two-way threaded conversation layout, E.164 counterpart selector, character count/unit cost estimator
- [x] Numbers View: search inventory by ISO/prefix, buy modal, per-number configuration toggles
- [x] Recordings & Transcripts View: audio waveform/player, search with keyword highlights, on-demand transcription
- [x] Settings View: Plivo credentials management, transcription defaults, retention policy, API keys, team roles
- [x] Playwright / Browser subagent UI interactive verification

### Phase 5: Trigger (Packaging & Production Readiness)
- [x] Dockerfile and `docker-compose.yml` for containerized application and PostgreSQL
- [x] Health and readiness probes (`/api/v1/health`, `/api/v1/ready`)
- [x] Security scan and secret verification (`tools/check-secrets.ts`)
- [x] Final end-to-end verification and acceptance checklist validation
- [x] Finalize maintenance log in `CLAUDE.md` and walkthrough artifact
