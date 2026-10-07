# Findings & Environmental Research

## 1. Documentation Authority & Research Rules
- **Local Documentation Mirror:**
  The complete official Plivo documentation is mirrored locally at `D:\Projects\plivo-docs-study\md\`.
- **Authoritative Reference:**
  Never guess or invent any Plivo endpoint, parameter, webhook header, or payload field. Consult the local Markdown files:
  `D:\Projects\plivo-docs-study\md\<page>.md`.
- **Key Reference Index:**
  - `D:\Projects\plivo-docs-study\PLIVO-STUDY-GUIDE.md`: Comprehensive study notes on Plivo services.
  - `D:\Projects\plivo-docs-study\INDEX.md`: Sitemap and navigation of mirrored documentation.
  - `D:\Projects\plivo-docs-study\api-surface.json` / `tsv`: Complete inventory of all known Plivo endpoints.

---

## 2. Environment & System Discovery
- **Operating System:** Windows (powershell shell)
- **Node.js:** `v26.2.0`
- **pnpm:** `12.5.1`
- **Local Database:** PostgreSQL 18 service (`postgresql-x64-18`) is active and listening on `localhost:5432`.
- **Docker:** Docker 29.2.1 installed.
- **Git:** `2.53.0.windows.1`

---

## 3. Plivo Specifics & Gotchas
1. **Signature Validation:**
   - Always use the official Node SDK (`plivo.validateV3Signature`).
   - Signature V2 is completely deprecated; only V3 (`X-Plivo-Signature-V3`) is accepted.
   - Headers can contain comma-separated multiple tokens; matching any active token is valid.
   - Nonce header `X-Plivo-Signature-V3-Nonce` is appended to the concatenated string.
2. **Plivo XML vs TwiML:**
   - Plivo strictly requires valid Plivo XML (`text/xml` or `application/xml`).
   - Any malformed XML returns hangup cause `8011` (`Invalid Answer XML`) and trips the Voice Alert threshold (>5% failure rate).
3. **Transcription Policy:**
   - Plivo lacks an account-level transcription toggle.
   - Transcriptions default to `auto` unless explicitly suppressed at record time.
   - Suppressing transcription requires explicit parameters, not mere omission.
4. **Recording Security:**
   - Raw Plivo recording URLs are publicly accessible and cannot accept standard authorization headers from `<audio>` HTML elements.
   - Media playback must be proxied through the application using short-lived signed HMAC URLs.
5. **Capacity and Concurrency Limits:**
   - Inbound calls have a 10 calls/second limit per account.
   - Outbound concurrency limits reject requests with HTTP 403 at creation time, generating no Call UUID or callback.
   - Account limits must be visibly reported in the console.
6. **SMS Encoding & Pricing:**
   - GSM-7 allows 160 characters per single message (153 for concatenated).
   - UCS-2 allows only 70 characters per single message (67 for concatenated).
   - A single non-GSM character drops the entire message into UCS-2, doubling or tripling billing units.
