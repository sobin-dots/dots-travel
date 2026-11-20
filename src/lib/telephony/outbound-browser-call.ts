export interface PlivoCallInfoLike {
  callUUID?: string | null;
  callUuid?: string | null;
  call_uuid?: string | null;
  direction?: string | null;
}

export interface PlivoClientLike {
  callUUID?: string | null;
  _currentSession?: {
    callUUID?: string | null;
    direction?: string | null;
  } | null;
}

export interface DialBLegOutcome {
  answered: boolean;
  status: string;
  durationSeconds?: number;
  hangupCauseName?: string;
}

export interface LiveCallPollSnapshot {
  status: string;
  answeredAt?: Date | string | null;
  endedAt?: Date | string | null;
  requestedParams?: unknown;
}

export interface LiveCallPollResolution {
  state: 'calling' | 'ringing' | 'connected' | 'ended';
  answered: boolean;
  ended: boolean;
}

const TERMINAL_CALL_STATUSES = new Set([
  'completed',
  'missed',
  'failed',
  'busy',
  'no-answer',
  'timeout',
  'canceled',
]);

const UNANSWERED_TERMINAL_STATUSES = new Set([
  'busy',
  'failed',
  'no-answer',
  'timeout',
  'canceled',
]);

export function extractPlivoCallUuid(
  callInfo?: PlivoCallInfoLike | null,
  client?: PlivoClientLike | null
): string | null {
  const candidates = [
    callInfo?.callUUID,
    callInfo?.callUuid,
    callInfo?.call_uuid,
    client?.callUUID,
    client?._currentSession?.callUUID,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }
  return null;
}

export function isOutboundPlivoCall(
  callInfo?: PlivoCallInfoLike | null,
  activeDirection?: 'outbound' | 'inbound' | null
): boolean {
  const infoDirection = String(callInfo?.direction || '').trim().toLowerCase();
  if (infoDirection === 'outgoing' || infoDirection === 'outbound') return true;
  if (infoDirection === 'incoming' || infoDirection === 'inbound') return false;
  return activeDirection === 'outbound';
}

function parseNonNegativeInt(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const text = String(value).trim();
  if (!/^\d+$/.test(text)) return undefined;
  const num = Number(text);
  return Number.isSafeInteger(num) ? num : undefined;
}

function classifyUnansweredCause(statusText: string, causeText: string): string {
  const status = statusText.trim().toLowerCase();
  const cause = causeText.trim().toUpperCase();

  if (status === 'busy' || cause.includes('BUSY') || cause.includes('CALL_REJECTED')) {
    return 'busy';
  }
  if (
    status === 'no-answer' ||
    status === 'no_answer' ||
    status === 'timeout' ||
    cause.includes('NO_ANSWER') ||
    cause.includes('NO_USER_RESPONSE') ||
    cause.includes('RECOVERY_ON_TIMER_EXPIRE')
  ) {
    return 'no-answer';
  }
  if (
    status === 'cancel' ||
    status === 'canceled' ||
    status === 'cancelled' ||
    cause.includes('ORIGINATOR_CANCEL')
  ) {
    return 'canceled';
  }
  if (status === 'failed' || cause.includes('FAIL') || cause.includes('UNALLOCATED') || cause.includes('BARRED')) {
    return 'failed';
  }
  return 'no-answer';
}

/**
 * Classifies a Plivo `<Dial callbackUrl>` `DialAction=hangup` event for the B-leg.
 */
