export type NumericValue = number | string | { toNumber(): number } | null | undefined;

export interface QuoteLike {
  version?: number | null;
  status?: string | null;
  marginAmount?: NumericValue;
  finalSellingPrice?: NumericValue;
}

export interface SupplierQuoteLike {
  status?: string | null;
  totalNetCost?: NumericValue;
}

export interface PipelineLeadLike {
  stage?: string | null;
  status?: string | null;
  quotations?: QuoteLike[] | null;
  supplierQuotations?: SupplierQuoteLike[] | null;
}

function toNumeric(value: NumericValue): number | null {
  if (value == null || (typeof value === 'string' && value.trim() === '')) return null;
  const num = typeof value === 'object' && 'toNumber' in value ? value.toNumber() : Number(value);
  return Number.isFinite(num) ? num : null;
}

/**
 * Selects the authoritative customer quotation for a lead: an accepted quote if present,
 * otherwise the highest-version non-cancelled/non-expired quotation.
 */
export function getActiveCustomerQuotation<T extends QuoteLike>(lead: { quotations?: T[] | null }): T | null {
  const quotes = Array.isArray(lead?.quotations) ? lead.quotations : [];
  if (quotes.length === 0) return null;

  const sorted = [...quotes].sort((a, b) => Number(b?.version || 0) - Number(a?.version || 0));
  return (
    sorted.find((q) => q?.status === 'accepted') ||
    sorted.find((q) => q?.status !== 'cancelled' && q?.status !== 'expired') ||
    null
  );
}

/**
 * Returns the lead's quoted selling price only after at least one supplier quote exists.
 */
export function getLeadQuotedPrice(lead: PipelineLeadLike): number | null {
  const supplierQuotes = Array.isArray(lead?.supplierQuotations) ? lead.supplierQuotations : [];
  if (supplierQuotes.length === 0) {
    return null;
  }

  const activeQuote = getActiveCustomerQuotation(lead);
  const selling = toNumeric(activeQuote?.finalSellingPrice);
  if (selling != null && selling > 0) return selling;

  const selectedSupplierQuote =
    supplierQuotes.find((q) => q?.status === 'selected') || supplierQuotes[0];
  const net = toNumeric(selectedSupplierQuote?.totalNetCost);
  if (net != null && net > 0) return net;

  return null;
}

/**
 * Returns the organization-configured margin amount from the lead's active customer quotation,
 * or null if no active customer quotation exists.
 */
export function getLeadMarginAmount(lead: PipelineLeadLike): number | null {
  const activeQuote = getActiveCustomerQuotation(lead);
  if (!activeQuote) return null;

  const margin = toNumeric(activeQuote.marginAmount);
  if (margin == null || margin < 0) {
    return null;
  }
  return margin;
}

/**
 * Computes top-level pipeline KPI metrics across a list of leads.
 * Active inquiries, pipeline deal value, and possible income exclude Closed / Lost deals.
 */
export function computePipelineKpis(leads: PipelineLeadLike[]) {
  const activeLeads = leads.filter((l) => l.stage !== 'lost');

  let activePipelineValue = 0;
  let possibleIncome = 0;
  for (const lead of activeLeads) {
    activePipelineValue += getLeadQuotedPrice(lead) ?? 0;
    possibleIncome += getLeadMarginAmount(lead) ?? 0;
  }

  let confirmedRevenue = 0;
  for (const lead of leads) {
    if (lead.stage === 'confirmed' || lead.status === 'converted') {
      confirmedRevenue += getLeadQuotedPrice(lead) ?? 0;
    }
  }

  return {
    activeLeadsCount: activeLeads.length,
    activePipelineValue: Number(activePipelineValue.toFixed(2)),
    possibleIncome: Number(possibleIncome.toFixed(2)),
    confirmedRevenue: Number(confirmedRevenue.toFixed(2)),
  };
}
