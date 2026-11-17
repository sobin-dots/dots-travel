import type { AuthContext } from '@/lib/api-auth';

export function managesLeads(auth: Pick<AuthContext, 'role'>) {
  return auth.role === 'owner' || auth.role === 'admin';
}

export function leadScope(auth: AuthContext) {
  return { organizationId: auth.organizationId, ...(!managesLeads(auth) ? { assignedToId: auth.userId } : {}) };
}
