import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { authenticateRequest, logAuditEvent } from '@/lib/api-auth';

export const runtime = 'nodejs';

// P2-01: Receive and Capture Supplier Quotations with line-item breakdowns
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

    const quotes = await db.supplierQuotation.findMany({
      where: { leadId, organizationId: auth!.organizationId },
      include: {
        supplier: true,
        lineItems: {
          orderBy: [{ dayNumber: 'asc' }, { createdAt: 'asc' }],
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
      quotes,
    });
  } catch (err: any) {
    console.error('Error fetching supplier quotations:', err);
    return NextResponse.json(
      { api_id: 'server_err', error: err.message || 'Internal error fetching supplier quotations' },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { auth, errorResponse } = await authenticateRequest(req, 'operator');
  if (errorResponse) return errorResponse;

  const { id: leadId } = await params;

  try {
    const body = await req.json();
    const {
      supplierId,
      quoteReference,
      currency = 'USD',
      totalNetCost,
      cancellationPolicy,
      inclusions = [],
      exclusions = [],
      hotelTier,
      roomCategory,
      validUntil,
      lineItems = [],
      status = 'received',
    } = body;

    if (!supplierId || totalNetCost === undefined || totalNetCost === null) {
      return NextResponse.json(
        { api_id: 'val_err', error: 'supplierId and totalNetCost are required' },
        { status: 400 }
      );
    }

    const lead = await db.lead.findFirst({
      where: { id: leadId, organizationId: auth!.organizationId },
    });

    if (!lead) {
      return NextResponse.json({ api_id: 'not_found', error: 'Lead not found' }, { status: 404 });
    }

    const supplier = await db.supplier.findFirst({
      where: { id: supplierId, organizationId: auth!.organizationId },
    });

    if (!supplier) {
      return NextResponse.json({ api_id: 'not_found', error: 'Supplier not found' }, { status: 404 });
    }

    const createdQuote = await db.supplierQuotation.create({
      data: {
        organizationId: auth!.organizationId,
        leadId,
        supplierId,
        quoteReference: quoteReference || `RFQ-${Date.now().toString().slice(-6)}`,
        currency,
        totalNetCost: Number(totalNetCost),
        cancellationPolicy: cancellationPolicy || null,
        inclusions: Array.isArray(inclusions) ? inclusions : [],
        exclusions: Array.isArray(exclusions) ? exclusions : [],
        hotelTier: hotelTier || null,
        roomCategory: roomCategory || null,
        validUntil: validUntil ? new Date(validUntil) : null,
        status,
        lineItems: {
          create: lineItems.map((item: any) => ({
            category: item.category || 'accommodation',
            description: item.description,
            dayNumber: item.dayNumber ? Number(item.dayNumber) : null,
            quantity: item.quantity ? Number(item.quantity) : 1,
            unitCost: Number(item.unitCost || 0),
            totalCost: Number(item.totalCost || item.unitCost || 0),
          })),
        },
      },
      include: {
        supplier: true,
        lineItems: true,
      },
    });

    await logAuditEvent({
      organizationId: auth!.organizationId,
      actorUserId: auth!.userId,
      action: 'supplier_quotation.create',
      targetType: 'SupplierQuotation',
      targetId: createdQuote.id,
      metadata: { leadId, supplierName: supplier.name, totalNetCost },
    });

    return NextResponse.json(
      {
        api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
        quote: createdQuote,
        message: 'Supplier quotation recorded successfully with line-item breakdowns',
      },
      { status: 201 }
    );
  } catch (err: any) {
    console.error('Error creating supplier quotation:', err);
    return NextResponse.json(
      { api_id: 'server_err', error: err.message || 'Internal error creating supplier quotation' },
      { status: 500 }
    );
  }
}
