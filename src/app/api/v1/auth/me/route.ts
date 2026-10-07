import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-auth';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const { auth, errorResponse } = await authenticateRequest(req, 'viewer');
  if (errorResponse) return errorResponse;

  const user = await db.user.findUnique({
    where: { id: auth!.userId },
    select: {
      id: true,
      email: true,
      name: true,
      mfaEnabled: true,
      status: true,
      lastLoginAt: true,
    },
  });

  const org = await db.organization.findUnique({
    where: { id: auth!.organizationId },
    select: {
      id: true,
      name: true,
      slug: true,
      transcriptionDefaultEnabled: true,
      transcriptionLanguage: true,
      recordingRetentionDays: true,
      notificationEmail: true,
      redactMessageContent: true,
    },
  });

  return NextResponse.json({
    api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
    user,
    organization: org,
    role: auth!.role,
  });
}
