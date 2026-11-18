export interface CallbackCallLike {
  direction?: string | null;
  from?: string | null;
  to?: string | null;
  status?: string | null;
  agentOutcome?: string | null;
}

export interface CallbackContactLike {
  phone?: string | null;
}

/**
 * Converts a caller/recipient string into a clean E.164 number when dialable, or returns '' for SIP/invalid values.
 */
export function normalizeDialablePhone(raw?: string | null): string {
  const trimmed = String(raw || '').trim();
  if (!trimmed || /^sip:/i.test(trimmed)) return '';
  const digits = trimmed.replace(/[\s().+-]/g, '').replace(/^00/, '');
  return /^[1-9]\d{6,14}$/.test(digits) ? `+${digits}` : '';
}

/**
 * Extracts the customer phone number to dial back for an inbound or outbound call record.
 */
export function getCallbackPhone(call: Pick<CallbackCallLike, 'direction' | 'from' | 'to'>): string {
  const raw = call.direction === 'outbound' ? call.to : call.from;
  return normalizeDialablePhone(raw);
}

/**
 * Returns true when a call was missed, rejected, failed, or otherwise unanswered by staff.
 */
export function isMissedOrUnansweredCall(
  call: Pick<CallbackCallLike, 'direction' | 'status' | 'agentOutcome'>
): boolean {
  const status = String(call.status || '').toLowerCase();
  if (['missed', 'no-answer', 'failed', 'busy', 'canceled', 'cancelled'].includes(status)) {
    return true;
  }
  return (
    call.direction === 'inbound' &&
    Boolean(call.agentOutcome) &&
    call.agentOutcome !== 'answered' &&
    status !== 'in-progress'
  );
}

/**
 * Matches a callback number against saved contacts (using E.164 digit normalization) or returns the normalized number.
 */
export function resolveCallbackDestination(
  rawPhone: string,
  contacts: CallbackContactLike[]
): string {
  const normalizedTarget = normalizeDialablePhone(rawPhone);
  if (!normalizedTarget) return '';

  const exactMatch = contacts.find((c) => c.phone === normalizedTarget || c.phone === rawPhone.trim());
  if (exactMatch?.phone) return exactMatch.phone;

  const targetDigits = normalizedTarget.slice(1);
  const normalizedMatch = contacts.find((c) => {
    const normalizedContact = normalizeDialablePhone(c.phone);
    return normalizedContact ? normalizedContact.slice(1) === targetDigits : false;
  });

  return normalizedMatch?.phone || normalizedTarget;
}
