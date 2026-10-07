import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-auth';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const { auth, errorResponse } = await authenticateRequest(req, 'viewer');
  if (errorResponse) return errorResponse;

  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get('limit') || '30'), 50);
  const offset = Number(url.searchParams.get('offset') || '0');

  const [threads, totalCount] = await Promise.all([
    db.messageThread.findMany({
      where: { organizationId: auth!.organizationId },
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { lastMessageAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    db.messageThread.count({ where: { organizationId: auth!.organizationId } }),
  ]);

  const objects = threads.map((t) => ({
    id: t.id,
    ownNumberE164: t.ownNumberE164,
    counterpartE164: t.counterpartE164,
    lastMessageAt: t.lastMessageAt,
    unreadCount: t.unreadCount,
    lastMessage: t.messages[0] || null,
  }));

  return NextResponse.json({
    api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
    totalCount,
    limit,
    offset,
    objects,
  });
}
