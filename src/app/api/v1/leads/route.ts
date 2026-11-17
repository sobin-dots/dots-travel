import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-auth';
import { leadScope } from '@/lib/lead-access';
import { createEnquiry } from '@/lib/lead-intake/service';
import { enquirySchema } from '@/lib/lead-intake/normalize';

export const runtime = 'nodejs';

// GET /api/v1/leads - List all leads
export async function GET(req: NextRequest) {
  const { auth, errorResponse } = await authenticateRequest(req, 'operator');
  if (errorResponse) return errorResponse;

  const leads = await db.lead.findMany({
    where: leadScope(auth!),
    include: {
      contact: true,
      assignedTo: { select: { id: true, name: true } },
      supplier: true,
      quotations: {
        orderBy: { version: 'desc' },
      },
      supplierQuotations: {
        include: { supplier: true },
        orderBy: { createdAt: 'desc' },
      },
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

export async function POST(req: NextRequest) {
  const { auth, errorResponse } = await authenticateRequest(req, 'admin'); if (errorResponse) return errorResponse;
  const parsed = enquirySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  const lead = await db.$transaction(async tx => {
    const created = await createEnquiry(tx, auth!.organizationId, 'manual', parsed.data);
    await tx.auditLog.create({ data: { organizationId: auth!.organizationId, actorUserId: auth!.userId, action: 'lead.create', targetType: 'Lead', targetId: created.id } });
    return created;
  });
  return NextResponse.json({ lead }, { status: 201 });
}
