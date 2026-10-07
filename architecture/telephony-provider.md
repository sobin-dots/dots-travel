# Architecture SOP: Telephony Provider Boundary

## 1. Goal
Provide a strict, swappable architectural boundary isolating all Plivo SDK dependencies and vendor-specific payload structures from the application business layer. Support offline development, testing, and deterministic demos via `SimulatorProvider` with zero credentials, and production traffic via `PlivoProvider` through environment variable configuration (`TELEPHONY_MODE=simulator|live`).

---

## 2. Interface Contract (`TelephonyProvider`)

The boundary exposes the following contract defined in `src/lib/telephony/types.ts`:

```typescript
export interface TelephonyProvider {
  // Account
  verifyCredentials(authId: string, authToken: string): Promise<AccountVerificationResult>;

  // Numbers
  searchNumbers(params: SearchNumbersParams): Promise<AvailableNumberDTO[]>;
  buyNumber(params: BuyNumberParams): Promise<PurchasedNumberDTO>;
  listOwnedNumbers(params: ListOwnedNumbersParams): Promise<OwnedNumberDTO[]>;
  updateNumber(number: string, params: UpdateNumberParams): Promise<void>;
  releaseNumber(number: string): Promise<void>;

  // Voice
  createCall(params: CreateCallParams): Promise<CallResultDTO>;
  getCall(callUuid: string): Promise<CallDetailDTO>;
  hangupCall(callUuid: string): Promise<void>;
  sendDigits(callUuid: string, digits: string, leg?: 'aleg' | 'bleg'): Promise<void>;
  playAudio(callUuid: string, url: string): Promise<void>;
  speakText(callUuid: string, text: string, options?: SpeakOptions): Promise<void>;
  startCallRecording(callUuid: string, options?: CallRecordOptions): Promise<RecordResultDTO>;
  stopCallRecording(callUuid: string, recordUrl?: string): Promise<void>;

  // Messaging
  sendMessage(params: SendMessageParams): Promise<MessageResultDTO>;
  getMessage(messageUuid: string): Promise<MessageDetailDTO>;
  uploadMedia(files: MediaUploadInput[]): Promise<string[]>; // Returns media_ids

  // Recordings & Transcriptions
  listRecordings(params: ListRecordingsParams): Promise<RecordingDTO[]>;
  deleteRecording(recordingId: string): Promise<void>;
  createTranscription(recordingId: string, options?: TranscriptionOptions): Promise<TranscriptionResultDTO>;
  deleteTranscription(transcriptionId: string): Promise<void>;
}
```

---

## 3. Implementations

### 3.1 `PlivoProvider` (Live)
- **SDK Import:** Restricted strictly to `src/lib/telephony/plivo/client.ts`.
- **Initialization:** Instantiated per-request or per-tenant using decrypted credentials:
  ```typescript
  const client = new plivo.Client(authId, authToken);
  ```
- **Rate Limiting:** Enforces client-side token bucket limiting outbound requests to 300 requests / 5 seconds (60 req/sec) to avoid HTTP 429.
- **Paging:** Helper `paginateOffset(fn, maxLimit = 20)` loops through offset pages with exponential backoff and jitter.

### 3.2 `SimulatorProvider` (Offline)
- **Active when:** `TELEPHONY_MODE=simulator`.
- **Zero Credentials:** Operates without `PLIVO_AUTH_ID` or `PLIVO_AUTH_TOKEN`.
- **Deterministic Identity:** Generates UUIDs matching Plivo formats (`c1a2...` for calls, `m1b2...` for messages).
- **Authentic Signature Signing:** When emitting simulated webhooks to the local application (`/api/v1/webhooks/**`), generates valid `X-Plivo-Signature-V3` HMAC-SHA256 headers using the configured local webhook secret.
- **Synthetic Media:** Generates valid, playable WAV/MP3 synthetic audio buffers for recordings.
- **Scenario Driver:** Supports scenario testing via `/api/v1/dev/simulator/**` routes.

---

## 4. Exact Plivo Endpoints & Parameters

| Operation | Plivo Endpoint | HTTP Method | Required Parameters | Optional Parameters |
|---|---|---|---|---|
| Verify Account | `/v1/Account/{auth_id}/` | GET | None | None |
| Search Numbers | `/v1/Account/{auth_id}/PhoneNumber/` | GET | `country_iso` | `prefix`, `region`, `city`, `rate_center`, `limit` (max 20), `offset` |
| Buy Number | `/v1/Account/{auth_id}/PhoneNumber/{number}/` | POST | None | `app_id`, `cnam`, `compliance_application_id` |
| Owned Numbers | `/v1/Account/{auth_id}/Number/` | GET | None | `limit`, `offset` |
| Update Number | `/v1/Account/{auth_id}/Number/{number}/` | POST | None | `app_id`, `alias` |
| Make Call | `/v1/Account/{auth_id}/Call/` | POST | `from`, `to`, `answer_url` | `ring_url`, `hangup_url`, `fallback_url`, `time_limit`, `machine_detection`, `sip_headers` |
| Hangup Call | `/v1/Account/{auth_id}/Call/{call_uuid}/` | DELETE | None | None |
| Live DTMF | `/v1/Account/{auth_id}/Call/{call_uuid}/DTMF/` | POST | `digits` | `leg` |
| Live Record | `/v1/Account/{auth_id}/Call/{call_uuid}/Record/` | POST | None | `time_limit`, `file_format`, `transcription_type`, `transcription_url` |
| Send Message | `/v1/Account/{auth_id}/Message/` | POST | `dst`, `text`, `src` (or `powerpack_uuid`) | `type`, `url`, `log`, `media_urls` |
| Upload Media | `/v1/Account/{auth_id}/Media/` | POST | multipart `file` | None |
| Transcribe | `/v1/Account/{auth_id}/Transcription/{recording_id}/` | POST | None | None |

---

## 5. Edge Cases & Failure Modes

1. **403 Capacity Limit Breached:**
   - When outbound concurrency is maxed out, Plivo rejects `POST /Call/` with HTTP 403.
   - Failure is parsed specifically to extract "Concurrency Limit Breached" and mapped to `CapacityExceededError`.
2. **Missing/Invalid Credentials:**
   - In `live` mode, missing credentials trigger boot failure.
   - Runtime auth failure (HTTP 401) flags the `PlivoAccount.status` as `failed` with `lastVerifyError`.
3. **Plivo Rate Limit (HTTP 429):**
   - Retried up to 3 times with exponential backoff (initial delay 500ms, backoff factor 2, jitter ±100ms).

---

## 6. Testing Strategy
- Unit test asserting that swapping `TELEPHONY_MODE` returns the expected provider implementation.
- Provider interface test verifying method signatures against mock responses.
- Simulator unit test verifying deterministic ID generation and synthetic audio header validity.
