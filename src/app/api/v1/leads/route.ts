import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-auth';
import { leadScope } from '@/lib/lead-access';
import { createEnquiry } from '@/lib/lead-intake/service';
import { enquirySchema } from '@/lib/lead-intake/normalize';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// GET /api/v1/leads - List all leads
export async function GET(req: NextRequest) {
  const { auth, errorResponse } = await authenticateRequest(req, 'operator');
  if (errorResponse) return errorResponse;

  // Auto-sync unlinked contacts into leads so historical manual enquiries display in Sales Cockpit & Leads
  const unlinkedContacts = await db.contact.findMany({
    where: {
      organizationId: auth!.organizationId,
      leads: { none: {} },
    },
    take: 50,
  });

  if (unlinkedContacts.length > 0) {
    const org = await db.organization.findUnique({
      where: { id: auth!.organizationId },
      select: { firstContactMinutes: true },
    });
    const firstContactMinutes = org?.firstContactMinutes ?? 30;

    for (const contact of unlinkedContacts) {
      const sourceTag = contact.tags?.find(t => t.toLowerCase().startsWith('source:'));
      const sourceName = sourceTag
        ? sourceTag.slice(7).trim().split(/[_\s-]+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
        : 'Direct';
      const createdDate = contact.createdAt || new Date();

      await db.lead.create({
        data: {
          organizationId: contact.organizationId,
          contactId: contact.id,
          title: `${contact.name} — ${contact.city || contact.tourType || 'Travel enquiry'}`,
          destination: contact.city || null,
          source: sourceName,
          formName: sourceName,
          stage: contact.enquiryStatus || 'new_inquiry',
          temperature: contact.enquiryTag || 'warm',
          tags: contact.tags,
          assignedToId: contact.assignedToId,
          assignedAt: contact.assignedAt,
          customerEmail: contact.email || null,
          itinerary: '',
          status: 'draft',
          createdAt: createdDate,
          headcountChildren: contact.numberOfChildren ?? 0,
          specialRequests: contact.specialRequirements || null,
          firstContactDueAt: new Date(createdDate.getTime() + firstContactMinutes * 60_000),
          metadata: {
            customerName: contact.name,
            customerPhone: contact.phone || null,
            enquiryNotes: contact.notes || null,
            contactTravelPreferences: {
              preferredTravelMonth: contact.preferredTravelMonth ?? null,
              tourType: contact.tourType ?? null,
              numberOfChildren: contact.numberOfChildren ?? null,
              specialRequirements: contact.specialRequirements ?? null,
              city: contact.city ?? null,
            },
          },
        },
      }).catch(err => {
        console.error('Failed to auto-backfill lead for contact:', contact.id, err);
      });
    }
  }

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
  }, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}

export async function POST(req: NextRequest) {
  const { auth, errorResponse } = await authenticateRequest(req, 'admin'); if (errorResponse) return errorResponse;
  const body = await req.json().catch(() => null);
  const parsed = enquirySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  const customSource = typeof body?.source === 'string' && body.source.trim() ? body.source.trim() : 'manual';
  const lead = await db.$transaction(async tx => {
    const created = await createEnquiry(tx, auth!.organizationId, customSource, parsed.data);
    await tx.auditLog.create({ data: { organizationId: auth!.organizationId, actorUserId: auth!.userId, action: 'lead.create', targetType: 'Lead', targetId: created.id } });
    return created;
  });
  return NextResponse.json({ lead }, { status: 201 });
}
