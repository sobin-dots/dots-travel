import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-auth';
import { generateSignedMediaUrl } from '@/lib/media-urls';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const { auth, errorResponse } = await authenticateRequest(req, 'viewer');
  if (errorResponse) return errorResponse;

  const url = new URL(req.url);
  const callId = url.searchParams.get('callId') || undefined;
  const status = url.searchParams.get('status') || undefined;
  const limit = Math.min(Number(url.searchParams.get('limit') || '20'), 50);
  const offset = Number(url.searchParams.get('offset') || '0');

  const where: any = { organizationId: auth!.organizationId };
  if (callId) where.callId = callId;
  if (status) where.status = status;

  const [recordings, totalCount] = await Promise.all([
    db.recording.findMany({
      where,
      include: {
        call: {
          select: {
            id: true,
            plivoCallUuid: true,
            from: true,
            to: true,
            direction: true,
            startedAt: true,
          },
        },
        transcriptions: true,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    db.recording.count({ where }),
  ]);

  const items = recordings.map((rec) => ({
    ...rec,
    streamUrl: generateSignedMediaUrl(rec.id),
  }));

  return NextResponse.json({
    api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
    totalCount,
    limit,
    offset,
    objects: items,
  });
}