export function parseDialBLegOutcome(
  params: Record<string, unknown>,
  existingAnsweredAt?: Date | string | null
): DialBLegOutcome {
  const bLegStatus = String(params.DialBLegStatus || params.DialStatus || '').trim().toLowerCase();
  const bLegDuration = parseNonNegativeInt(params.DialBLegDuration ?? params.DialBLegBillDuration);
  const causeNameRaw =
    params.DialBLegHangupCauseName ||
    params.DialHangupCause ||
    params.DialBLegHangupCause ||
    params.HangupCauseName ||
    params.HangupCause;
  const hangupCauseName =
    causeNameRaw !== undefined && String(causeNameRaw).trim().length > 0
      ? String(causeNameRaw).trim()
      : undefined;

  const answered = Boolean(
    existingAnsweredAt ||
      bLegStatus === 'completed' ||
      bLegStatus === 'answered' ||
      bLegStatus === 'answer' ||
      bLegStatus === 'in-progress' ||
      (bLegDuration !== undefined && bLegDuration > 0)
  );

  if (answered) {
    return {
      answered: true,
      status: 'completed',
      durationSeconds: bLegDuration,
      hangupCauseName,
    };
  }

  return {
    answered: false,
    status: classifyUnansweredCause(bLegStatus, hangupCauseName || ''),
    durationSeconds: 0,
    hangupCauseName,
  };
}

/**
 * Resolves the final DB status for an outbound browser WebRTC call when a
 * hangup or terminal status webhook arrives on the A-leg.
 *
 * Because Plivo answers the A-leg (browser -> Plivo) before dialing the customer
 * B-leg, A-leg hangup callbacks often report NORMAL_CLEARING (4000) even when
 * the customer never picked up.
 */
export function resolveOutboundBrowserFinalStatus(
  call: {
    status: string;
    answeredAt?: Date | string | null;
  },
  meta?: {
    hangupCauseCode?: number;
    hangupCauseName?: string;
    hangupSource?: string;
    incomingStatus?: string;
  }
): string {
  if (call.answeredAt) {
    return 'completed';
  }

  if (UNANSWERED_TERMINAL_STATUSES.has(call.status)) {
    return call.status;
  }

  const incomingStatus = String(meta?.incomingStatus || '').trim().toLowerCase();
  const causeName = String(meta?.hangupCauseName || '').trim().toUpperCase();
  const causeCode = meta?.hangupCauseCode;
  const hangupSource = String(meta?.hangupSource || '').trim().toLowerCase();

  if (incomingStatus && UNANSWERED_TERMINAL_STATUSES.has(incomingStatus)) {
    return incomingStatus;
  }
  if (causeName.includes('ORIGINATOR_CANCEL') || causeCode === 3100) {
    return 'canceled';
  }
  if (causeName.includes('BUSY') || causeName.includes('CALL_REJECTED') || causeCode === 3000) {
    return 'busy';
  }
  if (
    causeName.includes('NO_ANSWER') ||
    causeName.includes('NO_USER_RESPONSE') ||
    causeCode === 3010 ||
    causeCode === 3020
  ) {
    return 'no-answer';
  }
  if (causeCode && causeCode >= 1000 && causeCode < 4000) {
    return 'failed';
  }
  if (hangupSource === 'caller') {
    return 'canceled';
  }
  if (hangupSource === 'callee' || hangupSource === 'plivo') {
    return 'no-answer';
  }
  if (causeName.includes('NORMAL_CLEARING') || causeCode === 4000) {
    return 'canceled';
  }
  return 'no-answer';
}

export function resolveLiveCallPollState(call: LiveCallPollSnapshot | null | undefined): LiveCallPollResolution {
  if (!call) {
    return { state: 'calling', answered: false, ended: false };
  }

  const reqParams =
    call.requestedParams && typeof call.requestedParams === 'object' && !Array.isArray(call.requestedParams)
      ? (call.requestedParams as Record<string, unknown>)
      : null;

  const status = String(call.status || '').trim().toLowerCase();
  const answered = Boolean(call.answeredAt || reqParams?.bLegAnsweredAt || status === 'in-progress');
  const ended = Boolean(call.endedAt || TERMINAL_CALL_STATUSES.has(status));

  if (ended) {
    return { state: 'ended', answered, ended: true };
  }
  if (answered) {
    return { state: 'connected', answered: true, ended: false };
  }
  if (status === 'queued') {
    return { state: 'calling', answered: false, ended: false };
  }
  return { state: 'ringing', answered: false, ended: false };
}
