import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-auth';

export const runtime = 'nodejs';

// Fetch Automation Cadences & Drip Logs for Lead (P2-13, P2-14, P2-15, P2-16)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { auth, errorResponse } = await authenticateRequest(req, 'operator');
  if (errorResponse) return errorResponse;

  const { id: leadId } = await params;

  try {
    const logs = await db.automationLog.findMany({
      where: { leadId, organizationId: auth!.organizationId },
      orderBy: { scheduledFor: 'asc' },
    });

    return NextResponse.json({
      api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
      leadId,
      totalCount: logs.length,
      automations: logs,
    });
  } catch (err: any) {
    console.error('Error fetching lead automations:', err);
    return NextResponse.json(
      { api_id: 'server_err', error: err.message || 'Internal error fetching lead automations' },
      { status: 500 }
    );
  }
}
