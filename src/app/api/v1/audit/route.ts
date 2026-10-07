import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-auth';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const { auth, errorResponse } = await authenticateRequest(req, 'admin');
  if (errorResponse) return errorResponse;

  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get('limit') || '50'), 100);
  const offset = Number(url.searchParams.get('offset') || '0');

  const [logs, totalCount] = await Promise.all([
    db.auditLog.findMany({
      where: { organizationId: auth!.organizationId },
      include: {
        actor: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    db.auditLog.count({ where: { organizationId: auth!.organizationId } }),
  ]);

  return NextResponse.json({
    api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
    totalCount,
    limit,
    offset,
    objects: logs,
  });
}
