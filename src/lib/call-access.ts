import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import type { AuthContext } from '@/lib/api-auth';
import { managesLeads } from '@/lib/lead-access';

/**
 * Admins and owners manage all organizational calls and recordings.
 */
export function managesCalls(auth: Pick<AuthContext, 'role'>): boolean {
  return managesLeads(auth);
}

/**
 * Extracts the user ID who initiated the call from requestedParams if available.
 */
export function getCallActorUserId(call: { requestedParams?: unknown }): string | null {
  if (!call || !call.requestedParams || typeof call.requestedParams !== 'object') return null;
  const params = call.requestedParams as Record<string, unknown>;
  return typeof params.actorUserId === 'string' ? params.actorUserId : null;
}

/**
 * Returns the staff user ID who placed the outbound call or actually attended/answered the inbound call.
 * Unanswered or missed inbound reservations return null.
 */
export function getAttendedStaffUserId(call: {
  direction: string;
  assignedToId?: string | null;
  agentOutcome?: string | null;
  agentAnsweredAt?: Date | null;
  requestedParams?: unknown;
}): string | null {
  if (call.direction === 'outbound') {
    return getCallActorUserId(call) || call.assignedToId || null;
  }
  return call.agentAnsweredAt || call.agentOutcome === 'answered' ? call.assignedToId || null : null;
}

/**
 * Enforces call record authorization:
 * - Admins and owners can access any call in the organization.
 * - Non-admins (sales / operators) can only access calls they placed or attended.
 */
export function canAccessCallRecord(
  auth: AuthContext,
  call: {
    direction: string;
    assignedToId?: string | null;
    agentOutcome?: string | null;
    agentAnsweredAt?: Date | null;
    requestedParams?: unknown;
  }
): boolean {
  if (managesCalls(auth)) return true;
  const attendedUserId = getAttendedStaffUserId(call);
  return attendedUserId === auth.userId;
}

/**
 * Returns the Prisma query filter for calls scoped to the authenticated caller:
 * - Returns null for admins/owners (no extra restriction).
 * - For sales/non-admins, restricts to:
 *   1) Outbound calls placed by this user (actorUserId or assignedToId or audit-logged).
 *   2) Inbound calls attended/answered by this user.
 */
export async function getCallScopeWhere(
  auth: AuthContext
): Promise<Prisma.CallWhereInput | null> {
  if (managesCalls(auth)) {
    return null;
  }

  const staffAudits = await db.auditLog.findMany({
    where: {
      organizationId: auth.organizationId,
      actorUserId: auth.userId,
      targetType: 'Call',
    },
    select: { targetId: true },
  });

  const auditedCallIds = staffAudits
    .map((a) => a.targetId)
    .filter((id): id is string => Boolean(id));

  const outboundCondition: Prisma.CallWhereInput = {
    direction: 'outbound',
    OR: [
      ...(auditedCallIds.length > 0 ? [{ id: { in: auditedCallIds } }] : []),
      { assignedToId: auth.userId },
      {
        requestedParams: {
          path: ['actorUserId'],
          equals: auth.userId,
        },
      },
    ],
  };

  const inboundAttendedCondition: Prisma.CallWhereInput = {
    direction: 'inbound',
    assignedToId: auth.userId,
    OR: [
      { agentAnsweredAt: { not: null } },
      { agentOutcome: 'answered' },
    ],
  };

  return {
    OR: [outboundCondition, inboundAttendedCondition],
  };
}
