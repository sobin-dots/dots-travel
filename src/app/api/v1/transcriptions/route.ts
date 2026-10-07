import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-auth';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const { auth, errorResponse } = await authenticateRequest(req, 'viewer');
  if (errorResponse) return errorResponse;

  const url = new URL(req.url);
  const search = url.searchParams.get('q') || undefined;
  const status = url.searchParams.get('status') || undefined;
  const limit = Math.min(Number(url.searchParams.get('limit') || '20'), 50);
  const offset = Number(url.searchParams.get('offset') || '0');

  const where: any = { organizationId: auth!.organizationId };
  if (status) where.status = status;
  if (search) {
    where.text = { contains: search, mode: 'insensitive' };
  }

  const [transcriptions, totalCount] = await Promise.all([
    db.transcription.findMany({
      where,
      include: {
        recording: true,
        call: {
          select: {
            id: true,
            plivoCallUuid: true,
            from: true,
            to: true,
            startedAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    db.transcription.count({ where }),
  ]);

  return NextResponse.json({
    api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
    totalCount,
    limit,
    offset,
    objects: transcriptions,
  });
}
