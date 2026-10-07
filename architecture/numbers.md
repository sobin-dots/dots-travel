# Architecture SOP: Phone Number Management

## 1. Goal
Provide comprehensive inventory search, automated purchasing with compliance validations, application assignment (wiring Answer and Message URLs), granular per-number telephony behavior configuration, and soft-delete releasing.

---

## 2. Inventory Search & Country Eligibility

### 2.1 Search Parameters (`GET /v1/Account/{auth}/PhoneNumber/`)
- **Required:** `country_iso` (two-letter ISO 3166-1 alpha-2 code, e.g. `US`, `GB`, `IN`).
- **Optional:** `prefix`, `type` (`local` | `tollfree` | `mobile`), `region`, `city`, `lata`, `rate_center`.
- **Paging:** `limit` (max 20), `offset`.

### 2.2 Plan & Regulatory Gating
Before initiating search or purchase, the system checks country plan prerequisites:
- **Pay-As-You-Go Eligible:** United States (`US`), India (`IN` — requires regulatory KYC).
- **Enterprise Contract Required ($1,000/month min spend):** Canada (`CA`), United Kingdom (`GB`), Australia (`AU`), Germany (`DE`), Singapore (`SG`), Brazil (`BR`), UAE (`AE`), Saudi Arabia (`SA`).
- **UI Policy:** If a non-PAYG country is requested on a standard account, the console displays an explanatory requirement banner instead of allowing an opaque API error.

---

## 3. Purchasing & Provisioning Flow

### 3.1 Purchase DTO (`BuyNumberRequest`)
Strict Zod schema under `/api/v1/numbers/buy`:
```typescript
export const BuyNumberRequestSchema = z.object({
  countryIso: z.string().length(2).toUpperCase(),
  e164: z.string().regex(/^\+[1-9]\d{1,14}$/),
  applicationId: z.string().uuid().optional(),
  cnam: z.enum(['enabled', 'disabled']).optional(), // US only
  complianceApplicationId: z.string().optional(),   // India / regulated
});
```

### 3.2 Automated Plivo Application Provisioning
Numbers require a linked **Plivo Application** to know where to route incoming calls and messages:
1. Ensure a default `Application` exists for the organization or create one:
   - `answer_url`: `${PUBLIC_BASE_URL}/api/v1/webhooks/voice/answer`
   - `hangup_url`: `${PUBLIC_BASE_URL}/api/v1/webhooks/voice/hangup`
   - `fallback_answer_url`: `${PUBLIC_BASE_URL}/api/v1/webhooks/voice/fallback`
   - `message_url`: `${PUBLIC_BASE_URL}/api/v1/webhooks/messages/inbound`
2. Execute purchase: `POST /v1/Account/{auth}/PhoneNumber/{number}/` with `app_id`.
3. Create local record in `PhoneNumber` table linked to `Organization` and `PlivoAccount`.

---

## 4. Per-Number Telephony Behavior

Each number can be tailored with specific behaviors stored in `PhoneNumber`:
- `recordCalls`: boolean (default `true`)
- `recordChannelType`: `'mono' | 'stereo'` (default `'stereo'`)
- `transcribeEnabled`: boolean (default `true`)
- `transcriptionLanguage`: string (default `'en-US'`)
- `voicemailEnabled`: boolean (default `false`)
- `forwardTo`: string? (E.164 forwarding destination)
- `machineDetection`: boolean (default `false`)

---

## 5. Lifecycle & Releasing

1. **Billing Rule:** Numbers bill for the full calendar month even when released mid-month.
2. **Release Action:** `DELETE /v1/Account/{auth}/Number/{number}/`.
3. **Soft Deletion:** Record is updated with `status = 'released'` and `releasedAt = now()`. Historical calls and messages remain attached.

---

## 6. Testing Strategy
- Unit test validating that search without `countryIso` is rejected by Zod.
- Unit test checking country tier eligibility logic.
- Integration test for number purchase and behavior configuration update.
