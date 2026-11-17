import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { db } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-auth';
import { processSubmission } from '@/lib/lead-intake/service';
import { equalSecret } from '@/lib/lead-intake/normalize';

export const runtime = 'nodejs';
export const maxDuration = 300;
export async function POST(req: NextRequest) {
  const workerSecret = process.env.LEAD_INTAKE_WORKER_SECRET;
  const isWorker = !!workerSecret && equalSecret(req.headers.get('authorization') || '', `Bearer ${workerSecret}`);
  let organizationId: string | undefined;
  if (!isWorker) {
    const { auth, errorResponse } = await authenticateRequest(req, 'admin'); if (errorResponse) return errorResponse;
    organizationId = auth!.organizationId;
  }
  const now = new Date();
  const due = await db.leadSubmission.findMany({ where: { organizationId, connection: { enabled: true }, OR: [
    { status: { in: ['pending', 'failed'] }, attempts: { lt: 8 }, nextAttemptAt: { lte: now } },
    { status: 'processing', claimedAt: { lt: new Date(now.getTime() - 5 * 60_000) } },
  ] }, orderBy: { nextAttemptAt: 'asc' }, take: 20, select: { id: true } });
  const started = Date.now(); let processed = 0;
  for (const row of due) {
    if (Date.now() - started > 240_000) break;
    await processSubmission(row.id); processed++;
  }
  // Failures always surface in the console. Email is real delivery only, never simulated.
  let alertsSent = 0;
  if (process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL) {
    const failures = await db.leadSubmission.findMany({ where: { organizationId, status: 'failed', alertedAt: null }, include: { organization: { select: { notificationEmail: true } }, connection: { select: { name: true } } }, take: 20 });
    for (const failure of failures) {
      if (!failure.organization.notificationEmail) continue;
      const claim = await db.leadSubmission.updateMany({ where: { id: failure.id, alertedAt: null }, data: { alertedAt: now } });
      if (!claim.count) continue;
      try {
        const result = await new Resend(process.env.RESEND_API_KEY).emails.send({ from: process.env.RESEND_FROM_EMAIL, to: failure.organization.notificationEmail,
          subject: `Lead import needs attention: ${failure.connection.name}`,
          text: `A lead import failed. Open Settings > Lead intake to review and retry it. Submission reference: ${failure.id}.` });
        if (result.error) throw new Error('Email delivery failed');
        alertsSent++;
      } catch { await db.leadSubmission.update({ where: { id: failure.id }, data: { alertedAt: null } }); }
    }
  }
  return NextResponse.json({ processed, alertsSent });
}
