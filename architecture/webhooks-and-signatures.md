# Architecture SOP: Webhooks and Signature Validation

## 1. Goal
Ensure zero unauthenticated payloads are processed, guarantee idempotent webhook execution across repeated delivery attempts, protect against replay attacks, and prevent 500 error cascades that cause carrier webhook retries.

---

## 2. Inbound Request Verification Protocol (Plivo V3)

### 2.1 The Signature Algorithm
1. Obtain the **exact public URL** called by Plivo (scheme, host, port, path, and query string), matching `PUBLIC_BASE_URL`.
2. For `POST` requests, sort all parameter names **alphabetically and case-sensitively**. Concatenate parameter names and values:
   `assembled = url + (paramName1 + paramValue1) + (paramName2 + paramValue2) + ...`
3. Append the nonce extracted from the `X-Plivo-Signature-V3-Nonce` header:
   `assembledWithNonce = assembled + nonce`
4. Compute `Base64(HMAC_SHA256(assembledWithNonce, authToken))`.
5. Compare in constant time against `X-Plivo-Signature-V3` or `X-Plivo-Signature-Ma-V3`.

### 2.2 SDK Implementation
Hand-rolling signature validation is strictly prohibited. The verification helper (`src/lib/telephony/webhook-validator.ts`) delegates to the official SDK:
```typescript
import plivo from 'plivo';

export function verifyWebhookSignature({
  method,
  url,
  nonce,
  authToken,
  signatureHeader,
  params,
}: VerifyWebhookParams): boolean {
  if (!nonce || !signatureHeader) return false;
  
  // Plivo may send comma-separated signatures for rotated tokens
  const signatures = signatureHeader.split(',').map(s => s.trim());
  
  return signatures.some(sig => 
    plivo.validateV3Signature(method, url, nonce, authToken, sig, params)
  );
}
```

---

## 3. Idempotency & Lifecycle Architecture

### 3.1 Idempotency Key Derivation
Every webhook maps to a deduplication key based on its payload:
- **Voice Status / Ring / Hangup:** `CallUUID` + `CallStatus`
- **Voice Answer (XML Fetch):** `CallUUID` + `answer`
- **SMS Status:** `MessageUUID` + `Status`
- **SMS Inbound:** `MessageUUID`
- **Recording Ready:** `RecordingID`
- **Transcription Ready:** `RecordingID` + `TranscriptionID`

### 3.2 Processing Flow (`WebhookEvent` Table)
1. **Raw Storage & Unique Check:**
   Insert row into `WebhookEvent` with:
   - `provider`: `"plivo"`
   - `dedupeKey`: Computed key
   - `kind`: `"voice" | "message" | "recording" | "transcription"`
   - `signatureValid`: boolean
   - `rawBody`, `headers`, `sourceIp`
2. **Duplicate Detection:**
   If unique constraint `@@unique([provider, dedupeKey, kind])` is violated:
   - Return HTTP `200 OK` immediately with status `"already_processed"`.
   - Never throw HTTP 500.
3. **Signature Rejection:**
   If signature validation fails:
   - Mark `status = "rejected"` in `WebhookEvent`.
   - Return HTTP `403 Forbidden`.
   - Halt execution.
4. **Execution & State Transition:**
   - On valid novel payload, update target entity (`Call`, `Message`, `Recording`) inside a database transaction.
   - Record transition event in `CallEvent`.
   - Mark `WebhookEvent.status = "processed"`.
   - Return HTTP `200 OK`.

---

## 4. Tolerant Payload Parsing

Plivo may introduce new parameters without version bumps. Webhook schemas use Zod `.passthrough()`:

```typescript
export const PlivoVoiceWebhookSchema = z.object({
  CallUUID: z.string(),
  From: z.string(),
  To: z.string(),
  CallStatus: z.enum(['ringing', 'in-progress', 'completed', 'busy', 'no-answer', 'failed', 'timeout', 'canceled']).optional(),
  Direction: z.enum(['inbound', 'outbound']).optional(),
  Duration: z.coerce.number().optional(),
  BillDuration: z.coerce.number().optional(),
  TotalCost: z.coerce.string().optional(),
  HangupCause: z.coerce.number().optional(),
}).passthrough();
```

---

## 5. Edge Cases & Failure Modes

1. **Reverse Proxy & Host Mismatch:**
   - Running behind Cloudflare, Nginx, or Docker might rewrite `http` to `https` or change port.
   - The validation routine reconstructs the signature using `PUBLIC_BASE_URL` rather than the incoming host header if configured.
2. **Slow Webhook Handlers:**
   - Plivo read timeout default is 40 seconds; connect timeout is 2 seconds.
   - Handlers persist payload and respond in < 1,000ms. Heavy processing runs asynchronously.
3. **Inbound SMS HTTP 500 Failure:**
   - Returning 500 on inbound SMS causes Plivo to retry and ultimately mark the SMS as undelivered (`2xxx` error code).
   - Inbound SMS handler always returns 200 after storing raw body.

---

## 6. Testing Strategy
- Unit test for `verifyWebhookSignature` with:
  - Valid signature (passes)
  - Tampered URL (fails 403)
  - Tampered POST parameter (fails 403)
  - Tampered nonce (fails 403)
  - Comma-separated multi-token header (passes if one matches)
- Integration test replaying identical signed webhook payload twice:
  - First execution returns 200 and inserts records.
  - Second execution returns 200 and ignores mutation.
