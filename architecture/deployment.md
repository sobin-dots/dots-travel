# Architecture SOP: Packaging, Deployment & Operations

## 1. Goal
Provide reproducible, containerized deployment across local development and production environments, maintain strict dev/prod database parity with PostgreSQL, enforce zero-secret environment variable safety, and establish health/readiness observability.

---

## 2. Containerization Strategy

### 2.1 Multi-Stage Dockerfile
- **Base:** `node:22-alpine` or `node:20-alpine`.
- **Builder Stage:**
  - Installs dependencies via `pnpm install --frozen-lockfile`.
  - Generates Prisma client (`prisma generate`).
  - Builds Next.js production bundle with standalone output (`output: 'standalone'`).
- **Runner Stage:**
  - Non-root user (`nodejs:nextjs`).
  - Copies standalone server, public assets, and static files.
  - Exposes port 3000.

### 2.2 Docker Compose (`docker-compose.yml`)
- Orchestrates:
  1. `postgres`: PostgreSQL 16/18 with healthcheck (`pg_isready -U postgres`).
  2. `app`: Next.js application container depending on `postgres` health.

---

## 3. Environment Variables & Boot Validation

All configuration is strictly validated at application startup using a Zod schema (`src/lib/config.ts`). If any required variable is missing or malformed, the process halts immediately with an explanatory error.

### 3.1 Strict Boot Requirements
- In `TELEPHONY_MODE=live`:
  - `PLIVO_AUTH_ID` and `PLIVO_AUTH_TOKEN` are mandatory.
  - `PUBLIC_BASE_URL` must be a valid public HTTPS origin.
- In `TELEPHONY_MODE=simulator`:
  - `PLIVO_AUTH_ID` and `PLIVO_AUTH_TOKEN` are optional.
  - `PUBLIC_BASE_URL` defaults to `http://localhost:3000`.

---

## 4. Observability & Health Probes

1. **Liveness Probe (`/api/v1/health`):**
   - Returns HTTP 200 `{ status: "ok", timestamp: "..." }`.
   - Verifies the Node.js process is responsive.
2. **Readiness Probe (`/api/v1/ready`):**
   - Checks:
     - PostgreSQL database query execution (`SELECT 1`).
     - Provider status (`simulator` ready or `live` credential verification).
   - Returns HTTP 200 `{ ready: true, db: "connected", provider: "ready" }` or HTTP 503 if unhealthy.

---

## 5. Database Migration Policy

- **Development:** `prisma migrate dev` generates versioned SQL migrations in `prisma/migrations/`.
- **Production / CI:** `prisma migrate deploy` executes pending migrations. Running `prisma db push` in production is strictly forbidden.
- **Backups:** Standard PostgreSQL dump (`pg_dump -Fc`) before running production migrations.

---

## 6. Retention and Maintenance Runbooks

1. **Retention Pruning Job:**
   - Evaluates `Organization.recordingRetentionDays`.
   - Identifies recordings older than retention window:
     - Deletes media file via Plivo API `DELETE /Recording/{id}/`.
     - Updates local row `status = 'deleted'`, `deletedAt = now()`.
2. **Secret Verification:**
   - Automated CI tool `tools/check-secrets.ts` asserts that `.env` files are never tracked in Git and `.env.example` contains only variable names without real values.
