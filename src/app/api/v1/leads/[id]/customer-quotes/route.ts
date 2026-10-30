import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { authenticateRequest, logAuditEvent } from '@/lib/api-auth';

export const runtime = 'nodejs';

// P2-03, P2-04, P2-07, P2-09: Pricing & Margin Engine, Final Customer Selling Price, Versioning
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

    const quotes = await db.customerQuotation.findMany({
      where: { leadId, organizationId: auth!.organizationId },
      orderBy: { version: 'desc' },
    });

    // Compute version diffs if multiple versions exist (P2-09)
    const quotesWithDiffs = quotes.map((q, idx) => {
      const prevQuote = quotes[idx + 1];
      const priceDelta = prevQuote
        ? Number(q.finalSellingPrice) - Number(prevQuote.finalSellingPrice)
        : 0;
      const marginDelta = prevQuote
        ? Number(q.marginAmount) - Number(prevQuote.marginAmount)
        : 0;

      return {
        ...q,
        supplierNetTotal: Number(q.supplierNetTotal),
        marginValue: Number(q.marginValue),
        marginAmount: Number(q.marginAmount),
        taxPercentage: Number(q.taxPercentage),
        taxAmount: Number(q.taxAmount),
        finalSellingPrice: Number(q.finalSellingPrice),
        floorGuardrailMin: Number(q.floorGuardrailMin),
        versionLabel: `v${q.version}`,
        diff: prevQuote
          ? {
              previousVersion: prevQuote.version,
              priceDelta: Number(priceDelta.toFixed(2)),
              marginDelta: Number(marginDelta.toFixed(2)),
              hasChanged: priceDelta !== 0 || marginDelta !== 0,
            }
          : null,
      };
    });

    return NextResponse.json({
      api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
      quotations: quotesWithDiffs,
      latestVersion: quotes[0]?.version || 0,
    });
  } catch (err: any) {
    console.error('Error fetching customer quotations:', err);
    return NextResponse.json(
      { api_id: 'server_err', error: err.message || 'Internal error fetching customer quotations' },
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
      supplierNetTotal,
      marginType = 'percentage', // percentage | fixed_dollar
      marginValue = 15.0,
      taxPercentage = 5.0,
      floorGuardrailMin = 10.0,
      approvalNote,
      snapshotJson,
      validUntil,
    } = body;

    const netCost = Number(supplierNetTotal);
    if (isNaN(netCost) || netCost < 0) {
      return NextResponse.json(
        { api_id: 'val_err', error: 'Valid supplierNetTotal is required' },
        { status: 400 }
      );
    }

    const lead = await db.lead.findFirst({
      where: { id: leadId, organizationId: auth!.organizationId },
    });

    if (!lead) {
      return NextResponse.json({ api_id: 'not_found', error: 'Lead not found' }, { status: 404 });
    }

    // Dynamic Price Calculation formula (P2-04)
    const mType = marginType === 'fixed_dollar' ? 'fixed_dollar' : 'percentage';
    const mVal = Number(marginValue);
    const taxPct = Number(taxPercentage) || 0;
    const floorMin = Number(floorGuardrailMin) || 10.0;

    let marginAmount = 0;
    let effectiveMarginPct = 0;

    if (mType === 'percentage') {
      marginAmount = (netCost * mVal) / 100;
      effectiveMarginPct = mVal;
    } else {
      marginAmount = mVal;
      effectiveMarginPct = netCost > 0 ? (marginAmount / netCost) * 100 : 0;
    }

    // Floor Guardrail check (P2-03)
    const isApproved = effectiveMarginPct >= floorMin;

    const subtotal = netCost + marginAmount;
    const taxAmount = (subtotal * taxPct) / 100;
    const finalSellingPrice = subtotal + taxAmount;

    // Calculate next version number (P2-09)
    const latestQuote = await db.customerQuotation.findFirst({
      where: { leadId, organizationId: auth!.organizationId },
      orderBy: { version: 'desc' },
    });

    const nextVersion = (latestQuote?.version || 0) + 1;

    // Mark previous quote as revised if existing
    if (latestQuote && latestQuote.status === 'draft') {
      await db.customerQuotation.update({
        where: { id: latestQuote.id },
        data: { status: 'revised' },
      });
    }

    const createdQuote = await db.customerQuotation.create({
      data: {
        organizationId: auth!.organizationId,
        leadId,
        version: nextVersion,
        status: 'draft',
        currency: body.currency || 'INR',
        supplierNetTotal: netCost,
        marginType: mType,
        marginValue: mVal,
        marginAmount: Number(marginAmount.toFixed(2)),
        taxPercentage: taxPct,
        taxAmount: Number(taxAmount.toFixed(2)),
        finalSellingPrice: Number(finalSellingPrice.toFixed(2)),
        floorGuardrailMin: floorMin,
        marginApproved: isApproved,
        approvalNote: isApproved
          ? approvalNote || null
          : approvalNote || `Margin (${effectiveMarginPct.toFixed(1)}%) below required floor guardrail (${floorMin}%). Requires managerial override.`,
        snapshotJson: snapshotJson || null,
        validUntil: validUntil ? new Date(validUntil) : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      },
    });

    // Synchronize Lead targetBudget with the generated customer quotation finalSellingPrice
    await db.lead.update({
      where: { id: leadId },
      data: {
        targetBudget: Number(finalSellingPrice.toFixed(2)),
        ...(lead.stage === 'new_inquiry' ? { stage: 'quote_prep' } : {}),
      },
    });

    await logAuditEvent({
      organizationId: auth!.organizationId,
      actorUserId: auth!.userId,
      action: 'customer_quotation.create',
      targetType: 'CustomerQuotation',
      targetId: createdQuote.id,
      metadata: {
        leadId,
        version: nextVersion,
        netCost,
        finalSellingPrice: Number(finalSellingPrice.toFixed(2)),
        marginAmount: Number(marginAmount.toFixed(2)),
        marginApproved: isApproved,
      },
    });

    return NextResponse.json(
      {
        api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
        quotation: {
          ...createdQuote,
          supplierNetTotal: Number(createdQuote.supplierNetTotal),
          marginValue: Number(createdQuote.marginValue),
          marginAmount: Number(createdQuote.marginAmount),
          taxPercentage: Number(createdQuote.taxPercentage),
          taxAmount: Number(createdQuote.taxAmount),
          finalSellingPrice: Number(createdQuote.finalSellingPrice),
          floorGuardrailMin: Number(createdQuote.floorGuardrailMin),
        },
        formulaBreakdown: {
          supplierNetCost: netCost,
          marginType: mType,
          marginValue: mVal,
          marginAmount: Number(marginAmount.toFixed(2)),
          subtotalBeforeTax: Number(subtotal.toFixed(2)),
          taxPercentage: taxPct,
          taxAmount: Number(taxAmount.toFixed(2)),
          finalSellingPrice: Number(finalSellingPrice.toFixed(2)),
          effectiveMarginPercentage: Number(effectiveMarginPct.toFixed(1)),
          floorGuardrailMin: floorMin,
          marginApproved: isApproved,
        },
        message: `Quotation v${nextVersion} calculated successfully`,
      },
      { status: 201 }
    );
  } catch (err: any) {
    console.error('Error creating customer quotation:', err);
    return NextResponse.json(
      { api_id: 'server_err', error: err.message || 'Internal error creating customer quotation' },
      { status: 500 }
    );
  }
}
