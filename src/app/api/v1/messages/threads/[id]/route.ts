import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-auth';

export const runtime = 'nodejs';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { auth, errorResponse } = await authenticateRequest(req, 'viewer');
  if (errorResponse) return errorResponse;

  const { id } = await params;
  const thread = await db.messageThread.findFirst({
    where: { id, organizationId: auth!.organizationId },
    include: {
      messages: {
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!thread) {
    return NextResponse.json(
      { api_id: 'not_found', error: 'Message thread not found' },
      { status: 404 }
    );
  }

  // Reset unread count
  if (thread.unreadCount > 0) {
    await db.messageThread.update({
      where: { id },
      data: { unreadCount: 0 },
    });
  }

  return NextResponse.json({
    api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
    thread: {
      ...thread,
      unreadCount: 0,
    },
  });
}
