import * as plivo from 'plivo';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { getTenantIntegration } from '@/lib/integrations/credentials-manager';
import { lockAgency } from '@/lib/lead-intake/service';
import { inboundFinalStatus, releaseCallAgentInTransaction } from '@/lib/telephony/agent-routing';
import { resolveOutboundBrowserFinalStatus } from '@/lib/telephony/outbound-browser-call';

export interface CarrierCallSnapshot {
  callUuid?: string | null;
  parentCallUuid?: string | null;
  callState?: string | null;
  callDirection?: string | null;
  fromNumber?: string | null;
  toNumber?: string | null;
  callDuration?: number | string | null;
  billDuration?: number | string | null;
  billedDuration?: number | string | null;
  totalAmount?: number | string | null;
  hangupCauseCode?: number | string | null;
  hangupCauseName?: string | null;
  hangupSource?: string | null;
  initiationTime?: string | null;
  answerTime?: string | null;
  endTime?: string | null;
}

type PlivoSdkClient = InstanceType<(typeof plivo)['Client']>;

export interface PlivoCallsClientLike {
  calls?: {
    get?: (callUuid: string) => Promise<CarrierCallSnapshot>;
    list?: (params?: { limit?: number; offset?: number }) => Promise<CarrierCallSnapshot[] | { objects?: CarrierCallSnapshot[] }>;
  };
}

export async function getOrgPlivoClient(
  organizationId: string,
  options?: { allowEnvFallback?: boolean }
): Promise<{ client: PlivoSdkClient | null; hasTenantCredentials: boolean }> {
  let plivoAuthId = options?.allowEnvFallback === false ? undefined : process.env.PLIVO_AUTH_ID;
  let plivoAuthToken = options?.allowEnvFallback === false ? undefined : process.env.PLIVO_AUTH_TOKEN;
  let hasTenantCredentials = false;

  try {
    const tenantPlivo = await getTenantIntegration(organizationId, 'plivo');
    if (tenantPlivo?.credentials?.authId && tenantPlivo?.credentials?.authToken) {
      plivoAuthId = tenantPlivo.credentials.authId;
      plivoAuthToken = tenantPlivo.credentials.authToken;
      hasTenantCredentials = true;
    }
  } catch {}

  if (!plivoAuthId || !plivoAuthToken) {
    return { client: null, hasTenantCredentials };
  }

  const ClientCtor = (plivo as unknown as { Client: typeof plivo.Client }).Client;
  const client = new ClientCtor(plivoAuthId, plivoAuthToken);
  return { client, hasTenantCredentials };
}

const TERMINAL_CARRIER_STATES = new Set([
  'completed',
  'failed',
  'busy',
  'no-answer',
  'no_answer',
  'cancel',
  'canceled',
  'cancelled',
  'timeout',
  'hangup',
]);

const ORG_SYNC_THROTTLE_MS = 10_000;
const STALE_ACTIVE_CALL_MS = 20_000;
const lastOrgSyncAt = new Map<string, number>();
const inFlightOrgSyncs = new Map<string, Promise<{ reconciled: number; imported: number }>>();

function parseFiniteNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parsePositiveInt(value: unknown): number | undefined {
  const parsed = parseFiniteNumber(value);
  if (parsed === undefined || parsed <= 0) return undefined;
  return Math.trunc(parsed);
}

function parseDateValue(value?: string | null): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function normalizePhoneDigits(phone?: string | null): string {
  return String(phone || '').replace(/\D/g, '');
}

