import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken } from './auth-tokens';
import { db } from './db';

export interface AuthContext {
  userId: string;
  email: string;
  organizationId: string;
  role: 'owner' | 'admin' | 'operator' | 'sales' | 'viewer';
}

const ROLE_RANK: Record<string, number> = {
  viewer: 1,
  operator: 2,
  sales: 2,
  admin: 3,
  owner: 4,
};

/**
 * Normalizes role so that 'sales' and 'operator' are interchangeable/mapped.
 */
export function normalizeRole(role: string): string {
  if (role === 'operator') return 'sales';
  return role;
}

/**
 * Extracts Bearer token from incoming HTTP Request and verifies the caller's session.
 * Never requires cookies, ensuring 100% mobile and external API compatibility.
 */
export async function authenticateRequest(
  req: Request | NextRequest,
  requiredRole: 'viewer' | 'operator' | 'sales' | 'admin' | 'owner' = 'viewer'
): Promise<{ auth?: AuthContext; errorResponse?: NextResponse }> {
  let token: string | null = null;
  const authHeader = req.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else {
    try {
      const url = new URL(req.url);
      token = url.searchParams.get('token') || url.searchParams.get('access_token');
    } catch {}
  }

  if (!token) {
    return {
      errorResponse: NextResponse.json(
        { api_id: 'auth_err', error: 'Missing or malformed Authorization header. Bearer token required.' },
        { status: 401 }
      ),
    };
  }
  const payload = await verifyAccessToken(token);

  if (!payload) {
    return {
      errorResponse: NextResponse.json(
        { api_id: 'auth_err', error: 'Invalid or expired access token.' },
        { status: 401 }
      ),
    };
  }

  // Verify user and organization membership in database
  const membership = await db.membership.findUnique({
    where: {
      organizationId_userId: {
        organizationId: payload.organizationId,
        userId: payload.userId,
      },
    },
    include: {
      user: true,
    },
  });

  if (!membership || membership.user.status !== 'active') {
    return {
      errorResponse: NextResponse.json(
        { api_id: 'auth_err', error: 'User account or organization access is disabled.' },
        { status: 403 }
      ),
    };
  }

  const userRole = (membership.role as AuthContext['role']) || 'viewer';
  const userRank = ROLE_RANK[userRole] || 0;
  const requiredRank = ROLE_RANK[requiredRole] || 0;

  if (userRank < requiredRank) {
    return {
      errorResponse: NextResponse.json(
        { api_id: 'auth_err', error: `Insufficient permissions. Role '${requiredRole}' required.` },
        { status: 403 }
      ),
    };
  }

  // Apply ownership checks to every lead detail endpoint, including nested PDFs,
  // quotations and stage updates. List endpoints apply the same scope in their queries.
  const leadSegment = new URL(req.url).pathname.match(/^\/api\/v1\/leads\/([^/]+)(?:\/|$)/)?.[1];
  const leadId = leadSegment && !['pipeline', 'generate', 'extract-params'].includes(leadSegment) ? decodeURIComponent(leadSegment) : undefined;
  if (leadId && userRole !== 'owner' && userRole !== 'admin') {
    const lead = await db.lead.findFirst({ where: { id: leadId, organizationId: payload.organizationId, assignedToId: payload.userId }, select: { id: true } });
    if (!lead) return { errorResponse: NextResponse.json({ error: 'Lead not found' }, { status: 404 }) };
  }

  return {
    auth: {
      userId: payload.userId,
      email: payload.email,
      organizationId: payload.organizationId,
      role: userRole,
    },
  };
}

/**
 * Logs an append-only audit event for privileged operations.
 */
export async function logAuditEvent({
  organizationId,
  actorUserId,
  actorType = 'user',
  action,
  targetType,
  targetId,
  metadata,
  ip,
  userAgent,
  result = 'success',
}: {
  organizationId: string;
  actorUserId?: string;
  actorType?: string;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: any;
  ip?: string;
  userAgent?: string;
  result?: string;
}) {
  try {
    await db.auditLog.create({
      data: {
        organizationId,
        actorUserId,
        actorType,
        action,
        targetType,
        targetId,
        metadata,
        ip,
        userAgent,
        result,
      },
    });
  } catch (err) {
    console.error('Failed to record audit log:', err);
  }
}
