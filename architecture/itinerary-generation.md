# Itinerary generation and delivery

An itinerary is saved only after a real AI completion passes validation. Provider failures,
empty or truncated responses, unreadable days, missing/duplicate days, inconsistent duration,
and sparse daily programmes return an error. They never create a blank successful lead or
overwrite the previous itinerary. Configured AI providers can supply a secondary completion;
there is no sample itinerary fallback.

`src/lib/itinerary-content.ts` is browser-safe and provides the shared day parser, trip input
checks, and delivery validation. The dashboard and proposal PDF consume those same days.
The PDF renders supplied content and configured branding, paginating long sections instead
of clipping them. Missing meals, transfers, accommodation, inclusions, agency contacts, or
registration details are not replaced by example values.

The lead drawer's **Save Parameters & Generate Itinerary** action sends
`regenerateItinerary: true` to `PATCH /api/v1/leads/[id]`. Generation completes before the
parameters and programme are saved together. A parameter-only update marks the old itinerary
as requiring regeneration. Downloads and dispatch return 422 for incomplete or stale content.
AI updates also check `updatedAt` to avoid overwriting a concurrent edit; conflicts return 409.

The application must have its existing Prisma migrations applied. In production,
organizations must configure their own supported AI integration in Settings. A platform
environment key used by a development smoke test does not configure a production tenant.

## Repeatable checks

```powershell
pnpm test:itinerary
pnpm exec tsc --noEmit --incremental false
pnpm build
```

`test:itinerary` requires local PostgreSQL. It creates a disposable schema, applies the
repository migrations, runs the itinerary and related security regressions, then removes
the schema. It clears provider and email environment keys for deterministic tests and does
not modify the application's business records.

The live provider check is explicitly opt-in. It uses synthetic Malaysia/Singapore travel
parameters, creates no lead, sends no emails, and writes its Markdown/PDF artifacts to a
temporary directory:

```powershell
$env:ITINERARY_LIVE_AI = '1'
node -r dotenv/config node_modules/vitest/vitest.mjs run tests/itinerary-live.test.ts --reporter verbose
Remove-Item Env:ITINERARY_LIVE_AI
```
