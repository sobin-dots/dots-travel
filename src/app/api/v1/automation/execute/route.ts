import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-auth';
import { sendNotificationEmail } from '@/lib/email';

export const runtime = 'nodejs';

// Execution engine for due scheduled follow-up automations
export async function POST(req: NextRequest) {
  const { auth, errorResponse } = await authenticateRequest(req, 'operator');
  if (errorResponse) return errorResponse;

  try {
    const now = new Date();

    // Find all scheduled jobs that are due
    const dueJobs = await db.automationLog.findMany({
      where: {
        organizationId: auth!.organizationId,
        status: 'scheduled',
        scheduledFor: { lte: now },
      },
      take: 25,
    });

    const executionResults = [];

    for (const job of dueJobs) {
      try {
        const payload = (job.payload as any) || {};

        const res = await sendNotificationEmail({
          to: job.recipient,
          subject: payload.subject || 'Follow-Up from Travel Concierge',
          text: payload.message || 'Friendly travel check-in from your concierge.',
        });

        await db.automationLog.update({
          where: { id: job.id },
          data: {
            status: res.success ? 'sent' : 'failed',
            executedAt: new Date(),
            error: res.error || null,
          },
        });

        executionResults.push({ id: job.id, type: job.type, success: res.success });
      } catch (jobErr: any) {
        await db.automationLog.update({
          where: { id: job.id },
          data: {
            status: 'failed',
            executedAt: new Date(),
            error: jobErr.message || 'Execution error',
          },
        });
        executionResults.push({ id: job.id, type: job.type, success: false, error: jobErr.message });
      }
    }

    return NextResponse.json({
      api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
      executedCount: executionResults.length,
      jobs: executionResults,
    });
  } catch (err: any) {
    console.error('Error executing automation jobs:', err);
    return NextResponse.json(
      { api_id: 'server_err', error: err.message || 'Internal error executing automations' },
      { status: 500 }
    );
  }
}
