type PhoneMember = {
  role: string; receivesLeads: boolean; availableForLeads: boolean; voiceBusy: boolean;
  voiceEndpoint: unknown; voicePresenceAt: Date | null; user: { status: string };
};

export function phoneUnavailableReason(member: PhoneMember | null, requireRotation = false) {
  if (!member) return 'Staff membership not found';
  if (member.user.status !== 'active') return 'Staff account is disabled';
  if (!['owner', 'admin', 'operator', 'sales'].includes(member.role)) return 'Staff role cannot receive calls';
  if (!member.availableForLeads) return 'Available is switched off in Sales rotation';
  if (requireRotation && !member.receivesLeads) return 'Receives leads is switched off in Sales rotation';
  if (!member.voiceEndpoint) return 'Browser phone has not been configured';
  if (!member.voicePresenceAt || member.voicePresenceAt.getTime() < Date.now() - 60_000) return 'Browser phone is offline or its presence has expired';
  if (member.voiceBusy) return 'Staff browser is busy or has a reserved incoming call';
  return null;
}

export function phoneReadiness(member: PhoneMember) {
  const reason = phoneUnavailableReason(member);
  return { canReceiveAssignedCalls: !reason, canReceiveNewCalls: !reason && member.receivesLeads,
    reason: reason || (member.receivesLeads ? 'Ready for incoming calls' : 'Ready for assigned enquiries only; Receives leads is switched off'),
    available: member.availableForLeads, receivesLeads: member.receivesLeads, busy: member.voiceBusy };
}
