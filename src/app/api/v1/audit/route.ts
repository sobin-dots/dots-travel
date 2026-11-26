import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-auth';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const { auth, errorResponse } = await authenticateRequest(req, 'admin');
  if (errorResponse) return errorResponse;

  const url = new URL(req.url);
  const pageParam = url.searchParams.get('page');
  const limitParam = url.searchParams.get('limit') || url.searchParams.get('pageSize');
  const limit = Math.min(Math.max(1, Number(limitParam || '50')), 100);
  const offsetParam = url.searchParams.get('offset');
  const page = pageParam ? Math.max(1, Number(pageParam)) : 1;
  const offset = offsetParam !== null ? Math.max(0, Number(offsetParam)) : (page - 1) * limit;

  const startDateParam = url.searchParams.get('startDate');
  const endDateParam = url.searchParams.get('endDate');
  const dateRange = url.searchParams.get('dateRange'); // 'all' | 'today' | '7d' | '30d' | 'custom'
  const action = url.searchParams.get('action');
  const search = url.searchParams.get('search')?.trim();

  const where: any = {};
  if (auth?.organizationId) {
    where.organizationId = auth.organizationId;
  }

  // Date filtering logic
  let start: Date | null = null;
  let end: Date | null = null;

  if (dateRange === 'today') {
    start = new Date();
    start.setHours(0, 0, 0, 0);
  } else if (dateRange === '7d') {
    start = new Date();
    start.setDate(start.getDate() - 7);
  } else if (dateRange === '30d') {
    start = new Date();
    start.setDate(start.getDate() - 30);
  } else if (startDateParam || endDateParam) {
    if (startDateParam) {
      const parsedStart = new Date(startDateParam);
      if (!Number.isNaN(parsedStart.getTime())) start = parsedStart;
    }
    if (endDateParam) {
      const parsedEnd = new Date(endDateParam);
      if (!Number.isNaN(parsedEnd.getTime())) end = parsedEnd;
    }
  }

  if (start || end) {
    where.createdAt = {};
    if (start) where.createdAt.gte = start;
    if (end) where.createdAt.lte = end;
  }

  if (action && action !== 'all') {
    where.action = { contains: action, mode: 'insensitive' };
  }

  if (search) {
    where.OR = [
      { action: { contains: search, mode: 'insensitive' } },
      { targetType: { contains: search, mode: 'insensitive' } },
      { actor: { email: { contains: search, mode: 'insensitive' } } },
      { actor: { name: { contains: search, mode: 'insensitive' } } },
    ];
  }

  const [logs, totalCount] = await Promise.all([
    db.auditLog.findMany({
      where,
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
    db.auditLog.count({ where }),
  ]);

  return NextResponse.json({
    api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
    totalCount,
    limit,
    offset,
    page,
    totalPages: Math.max(1, Math.ceil(totalCount / limit)),
    objects: logs,
  });
}
