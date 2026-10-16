import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-auth';

export const runtime = 'nodejs';

// P2-02: Compare Quotations from Multiple Suppliers (Side-by-side matrix)
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
        lineItems: true,
      },
      orderBy: { totalNetCost: 'asc' },
    });

    if (quotes.length === 0) {
      return NextResponse.json({
        api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
        matrix: {
          quotes: [],
          lowestCost: null,
          highestCost: null,
          recommendedQuoteId: null,
          comparisonFields: [],
        },
      });
    }

    const costs = quotes.map((q) => Number(q.totalNetCost));
    const lowestCost = Math.min(...costs);
    const highestCost = Math.max(...costs);
    const recommendedQuote = quotes[0]; // lowest cost by default

    // Format comparison items
    const matrixQuotes = quotes.map((q) => {
      const net = Number(q.totalNetCost);
      const deltaFromLowest = net - lowestCost;
      const deltaPercentage = lowestCost > 0 ? (deltaFromLowest / lowestCost) * 100 : 0;

      return {
        id: q.id,
        supplierId: q.supplierId,
        supplierName: q.supplier.name,
        category: q.supplier.category,
        quoteReference: q.quoteReference,
        currency: q.currency,
        totalNetCost: net,
        deltaFromLowest: Number(deltaFromLowest.toFixed(2)),
        deltaPercentage: Number(deltaPercentage.toFixed(1)),
        isLowestCost: net === lowestCost,
        isSelected: q.status === 'selected' || lead.selectedSupplierId === q.supplierId,
        hotelTier: q.hotelTier || 'Standard',
        roomCategory: q.roomCategory || 'Standard Room',
        inclusions: q.inclusions,
        exclusions: q.exclusions,
        cancellationPolicy: q.cancellationPolicy || 'Standard terms apply',
        lineItemsCount: q.lineItems.length,
        status: q.status,
        validUntil: q.validUntil,
        createdAt: q.createdAt,
      };
    });

    return NextResponse.json({
      api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
      matrix: {
        leadId,
        leadDestination: lead.destination,
        targetBudget: lead.targetBudget ? Number(lead.targetBudget) : null,
        totalQuotesCount: quotes.length,
        lowestCost,
        highestCost,
        recommendedQuoteId: recommendedQuote.id,
        quotes: matrixQuotes,
      },
    });
  } catch (err: any) {
    console.error('Error compiling quotation comparison matrix:', err);
    return NextResponse.json(
      { api_id: 'server_err', error: err.message || 'Internal error compiling quotation comparison matrix' },
      { status: 500 }
    );
  }
}
