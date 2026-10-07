# Architecture SOP: Recordings & Transcriptions

## 1. Goal
Provide secure audio recording storage, streaming playback via signed proxy URLs (ensuring raw Plivo URLs are never exposed to clients), granular transcription policy resolution, inline transcript rendering, and on-demand transcription.

---

## 2. Recording Security & Proxy Streaming

### 2.1 The Vulnerability
- Raw Plivo recording URLs (`https://media.plivo.com/...`) are publicly accessible by default.
- Standard HTML5 `<audio>` tags cannot supply custom authorization headers (e.g. `Authorization: Basic ...`).
- Handing raw Plivo URLs to the client creates an insecure direct object reference and leaks vendor storage URLs.

### 2.2 Short-Lived Signed Proxy Streaming
1. When the console or mobile API requests playback metadata for a recording, the server issues a short-lived signed URL:
   `/api/v1/recordings/{id}/stream?expires={timestamp}&signature={hmac}`
2. **Signature Generation:**
   `signature = HMAC_SHA256("${id}:${expires}", MEDIA_URL_SECRET).hex`
3. **TTL:** 300 seconds (5 minutes).
4. **Proxy Route Execution:**
   - Validates timestamp (`expires > now()`) and HMAC in constant time.
   - Enforces user session / API bearer token organization permissions.
   - Streams audio bytes from Plivo server-side with `Content-Type: audio/mpeg` or `audio/wav`.
   - Supports HTTP `Range` requests for seekable audio playback.

---

## 3. Storage Cost Visibility

Plivo bills recording storage monthly based on 60-second rounded increments:
- `recording_storage_rate`: Unit cost per minute per month (e.g., $0.0004).
- `recording_storage_duration`: Days stored (incremented every 24 hours).
- `monthly_recording_storage_amount`: Accumulated monthly charge.
- Console displays storage cost on each recording card and provides retention cleanup.

---

## 4. Transcription Policy Engine

### 4.1 Resolution Cascade
Because Plivo lacks an account-level transcription toggle, the decision is resolved at record time:
```
Organization Default (transcriptionDefaultEnabled)
        ↓ (overridden by)
PhoneNumber Setting (transcribeEnabled, transcriptionLanguage)
        ↓ (overridden by)
Call Explicit Override (CreateCallRequest.transcribe)
```

### 4.2 Explicit Suppression Requirement
- **Critical Plivo Invariant:** Plivo's default transcription behavior is `auto`. If transcription parameters are omitted, Plivo **will generate** a billable transcript.
- To disable transcription, the provider **must explicitly pass suppression parameters** or omit the recording transcription block entirely according to Plivo API specifications.
- The resolved decision is saved on the `Call` record (`transcriptionEnabled: true|false`). When disabled, the console clearly displays: *"Transcription was disabled by organization policy"*.

---

## 5. On-Demand Transcription

For calls recorded with transcription disabled, operators can trigger transcription later:
- Console click -> `POST /api/v1/recordings/:id/transcribe`.
- Server calls Plivo `POST /v1/Account/{auth}/Transcription/{recording_id}/`.
- Plivo delivers transcript via webhook callback, updating the `Transcription` table.

---

## 6. Testing Strategy
- Unit test verifying signed media URL generation and verification (valid vs expired vs tampered signature).
- Unit test for transcription policy resolution cascade.
- Integration test for recording proxy route verifying streaming headers and range support.
