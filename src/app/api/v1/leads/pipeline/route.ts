import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-auth';

export const runtime = 'nodejs';

// P2-17: Pipeline Kanban Aggregator
export async function GET(req: NextRequest) {
  const { auth, errorResponse } = await authenticateRequest(req, 'operator');
  if (errorResponse) return errorResponse;

  try {
    const leads = await db.lead.findMany({
      where: { organizationId: auth!.organizationId },
      include: {
        contact: true,
        supplier: true,
        quotations: {
          orderBy: { version: 'desc' },
          take: 1,
        },
        supplierQuotations: {
          orderBy: { createdAt: 'desc' },
        },
        tripFlights: true,
      },
      orderBy: { updatedAt: 'desc' },
    });

    const columns: Record<string, any[]> = {
      new_inquiry: [],
      quote_prep: [],
      quote_sent: [],
      negotiation: [],
      confirmed: [],
      lost: [],
    };

    let totalPipelineValue = 0;
    let wonValue = 0;

    for (const lead of leads) {
      const stage = columns[lead.stage] ? lead.stage : 'new_inquiry';
      const hasSupplierQuote = lead.supplierQuotations && lead.supplierQuotations.length > 0;
      const latestQuote = lead.quotations[0];
      const selectedSuppQuote =
        lead.supplierQuotations.find((q) => q.status === 'selected') || lead.supplierQuotations[0];

      // Only compute deal value after a quote from supplier is received
      const dealValue = hasSupplierQuote
        ? latestQuote
          ? Number(latestQuote.finalSellingPrice)
          : lead.targetBudget
          ? Number(lead.targetBudget)
          : selectedSuppQuote
          ? Number(selectedSuppQuote.totalNetCost)
          : 0
        : 0;

      if (stage !== 'lost') {
        totalPipelineValue += dealValue;
      }
      if (stage === 'confirmed' || lead.status === 'converted') {
        wonValue += dealValue;
      }

      const meta = (lead.metadata as any) || {};

      columns[stage].push({
        id: lead.id,
        title: lead.title,
        destination: lead.destination,
        contactName: lead.contact?.name || meta.customerName || 'Inquiry',
        contactPhone: lead.contact?.phone || meta.customerPhone,
        contactEmail: lead.customerEmail || lead.contact?.email,
        stage: lead.stage,
        dealValue: hasSupplierQuote ? dealValue : null,
        hasSupplierQuote,
        targetBudget: hasSupplierQuote && lead.targetBudget ? Number(lead.targetBudget) : null,
        durationDays: lead.durationDays || 5,
        partySize: (lead.headcountAdults || 2) + (lead.headcountChildren || 0),
        qualificationScore: meta.qualificationScore || 75,
        hotelTier: lead.hotelTier,
        departureDate: lead.departureDate,
        bookingReference: lead.bookingReference,
        hasFlights: lead.tripFlights.length > 0,
        quoteVersion: latestQuote?.version || null,
        updatedAt: lead.updatedAt,
      });
    }

    return NextResponse.json({
      api_id: `api_${crypto.randomBytes(8).toString('hex')}`,
      summary: {
        totalLeads: leads.length,
        totalPipelineValue,
        wonValue,
      },
      columns,
    });
  } catch (err: any) {
    console.error('Error fetching pipeline kanban:', err);
    return NextResponse.json(
      { api_id: 'server_err', error: err.message || 'Internal error fetching pipeline' },
      { status: 500 }
    );
  }
}
