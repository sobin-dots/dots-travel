# Architecture SOP: Messaging (SMS / MMS)

## 1. Goal
Provide reliable, two-way SMS and MMS messaging, pre-send character encoding and segment estimation (GSM-7 vs. UCS-2), thread aggregation by counterpart number, status reconciliation via webhooks, and media handling.

---

## 2. Encoding and Segment Cost Model

Before sending a message, the operator must know exactly how many billable units it requires. A utility (`src/lib/telephony/messaging/encoder.ts`) calculates encoding details:

### 2.1 Rules
- **GSM-7 Character Set:** Standard Latin alphabet, digits, common punctuation.
  - Single segment limit: **160 characters**.
  - Multi-segment limit: **153 characters per segment** (7 bytes reserved for UDH header).
  - Maximum concatenated length: **1,600 characters** (10 segments).
- **UCS-2 (Unicode) Character Set:** Triggered by any emoji, accented glyph, or non-Latin character.
  - Single segment limit: **70 characters**.
  - Multi-segment limit: **67 characters per segment**.
  - Maximum concatenated length: **737 characters**.
- **Calculation Algorithm:**
  ```typescript
  export function analyzeMessage(text: string): MessageAnalysis {
    const isGsm7 = isGSM7Encoding(text);
    const length = text.length;
    if (isGsm7) {
      const units = length <= 160 ? 1 : Math.ceil(length / 153);
      return { encoding: 'GSM-7', units, charCount: length, maxPerUnit: length <= 160 ? 160 : 153 };
    } else {
      const units = length <= 70 ? 1 : Math.ceil(length / 67);
      return { encoding: 'UCS-2', units, charCount: length, maxPerUnit: length <= 70 ? 70 : 67 };
    }
  }
  ```

---

## 3. Outbound Messaging DTO (`SendMessageRequest`)

Strict Zod schema under `/api/v1/messages/send`:
```typescript
export const SendMessageRequestSchema = z.object({
  phoneNumberId: z.string().uuid(),
  to: z.array(z.string().regex(/^\+[1-9]\d{1,14}$/)).min(1).max(50),
  text: z.string().min(1).max(1600),
  mediaIds: z.array(z.string()).max(10).optional(),
  statusCallbackUrl: z.string().url().optional(),
});
```

---

## 4. Two-Way Threading Aggregation

Every inbound and outbound message updates or creates a `MessageThread` record:
- **Composite Key:** `[organizationId, ownNumberE164, counterpartE164]`
- **Threading Logic:**
  1. For outbound: `counterpartE164 = to`, `ownNumberE164 = from`.
  2. For inbound: `counterpartE164 = from`, `ownNumberE164 = to`.
  3. Upsert `MessageThread`:
     - Set `lastMessageAt = now()`.
     - Increment `unreadCount` on inbound messages; reset when opened in console.
  4. Link `Message.threadId` to the thread.

---

## 5. Media & MMS Handling

1. **Upload:** Upload media via `POST /v1/Account/{auth_id}/Media/` before sending.
2. **Limits:**
   - Maximum 10 files per message.
   - Maximum 2 MB per file.
   - Maximum total payload: **5 MB**.
   - Supported types: JPEG, PNG, GIF, VCF, PDF.
3. **Plivo Error Codes for MMS:**
   - `120`: Payload exceeded 5 MB cap.
   - `130`: Unsupported media format.
   - `140`: Media processing failure.
   - Note: Failed messages do not incur message charges.

---

## 6. Edge Cases & Privacy

1. **`log: false` Redaction:**
   - If enabled on the organization (`redactMessageContent: true`), message body and destination are not stored in Plivo's MDR logs.
   - This action is irreversible. The UI displays an explicit warning.
2. **Delivery Status Truth:**
   - Outbound `200 OK` from `POST /Message/` creates the record with status `queued`.
   - Real statuses (`sent`, `delivered`, `undelivered`, `failed`) arrive strictly via status callback.
   - Carrier delivery failures (`undelivered`) include `ErrorCode` which is mapped to human-readable explanations.

---

## 7. Testing Strategy
- Unit test for `analyzeMessage`:
  - 160-char ASCII -> GSM-7, 1 unit.
  - 161-char ASCII -> GSM-7, 2 units.
  - 1-char emoji -> UCS-2, 1 unit.
  - 71-char emoji text -> UCS-2, 2 units.
- Integration test for inbound SMS webhook:
  - Valid signed webhook creates `Message` with status `received`.
  - Upserts `MessageThread` with incremented `unreadCount`.