function phoneTail10(phone?: string | null): string {
  const digits = normalizePhoneDigits(phone);
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

function mapRawCarrierStatus(carrierState: string, causeName?: string): string {
  const normalized = carrierState.trim().toLowerCase();
  const normalizedCause = (causeName || '').trim().toUpperCase();

  if (normalized === 'early-media' || normalized === 'ringing') return 'ringing';
  if (normalized === 'queued' || normalized === 'in-progress') return normalized;
  if (normalized === 'cancel' || normalized === 'canceled' || normalized === 'cancelled') return 'canceled';
  if (normalized === 'no_answer' || normalized === 'no-answer') return 'no-answer';
  if (normalized === 'busy' || normalized === 'timeout' || normalized === 'failed') return normalized;

  if (normalized === 'hangup' || normalized === 'completed') {
    if (normalizedCause.includes('ORIGINATOR_CANCEL')) return 'canceled';
    if (normalizedCause.includes('NO_ANSWER') || normalizedCause.includes('NO_USER_RESPONSE')) return 'no-answer';
    if (normalizedCause.includes('BUSY') || normalizedCause.includes('CALL_REJECTED')) return 'busy';
    return 'completed';
  }

  return normalized || 'failed';
}

function isTerminalCarrierCall(carrierCall: CarrierCallSnapshot): boolean {
  const carrierState = String(carrierCall.callState || '').trim().toLowerCase();
  const causeCode = parsePositiveInt(carrierCall.hangupCauseCode);
  return Boolean(carrierCall.endTime || causeCode || TERMINAL_CARRIER_STATES.has(carrierState));
}

/**
 * Reconciles an existing local Call row against a carrier snapshot from Plivo's
 * Call Detail or List Calls API, unlocking any busy WebRTC agent if ended.
 */
export async function applyCarrierCallUpdate(
  callId: string,
  organizationId: string,
  carrierCall: CarrierCallSnapshot
): Promise<boolean> {
  if (!isTerminalCarrierCall(carrierCall)) {
    return false;
  }

  const carrierState = String(carrierCall.callState || '').trim().toLowerCase();
  const carrierCauseCode = parsePositiveInt(carrierCall.hangupCauseCode);
  const carrierCauseName = carrierCall.hangupCauseName ? String(carrierCall.hangupCauseName) : undefined;
  const rawMappedStatus = mapRawCarrierStatus(carrierState, carrierCauseName);
  const parsedDur = parseFiniteNumber(carrierCall.callDuration);
  const parsedBill = parseFiniteNumber(carrierCall.billDuration ?? carrierCall.billedDuration);
  const parsedCost = parseFiniteNumber(carrierCall.totalAmount);
  const resolvedEndedAt = parseDateValue(carrierCall.endTime) || new Date();
  const resolvedAnsweredAt = parseDateValue(carrierCall.answerTime);

  await db.$transaction(async (tx) => {
    await lockAgency(tx, organizationId);
    const latest = await tx.call.findUnique({ where: { id: callId } });
    if (!latest) return;

    const isUntrackedInbound =
      latest.direction === 'inbound' && !latest.agentOutcome && !latest.agentAnsweredAt && !latest.answeredAt;
    const isUnansweredOutboundBrowser =
      latest.direction === 'outbound' && latest.requestedMode === 'browser' && !latest.answeredAt;
    const finalStatus = isUntrackedInbound
      ? inferHangupTerminalStatus({
          direction: 'inbound',
          durationSeconds: parsedDur,
          billDurationSeconds: parsedBill,
          hangupCauseCode: carrierCauseCode,
          hangupCauseName: carrierCauseName,
        })
      : isUnansweredOutboundBrowser
        ? resolveOutboundBrowserFinalStatus(latest, {
            incomingStatus: rawMappedStatus,
            hangupCauseCode: carrierCauseCode,
            hangupCauseName: carrierCauseName,
            hangupSource: carrierCall.hangupSource || undefined,
          })
        : inboundFinalStatus({ ...latest, status: rawMappedStatus });
    await tx.call.update({
      where: { id: latest.id },
      data: {
        status: finalStatus,
        ...(latest.direction === 'inbound' &&
        finalStatus === 'missed' &&
        latest.agentOutcome &&
        latest.agentOutcome !== 'declined'
          ? { agentOutcome: 'missed' }
          : {}),
        endedAt: latest.endedAt || resolvedEndedAt,
        ...(!latest.answeredAt && !isUnansweredOutboundBrowser && resolvedAnsweredAt
          ? { answeredAt: resolvedAnsweredAt }
          : {}),
        ...(isUnansweredOutboundBrowser
          ? { durationSeconds: 0 }
          : parsedDur !== undefined
            ? { durationSeconds: parsedDur }
            : {}),
        ...(parsedBill !== undefined ? { billDurationSeconds: parsedBill } : {}),
        ...(parsedCost !== undefined ? { totalCost: parsedCost } : {}),
        ...(carrierCauseCode !== undefined ? { hangupCauseCode: carrierCauseCode } : {}),
        ...(carrierCauseName ? { hangupCauseName: carrierCauseName } : {}),
      },
    });

    if (!latest.endedAt) {
      await releaseCallAgentInTransaction(tx, latest);
    }
  }, { timeout: 15_000 });

  return true;
}

export async function syncSingleCallStatusWithPlivo(
  call: { id: string; organizationId: string; plivoCallUuid: string },
  providedClient?: PlivoCallsClientLike | PlivoSdkClient | null
): Promise<boolean> {
  const client = providedClient ?? (await getOrgPlivoClient(call.organizationId)).client;
  const callsApi = client?.calls as PlivoCallsClientLike['calls'];
  if (typeof callsApi?.get !== 'function') return false;
  const carrierCall = await callsApi.get(call.plivoCallUuid);
  if (!carrierCall) return false;
  return applyCarrierCallUpdate(call.id, call.organizationId, carrierCall);
}

function buildOrgPhoneMatcher(phoneNumbers: Array<{ id: string; e164: string }>) {
  const exactMap = new Map<string, { id: string; e164: string }>();
  const tailMap = new Map<string, { id: string; e164: string }>();

  for (const pn of phoneNumbers) {
    const digits = normalizePhoneDigits(pn.e164);
    const tail = phoneTail10(pn.e164);
    if (digits) exactMap.set(digits, pn);
    if (tail) tailMap.set(tail, pn);
  }

  return (number?: string | null) => {
    const digits = normalizePhoneDigits(number);
    if (!digits) return null;
    if (exactMap.has(digits)) return exactMap.get(digits) || null;
    const tail = phoneTail10(digits);
    return (tail && tailMap.get(tail)) || null;
  };
}

/**
 * Reconciles stale active calls and imports recent Plivo inbound/outbound PSTN calls
 * whose webhooks never reached the application (e.g., transient webhook failures).
 */
export async function syncRecentOrgCallsFromPlivo(
  organizationId: string,
  options?: { force?: boolean; limit?: number }
): Promise<{ reconciled: number; imported: number }> {
  const existingFlight = inFlightOrgSyncs.get(organizationId);
  if (existingFlight) {
    return existingFlight;
  }

  const now = Date.now();
  const lastSync = lastOrgSyncAt.get(organizationId) || 0;
  if (!options?.force && now - lastSync < ORG_SYNC_THROTTLE_MS) {
    return { reconciled: 0, imported: 0 };
  }

  const syncTask = (async (): Promise<{ reconciled: number; imported: number }> => {
    lastOrgSyncAt.set(organizationId, Date.now());
    let reconciled = 0;
    let imported = 0;

    const { client } = await getOrgPlivoClient(organizationId);
    const callsApi = client?.calls as PlivoCallsClientLike['calls'];
    if (!callsApi) {
      return { reconciled, imported };
    }

    const activeCutoff = options?.force ? new Date() : new Date(Date.now() - STALE_ACTIVE_CALL_MS);
    const activeCalls = await db.call.findMany({
      where: {
        organizationId,
        endedAt: null,
        status: { in: ['ringing', 'queued', 'in-progress'] },
        startedAt: { lte: activeCutoff },
        NOT: { plivoCallUuid: { startsWith: 'temp_' } },
      },
      select: { id: true, organizationId: true, plivoCallUuid: true },
      orderBy: { startedAt: 'desc' },
      take: 5,
    });

    if (typeof callsApi.get === 'function' && activeCalls.length > 0) {
      // Process active call reconciliations sequentially to avoid queueing parallel agency-lock transactions.
      for (const activeCall of activeCalls) {
        try {
          if (await syncSingleCallStatusWithPlivo(activeCall, { calls: callsApi })) {
            reconciled += 1;
          }
        } catch (activeSyncErr) {
          console.warn(
            'Active call status sync notice:',
            activeSyncErr instanceof Error ? activeSyncErr.message : String(activeSyncErr)
          );
        }
      }
    }

    if (typeof callsApi.list !== 'function') {
      return { reconciled, imported };
    }

    try {
      const orgNumbers = await db.phoneNumber.findMany({
        where: { organizationId },
        select: { id: true, e164: true },
      });
      if (orgNumbers.length === 0) {
        return { reconciled, imported };
      }

      const matchOrgPhone = buildOrgPhoneMatcher(orgNumbers);
      const listResponse = await callsApi.list({ limit: options?.limit ?? 20, offset: 0 });
      const items: CarrierCallSnapshot[] = Array.isArray(listResponse)
        ? listResponse
        : Array.isArray(listResponse?.objects)
          ? listResponse.objects
          : [];

      const uuids = Array.from(
        new Set(items.map((item) => item.callUuid).filter((id): id is string => Boolean(id)))
      );
      if (uuids.length === 0) {
        return { reconciled, imported };
      }

      const parentUuids = Array.from(
        new Set(items.map((item) => item.parentCallUuid).filter((id): id is string => Boolean(id)))
      );
      const allLookupUuids = Array.from(new Set([...uuids, ...parentUuids]));

      const existingRows = await db.call.findMany({
        where: { plivoCallUuid: { in: allLookupUuids } },
        select: {
          id: true,
          organizationId: true,
          plivoCallUuid: true,
          endedAt: true,
          status: true,
          hangupCauseCode: true,
        },
      });

      const orgRowByUuid = new Map<string, (typeof existingRows)[number]>();
      const allKnownUuids = new Set<string>();
      for (const row of existingRows) {
        allKnownUuids.add(row.plivoCallUuid);
        if (row.organizationId === organizationId) {
          orgRowByUuid.set(row.plivoCallUuid, row);
        }
      }

      const missingCallsToCreate: Prisma.CallCreateManyInput[] = [];

      for (const item of items) {
        const callUuid = item.callUuid;
        if (!callUuid) continue;

        const existingOrgRow = orgRowByUuid.get(callUuid);
        if (existingOrgRow) {
          const needsUpdate =
            !existingOrgRow.endedAt ||
            ['ringing', 'queued', 'in-progress'].includes(existingOrgRow.status) ||
            existingOrgRow.hangupCauseCode == null;
          if (needsUpdate && (await applyCarrierCallUpdate(existingOrgRow.id, organizationId, item))) {
            reconciled += 1;
          }
          continue;
        }

        // Skip calls already owned by another org or child <Dial> B-legs whose A-leg is known
        if (allKnownUuids.has(callUuid)) continue;
        if (item.parentCallUuid && allKnownUuids.has(item.parentCallUuid)) continue;
        if (item.parentCallUuid) continue;

        const fromNumber = String(item.fromNumber || '').trim();
        const toNumber = String(item.toNumber || '').trim();
        // Skip raw SIP A-legs that aren't associated with our tracked calls; customer PSTN legs use org numbers
        if (fromNumber.toLowerCase().startsWith('sip:')) continue;

        const matchedPhone = matchOrgPhone(toNumber) || matchOrgPhone(fromNumber);
        if (!matchedPhone) continue;

        const direction =
          String(item.callDirection || '').toLowerCase() === 'outbound' || Boolean(matchOrgPhone(fromNumber))
            ? 'outbound'
            : 'inbound';

        const isTerminal = isTerminalCarrierCall(item);
        const billDurationSeconds = parseFiniteNumber(item.billDuration ?? item.billedDuration) ?? 0;
        const durationSeconds = parseFiniteNumber(item.callDuration) ?? 0;
        const totalCost = parseFiniteNumber(item.totalAmount) ?? 0;
        const causeCode = parsePositiveInt(item.hangupCauseCode);
        const causeName = item.hangupCauseName
          ? String(item.hangupCauseName)
          : item.hangupSource
            ? `Hangup (${item.hangupSource})`
            : 'Hangup';
        const startedAt = parseDateValue(item.initiationTime) || parseDateValue(item.endTime) || new Date();
        const answeredAt = parseDateValue(item.answerTime);
        const endedAt = parseDateValue(item.endTime) || (isTerminal ? new Date() : undefined);
        const rawMapped = mapRawCarrierStatus(String(item.callState || ''), item.hangupCauseName || undefined);

        let finalStatus = rawMapped;
        if (direction === 'inbound') {
          if (isTerminal) {
            finalStatus = answeredAt && billDurationSeconds > 0 ? 'completed' : 'missed';
          } else if (['completed', 'hangup'].includes(rawMapped)) {
            finalStatus = answeredAt && billDurationSeconds > 0 ? 'completed' : 'missed';
          }
        }

        missingCallsToCreate.push({
          organizationId,
          phoneNumberId: matchedPhone.id,
          plivoCallUuid: callUuid,
          direction,
          from: fromNumber || 'Unknown',
          to: toNumber || matchedPhone.e164,
          status: finalStatus,
          startedAt,
          ...(answeredAt ? { answeredAt } : {}),
          ...(endedAt ? { endedAt } : {}),
          durationSeconds: Math.trunc(durationSeconds),
          billDurationSeconds: Math.trunc(billDurationSeconds),
          totalCost,
          ...(causeCode !== undefined ? { hangupCauseCode: causeCode } : {}),
          hangupCauseName: isTerminal ? causeName : undefined,
          requestedParams: {
            syncedFromPlivo: true,
            hangupSource: item.hangupSource || null,
            sipCallState: item.callState || null,
          } as Prisma.InputJsonValue,
        });
        allKnownUuids.add(callUuid);
      }

      if (missingCallsToCreate.length > 0) {
        const created = await db.call.createMany({
          data: missingCallsToCreate,
          skipDuplicates: true,
        });
        imported += created.count;
      }
    } catch (err) {
      console.warn('Plivo call history sync notice:', err instanceof Error ? err.message : String(err));
    }

    return { reconciled, imported };
  })();

  inFlightOrgSyncs.set(organizationId, syncTask);
  try {
    return await syncTask;
  } finally {
    inFlightOrgSyncs.delete(organizationId);
  }
}

export function inferHangupTerminalStatus(options: {
  direction: string;
  durationSeconds?: number;
  billDurationSeconds?: number;
  hangupCauseCode?: number;
  hangupCauseName?: string;
}): string {
  const { direction, durationSeconds = 0, billDurationSeconds = 0, hangupCauseCode, hangupCauseName } = options;
  if (direction === 'inbound') {
    return billDurationSeconds > 0 ? 'completed' : 'missed';
  }
  const cause = (hangupCauseName || '').toUpperCase();
  if (cause.includes('ORIGINATOR_CANCEL') || hangupCauseCode === 3100) return 'canceled';
  if (cause.includes('BUSY') || cause.includes('CALL_REJECTED') || hangupCauseCode === 3000) return 'busy';
  if (cause.includes('NO_ANSWER') || cause.includes('NO_USER_RESPONSE') || hangupCauseCode === 3010 || hangupCauseCode === 3020) {
    return 'no-answer';
  }
  if (hangupCauseCode && hangupCauseCode >= 1000 && hangupCauseCode < 4000) return 'failed';
  if (durationSeconds > 0 || billDurationSeconds > 0) return 'completed';
  return 'completed';
}

/**
 * Resolves which organization owns a Plivo hangup webhook when no Call row exists yet.
 */
export async function resolveHangupOrganizationId(options: {
  orgIdParam?: string | null;
  params: Record<string, unknown>;
}): Promise<string | null> {
  const { orgIdParam, params } = options;
  if (params.ParentCallUUID || params.parent_call_uuid) {
    return null;
  }

  const from = String(params.From || params.from || '').trim();
  const to = String(params.To || params.to || '').trim();
  if (!from && !to) {
    return null;
  }

  const { resolveTenantPlivoIntegration } = await import('@/lib/integrations/credentials-manager');
  const parentAuthId = String(params.ParentAuthID || params.authId || params.AuthId || '').trim() || undefined;
  const tenantPlivo = await resolveTenantPlivoIntegration({
    organizationId: orgIdParam || undefined,
    parentAuthId,
    phoneNumber: to || from || undefined,
  });

  let organizationId = tenantPlivo?.organizationId;
  if (!organizationId && orgIdParam) {
    const org = await db.organization.findUnique({ where: { id: orgIdParam }, select: { id: true } });
    organizationId = org?.id;
  }
  if (!organizationId || (orgIdParam && organizationId !== orgIdParam)) {
    return null;
  }
  return organizationId;
}

/**
 * Inserts a recovered primary call record inside an active agency-locked transaction,
 * avoiding FK/unique-index lock cycles and duplicate-key log errors.
 */
export async function createRecoveredHangupCallInTx(
  tx: Prisma.TransactionClient,
  options: {
    organizationId: string;
    callUuid: string;
    params: Record<string, unknown>;
  }
) {
  const { organizationId, callUuid, params } = options;
  if (params.ParentCallUUID || params.parent_call_uuid) {
    return null;
  }

  const from = String(params.From || params.from || '').trim();
  const to = String(params.To || params.to || '').trim();
  if (!from && !to) {
    return null;
  }

  const orgNumbers = await tx.phoneNumber.findMany({
    where: { organizationId },
    select: { id: true, e164: true },
  });
  const matchOrgPhone = buildOrgPhoneMatcher(orgNumbers);
  const matchedPhone = matchOrgPhone(to) || matchOrgPhone(from);
  const direction =
    String(params.Direction || params.direction || '').toLowerCase() === 'outbound' ||
    from.toLowerCase().startsWith('sip:') ||
    Boolean(matchOrgPhone(from))
      ? 'outbound'
      : 'inbound';

  await tx.call.createMany({
    data: [
      {
        organizationId,
        phoneNumberId: matchedPhone?.id || null,
        plivoCallUuid: callUuid,
        direction,
        from: from || 'Unknown',
        to: to || matchedPhone?.e164 || 'Unknown',
        status: 'ringing',
        startedAt: new Date(),
        requestedParams: {
          recoveredFromHangup: true,
          rawParams: params,
        } as Prisma.InputJsonValue,
      },
    ],
    skipDuplicates: true,
  });

  return tx.call.findUnique({ where: { plivoCallUuid: callUuid } });
}
