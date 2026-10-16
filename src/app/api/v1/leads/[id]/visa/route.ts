import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { authenticateRequest, logAuditEvent } from '@/lib/api-auth';

export const runtime = 'nodejs';

// P2-20: Visa Document Checklist Generator & Tracker
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { auth, errorResponse } = await authenticateRequest(req, 'operator');
  if (errorResponse) return errorResponse;

  const { id: leadId } = await params;

  try {
    const lead = await db.lead.findFirst({
      where: { id: leadId, organizationId: auth!.organizationId },
    });

    if (!lead) {
      return NextResponse.json({ api_id: 'not_found', error: 'Lead not found' }, { status: 404 });
    }

    let checklist = await db.visaRequirement.findMany({
      where: { leadId, organizationId: auth!.organizationId },
      orderBy: { createdAt: 'asc' },
    });

    // Auto-generate destination-specific visa checklist if none exist yet
    if (checklist.length === 0) {
      const dest = (lead.destination || '').toLowerCase();
      let countryIso = 'AE'; // default UAE
      let defaultDocs = [
        { documentName: 'Valid Passport (6+ Months Validity)', description: 'Color scanned copy of passport biographical page', mandatory: true },
        { documentName: 'Passport Sized Color Photographs', description: 'Recent 35x45mm white background photographs', mandatory: true },
        { documentName: 'Proof of Accommodation & Hotel Voucher', description: 'Official hotel reservation voucher for the full duration', mandatory: true },
        { documentName: 'Confirmed Return Flight Ticket', description: 'Confirmed return or onward flight booking with PNR', mandatory: true },
      ];

      if (dest.includes('france') || dest.includes('paris') || dest.includes('italy') || dest.includes('switzerland') || dest.includes('schengen')) {
        countryIso = 'FR';
        defaultDocs.push(
          { documentName: 'Travel Medical Insurance (EUR 30,000+)', description: 'Valid Schengen travel insurance covering emergency hospitalization and repatriation', mandatory: true },
          { documentName: 'Bank Statements (Past 3 Months)', description: 'Stamped personal bank statements showing sufficient funds', mandatory: true }
        );
      } else if (dest.includes('japan') || dest.includes('tokyo')) {
        countryIso = 'JP';
        defaultDocs.push(
          { documentName: 'Japan eVisa Application Form', description: 'Signed tourist visa application with travel schedule', mandatory: true },
          { documentName: 'Income Tax Return / Proof of Solvency', description: 'Recent tax assessment certificate or financial statement', mandatory: false }
        );
      } else if (dest.includes('dubai') || dest.includes('uae')) {
        countryIso = 'AE';
        defaultDocs.push(
          { documentName: 'UAE 30-Day Single Entry Tourist Visa Form', description: 'Standard immigration tourist entry clearance form', mandatory: true }
        );
      }

      await db.visaRequirement.createMany({
        data: defaultDocs.map((doc) => ({
          organizationId: auth!.organizationId,
          leadId,
          countryIso,
          documentName: doc.documentName,
          description: doc.description,
          mandatory: doc.mandatory,
          status: 'pending',
        })),
      });

      checklist = await db.visaRequirement.findMany({
        where: { leadId, organizationId: auth!.organizationId },
        orderBy: { createdAt: 'asc' },
      });
    }

    const verifiedCount = checklist.filter((d) => d.status === 'verified').length;
    const pendingCount = checklist.filter((d) => d.status === 'pending').length;
    const completenessPercentage = checklist.length > 0 ? Math.round((verifiedCount / checklist.length) * 100) : 0;

    return NextResponse.json({
      api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
      leadId,
      destination: lead.destination,
      totalDocuments: checklist.length,
      verifiedCount,
      pendingCount,
      completenessPercentage,
      checklist,
    });
  } catch (err: any) {
    console.error('Error fetching visa requirements:', err);
    return NextResponse.json(
      { api_id: 'server_err', error: err.message || 'Internal error fetching visa checklist' },
      { status: 500 }
    );
  }
}

// Update Document Status or Add Custom Visa Requirement
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { auth, errorResponse } = await authenticateRequest(req, 'operator');
  if (errorResponse) return errorResponse;

  const { id: leadId } = await params;

  try {
    const body = await req.json();
    const { requirementId, status, reviewNotes, documentName, description, mandatory = true } = body;

    const lead = await db.lead.findFirst({
      where: { id: leadId, organizationId: auth!.organizationId },
    });

    if (!lead) {
      return NextResponse.json({ api_id: 'not_found', error: 'Lead not found' }, { status: 404 });
    }

    // Update existing document status
    if (requirementId) {
      const existing = await db.visaRequirement.findFirst({
        where: { id: requirementId, leadId, organizationId: auth!.organizationId },
      });

      if (!existing) {
        return NextResponse.json({ api_id: 'not_found', error: 'Visa requirement document not found' }, { status: 404 });
      }

      const updated = await db.visaRequirement.update({
        where: { id: requirementId },
        data: {
          status: status || existing.status,
          reviewNotes: reviewNotes !== undefined ? reviewNotes : existing.reviewNotes,
          verifiedAt: status === 'verified' ? new Date() : existing.verifiedAt,
          submittedAt: status === 'submitted' ? new Date() : existing.submittedAt,
        },
      });

      await logAuditEvent({
        organizationId: auth!.organizationId,
        actorUserId: auth!.userId,
        action: 'visa.update_status',
        targetType: 'VisaRequirement',
        targetId: requirementId,
        metadata: { leadId, document: existing.documentName, newStatus: status },
      });

      return NextResponse.json({
        api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
        requirement: updated,
        message: `Visa document ${existing.documentName} status updated to ${status}`,
      });
    }

    // Add new document
    if (!documentName) {
      return NextResponse.json({ api_id: 'val_err', error: 'documentName is required' }, { status: 400 });
    }

    const created = await db.visaRequirement.create({
      data: {
        organizationId: auth!.organizationId,
        leadId,
        countryIso: 'INTL',
        documentName,
        description: description || null,
        mandatory: Boolean(mandatory),
        status: 'pending',
      },
    });

    return NextResponse.json({
      api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
      requirement: created,
      message: 'Visa document requirement added successfully',
    }, { status: 201 });
  } catch (err: any) {
    console.error('Error modifying visa requirements:', err);
    return NextResponse.json(
      { api_id: 'server_err', error: err.message || 'Internal error modifying visa requirements' },
      { status: 500 }
    );
  }
}
