import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { authenticateRequest, logAuditEvent } from '@/lib/api-auth';

export const runtime = 'nodejs';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; quoteId: string }> }
) {
  const { auth, errorResponse } = await authenticateRequest(req, 'operator');
  if (errorResponse) return errorResponse;

  const { id: leadId, quoteId } = await params;

  try {
    const quote = await db.supplierQuotation.findFirst({
      where: { id: quoteId, leadId, organizationId: auth!.organizationId },
      include: { supplier: true },
    });

    if (!quote) {
      return NextResponse.json({ api_id: 'not_found', error: 'Supplier quotation not found' }, { status: 404 });
    }

    // Mark other quotes for this lead as under_review/rejected
    await db.supplierQuotation.updateMany({
      where: { leadId, organizationId: auth!.organizationId, id: { not: quoteId } },
      data: { status: 'rejected' },
    });

    // Mark this quote as selected
    const updatedQuote = await db.supplierQuotation.update({
      where: { id: quoteId },
      data: { status: 'selected' },
      include: { supplier: true, lineItems: true },
    });

    // Sync selected supplier on lead
    await db.lead.update({
      where: { id: leadId },
      data: { selectedSupplierId: quote.supplierId },
    });

    await logAuditEvent({
      organizationId: auth!.organizationId,
      actorUserId: auth!.userId,
      action: 'supplier_quotation.select',
      targetType: 'SupplierQuotation',
      targetId: quoteId,
      metadata: { leadId, supplierName: quote.supplier.name, netCost: Number(quote.totalNetCost) },
    });

    return NextResponse.json({
      api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
      quote: updatedQuote,
      message: `Quotation from ${quote.supplier.name} selected as winning procurement quote`,
    });
  } catch (err: any) {
    console.error('Error selecting supplier quotation:', err);
    return NextResponse.json(
      { api_id: 'server_err', error: err.message || 'Internal error selecting supplier quotation' },
      { status: 500 }
    );
  }
}
