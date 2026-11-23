import { describe, expect, it } from 'vitest';
import {
  canAccessCallRecord,
  getAttendedStaffUserId,
  getCallActorUserId,
  managesCalls,
} from '@/lib/call-access';
import type { AuthContext } from '@/lib/api-auth';

describe('Call and Recording Access Control (SRP / DRY)', () => {
  const adminAuth: AuthContext = {
    userId: 'user-admin',
    email: 'admin@travel.test',
    organizationId: 'org-1',
    role: 'admin',
  };

  const salesAuth: AuthContext = {
    userId: 'user-sales-1',
    email: 'sales1@travel.test',
    organizationId: 'org-1',
    role: 'sales',
  };

  const otherSalesAuth: AuthContext = {
    userId: 'user-sales-2',
    email: 'sales2@travel.test',
    organizationId: 'org-1',
    role: 'sales',
  };

  describe('managesCalls', () => {
    it('grants full management only to owners and admins', () => {
      expect(managesCalls({ role: 'owner' })).toBe(true);
      expect(managesCalls({ role: 'admin' })).toBe(true);
      expect(managesCalls({ role: 'sales' })).toBe(false);
      expect(managesCalls({ role: 'operator' })).toBe(false);
      expect(managesCalls({ role: 'viewer' })).toBe(false);
    });
  });

  describe('getCallActorUserId', () => {
    it('extracts actorUserId from requestedParams', () => {
      expect(getCallActorUserId({ requestedParams: { actorUserId: 'user-sales-1' } })).toBe('user-sales-1');
      expect(getCallActorUserId({ requestedParams: null })).toBeNull();
      expect(getCallActorUserId({})).toBeNull();
      expect(getCallActorUserId({ requestedParams: { otherKey: 123 } })).toBeNull();
    });
  });

  describe('getAttendedStaffUserId', () => {
    it('resolves actor or assignedToId for outbound calls', () => {
      expect(
        getAttendedStaffUserId({
          direction: 'outbound',
          requestedParams: { actorUserId: 'user-sales-1' },
        })
      ).toBe('user-sales-1');

      expect(
        getAttendedStaffUserId({
          direction: 'outbound',
          assignedToId: 'user-sales-1',
        })
      ).toBe('user-sales-1');
    });

    it('resolves assigned staff only when inbound call was attended/answered', () => {
      // Inbound answered with agentAnsweredAt
      expect(
        getAttendedStaffUserId({
          direction: 'inbound',
          assignedToId: 'user-sales-1',
          agentAnsweredAt: new Date(),
        })
      ).toBe('user-sales-1');

      // Inbound answered with agentOutcome: 'answered'
      expect(
        getAttendedStaffUserId({
          direction: 'inbound',
          assignedToId: 'user-sales-1',
          agentOutcome: 'answered',
        })
      ).toBe('user-sales-1');

      // Inbound missed or declined returns null
      expect(
        getAttendedStaffUserId({
          direction: 'inbound',
          assignedToId: 'user-sales-1',
          agentAnsweredAt: null,
          agentOutcome: 'missed',
        })
      ).toBeNull();

      expect(
        getAttendedStaffUserId({
          direction: 'inbound',
          assignedToId: 'user-sales-1',
          agentAnsweredAt: null,
          agentOutcome: null,
        })
      ).toBeNull();
    });
  });

  describe('canAccessCallRecord', () => {
    it('allows admin to access any call', () => {
      const anyCall = {
        direction: 'outbound',
        assignedToId: otherSalesAuth.userId,
      };
      expect(canAccessCallRecord(adminAuth, anyCall)).toBe(true);
    });

    it('allows sales person to access outbound calls they placed', () => {
      const myOutboundCall = {
        direction: 'outbound',
        requestedParams: { actorUserId: salesAuth.userId },
      };
      expect(canAccessCallRecord(salesAuth, myOutboundCall)).toBe(true);
    });

    it('blocks sales person from outbound calls placed by others', () => {
      const othersOutboundCall = {
        direction: 'outbound',
        requestedParams: { actorUserId: otherSalesAuth.userId },
      };
      expect(canAccessCallRecord(salesAuth, othersOutboundCall)).toBe(false);
    });

    it('allows sales person to access inbound calls they answered/attended', () => {
      const myAttendedCall = {
        direction: 'inbound',
        assignedToId: salesAuth.userId,
        agentAnsweredAt: new Date(),
      };
      expect(canAccessCallRecord(salesAuth, myAttendedCall)).toBe(true);
    });

    it('blocks sales person from inbound calls answered by others or missed', () => {
      const othersAttendedCall = {
        direction: 'inbound',
        assignedToId: otherSalesAuth.userId,
        agentAnsweredAt: new Date(),
      };
      expect(canAccessCallRecord(salesAuth, othersAttendedCall)).toBe(false);

      const missedInboundCall = {
        direction: 'inbound',
        assignedToId: salesAuth.userId,
        agentAnsweredAt: null,
        agentOutcome: 'missed',
      };
      expect(canAccessCallRecord(salesAuth, missedInboundCall)).toBe(false);
    });
  });
});
