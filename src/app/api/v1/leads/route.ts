import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-auth';

export const runtime = 'nodejs';

// GET /api/v1/leads - List all leads
export async function GET(req: NextRequest) {
  const { auth, errorResponse } = await authenticateRequest(req, 'operator');
  if (errorResponse) return errorResponse;

  const leads = await db.lead.findMany({
    where: { organizationId: auth!.organizationId },
    include: {
      contact: true,
      supplier: true,
      call: {
        include: {
          recordings: true,
          transcriptions: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({
    api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
    objects: leads,
    totalCount: leads.length,
  });
}
