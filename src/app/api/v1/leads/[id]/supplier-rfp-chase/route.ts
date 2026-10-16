import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { authenticateRequest, logAuditEvent } from '@/lib/api-auth';
import { sendSupplierRfqEmail } from '@/lib/email';
import { generateItineraryPDF } from '@/lib/pdf-generator';

export const runtime = 'nodejs';

// P2-16: Supplier Follow-Up Automation (RFP Chasing before SLA breach)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { auth, errorResponse } = await authenticateRequest(req, 'operator');
  if (errorResponse) return errorResponse;

  const { id: leadId } = await params;

  try {
    const lead = await db.lead.findFirst({
      where: { id: leadId, organizationId: auth!.organizationId },
      include: {
        supplier: true,
        organization: true,
        supplierQuotations: true,
      },
    });

    if (!lead) {
      return NextResponse.json({ api_id: 'not_found', error: 'Lead not found' }, { status: 404 });
    }

    const suppliersToRemind = [];
    if (lead.supplier) {
      suppliersToRemind.push(lead.supplier);
    } else {
      // Find all partner suppliers
      const allSuppliers = await db.supplier.findMany({
        where: { organizationId: auth!.organizationId },
        take: 3,
      });
      suppliersToRemind.push(...allSuppliers);
    }

    const chaseResults = [];
    for (const sup of suppliersToRemind) {
      const pdfBytes = await generateItineraryPDF({
        title: `URGENT RFQ REMINDER: ${lead.title}`,
        recipientName: sup.name,
        recipientEmail: sup.email,
        recipientType: 'supplier',
        itineraryText: lead.itinerary,
        organizationName: lead.organization.name,
      });

      const res = await sendSupplierRfqEmail({
        to: sup.email,
        supplierName: sup.name,
        contactPerson: sup.contactPerson || undefined,
        customerName: 'Valued Client',
        title: `[SLA WARNING] Rate Quotation Outstanding: ${lead.title}`,
        destination: lead.destination || 'Curated Destination',
        pdfBuffer: pdfBytes,
      });

      const log = await db.automationLog.create({
        data: {
          organizationId: auth!.organizationId,
          leadId,
          type: 'supplier_chase',
          channel: 'email',
          scheduledFor: new Date(),
          executedAt: new Date(),
          status: 'sent',
          recipient: sup.email,
          payload: {
            supplierId: sup.id,
            supplierName: sup.name,
            reason: 'Outstanding RFP Rate Reminder prior to SLA Breach',
            emailResult: res,
          },
        },
      });

      chaseResults.push({
        supplierId: sup.id,
        supplierName: sup.name,
        email: sup.email,
        logId: log.id,
        status: 'sent',
      });
    }

    await logAuditEvent({
      organizationId: auth!.organizationId,
      actorUserId: auth!.userId,
      action: 'supplier.rfp_chase',
      targetType: 'Lead',
      targetId: leadId,
      metadata: { suppliersChasedCount: chaseResults.length },
    });

    return NextResponse.json({
      api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
      message: `Automated RFP reminders dispatched to ${chaseResults.length} supplier(s)`,
      suppliers: chaseResults,
    });
  } catch (err: any) {
    console.error('Error executing supplier RFP chase:', err);
    return NextResponse.json(
      { api_id: 'server_err', error: err.message || 'Internal error executing supplier RFP chase' },
      { status: 500 }
    );
  }
}
