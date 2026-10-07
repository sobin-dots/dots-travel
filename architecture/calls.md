# Architecture SOP: Voice Calls & Live Control

## 1. Goal
Provide robust call placement, dynamic Plivo XML responses for inbound and outbound calls, real-time in-call controls (hangup, DTMF, audio playback, speech, recording), status timeline tracking from real callbacks, and accurate billing reconciliation.

---

## 2. Call Placement & Modes

### 2.1 Outbound Call DTO (`CreateCallRequest`)
Strict Zod schema under `/api/v1/calls`:
```typescript
export const CreateCallRequestSchema = z.object({
  phoneNumberId: z.string().uuid(),
  to: z.string().regex(/^\+[1-9]\d{1,14}$/, "Must be valid E.164"),
  mode: z.enum(['xml', 'forward', 'url', 'voicemail']),
  xml: z.string().optional(),
  forwardTo: z.string().optional(),
  url: z.string().url().optional(),
  record: z.boolean().default(false),
  transcribe: z.boolean().default(false),
  transcriptionLanguage: z.string().default('en-US'),
  machineDetection: z.boolean().default(false),
  timeLimit: z.number().int().min(1).max(14400).default(14400),
});
```

### 2.2 Modes of Execution
1. **`xml` (Inline Dynamic Plivo XML):**
   Calls `/api/v1/webhooks/voice/answer?actionId=...` which renders safe, pre-validated Plivo XML.
2. **`forward` (Call Forwarding):**
   Generates Plivo XML containing `<Response><Dial><Number>{forwardTo}</Number></Dial></Response>`.
3. **`url` (External XML Fetch):**
   Passes external URL directly as `answer_url`.
4. **`voicemail`:**
   Generates XML: `<Response><Speak>Please leave a message after the tone.</Speak><Record maxLength="120" action="/api/v1/webhooks/voice/record" /></Response>`.

---

## 3. Plivo XML Builder (Hardened, Tested)

To avoid syntax errors and hangup cause `8011` (`Invalid Answer XML`), XML generation is encapsulated in `src/lib/telephony/xml/builder.ts`:
- Emits XML with header `<?xml version="1.0" encoding="UTF-8"?>`.
- Root tag is `<Response>`.
- Properly encodes text nodes and attributes.
- Supported tags: `Speak`, `Play`, `DTMF`, `GetDigits`, `GetInput`, `Dial`, `Number`, `Redirect`, `Hangup`, `Wait`, `Conference`, `MultiPartyCall`, `Record`, `PreAnswer`.

---

## 4. Live Call Control Endpoints

All active calls can be manipulated using Plivo Call UUID:
| Action | Route | Target Plivo Endpoint | Payload |
|---|---|---|---|
| Hangup | `DELETE /api/v1/calls/:id/live` | `DELETE /v1/Account/{auth}/Call/{call_uuid}/` | None |
| Send DTMF | `POST /api/v1/calls/:id/live/dtmf` | `POST /v1/Account/{auth}/Call/{call_uuid}/DTMF/` | `{ digits: string, leg?: 'aleg'\|'bleg' }` |
| Speak Text | `POST /api/v1/calls/:id/live/speak` | `POST /v1/Account/{auth}/Call/{call_uuid}/Speak/` | `{ text: string, voice?: string }` |
| Play Audio | `POST /api/v1/calls/:id/live/play` | `POST /v1/Account/{auth}/Call/{call_uuid}/Play/` | `{ urls: string[] }` |
| Start Record | `POST /api/v1/calls/:id/live/record` | `POST /v1/Account/{auth}/Call/{call_uuid}/Record/` | `{ time_limit?: number, file_format: 'mp3', transcription_type?: string }` |
| Stop Record | `DELETE /api/v1/calls/:id/live/record` | `DELETE /v1/Account/{auth}/Call/{call_uuid}/Record/` | `{ URL?: string }` |

---

## 5. Billing & State Reconciliation

1. **Answered vs Ringing:**
   - Billing duration starts **strictly when the call is answered** (`answeredAt`), not when ringing starts.
   - Durations reported by Plivo callbacks:
     - `Duration`: Total call connection duration in seconds.
     - `BillDuration`: Billed duration in seconds according to billing increments.
2. **Increments:**
   - US: 60/60 rounding (e.g., 5 seconds answered = 60 seconds billed).
   - India: 30/30 rounding.
   - App stores both `durationSeconds` and `billDurationSeconds` exactly as reported by Plivo.
3. **Hangup Causes:**
   - Translated into plain-language explanations:
     - `4000`–`4099`: Normal hangup (completed by caller/callee).
     - `1000`–`1099`: Insufficient credits or account issues.
     - `2000`–`2099`: Invalid destination number or unallocated range.
     - `3000`–`3099`: Callee rejected / line busy.
     - `5030`: Concurrency limit reached.
     - `8011`: Invalid Answer XML returned by server.

---

## 6. Testing Strategy
- Unit test for XML builder generating nested `<Dial><Number>` and `<Record>` structures.
- Unit test validating that invalid XML tags throw compile-time/runtime errors.
- Integration test for outbound call lifecycle:
  - `POST /api/v1/calls` creates `Call` in `queued` status.
  - Replayed `ringing` webhook updates status to `ringing`.
  - Replayed `in-progress` webhook updates `answeredAt`.
  - Replayed `completed` webhook sets `endedAt`, `durationSeconds`, and `billDurationSeconds`.
