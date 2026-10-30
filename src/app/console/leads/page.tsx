'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Compass,
  ChevronDown,
  FileCheck,
  PhoneCall,
  Edit3,
  Kanban,
  List,
  Sparkles,
  Users,
  DollarSign,
  ArrowRight,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  ShieldAlert,
} from 'lucide-react';
import { useConsole } from '@/context/ConsoleContext';

const PIPELINE_STAGES = [
  { id: 'new_inquiry', label: 'New Inquiry', color: 'from-cyan-500/20 to-blue-500/10', border: 'border-cyan-500/30', badge: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30' },
  { id: 'quote_prep', label: 'Quote Prep', color: 'from-amber-500/20 to-orange-500/10', border: 'border-amber-500/30', badge: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
  { id: 'quote_sent', label: 'Quote Sent', color: 'from-violet-500/20 to-purple-500/10', border: 'border-violet-500/30', badge: 'bg-violet-500/10 text-violet-400 border-violet-500/30' },
  { id: 'negotiation', label: 'Negotiation', color: 'from-indigo-500/20 to-blue-500/10', border: 'border-indigo-500/30', badge: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30' },
  { id: 'confirmed', label: 'Confirmed & Won', color: 'from-emerald-500/20 to-teal-500/10', border: 'border-emerald-500/30', badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' },
  { id: 'lost', label: 'Closed / Lost', color: 'from-rose-500/20 to-red-500/10', border: 'border-rose-500/30', badge: 'bg-rose-500/10 text-rose-400 border-rose-500/30' },
];

/**
 * Returns the lead's quoted price ONLY after a supplier quote has been received.
 * Before getting a quote from the supplier, returns null so no premature/stray price is shown or summed.
 */
function getLeadQuotedPrice(lead: any): number | null {
  const supplierQuotes = Array.isArray(lead?.supplierQuotations) ? lead.supplierQuotations : [];
  if (supplierQuotes.length === 0) {
    return null;
  }

  const customerQuotes = Array.isArray(lead?.quotations) ? lead.quotations : [];
  if (customerQuotes.length > 0 && customerQuotes[0]?.finalSellingPrice != null) {
    const selling = Number(customerQuotes[0].finalSellingPrice);
    if (!isNaN(selling) && selling > 0) return selling;
  }

  const selectedSupplierQuote =
    supplierQuotes.find((q: any) => q.status === 'selected') || supplierQuotes[0];
  if (selectedSupplierQuote?.totalNetCost != null) {
    const net = Number(selectedSupplierQuote.totalNetCost);
    if (!isNaN(net) && net > 0) return net;
  }

  return null;
}

function getLeadDurationDays(lead: any): number {
  const titleMatch = typeof lead?.title === 'string' ? lead.title.match(/\b(\d+)-Day\b/i) : null;
  if (lead?.durationDays && Number(lead.durationDays) > 0) {
    // If durationDays was left at default 5 while title explicitly specifies another day count, prefer the title's day count
    if (titleMatch && Number(lead.durationDays) === 5 && parseInt(titleMatch[1], 10) !== 5) {
      return parseInt(titleMatch[1], 10);
    }
    return Number(lead.durationDays);
  }
  if (titleMatch) {
    return parseInt(titleMatch[1], 10);
  }
  return 5;
}

function getLeadCustomerName(lead: any): string {
  const contactName = lead?.contact?.name?.trim();
  if (contactName && contactName.toLowerCase() !== 'valued client') {
    return contactName;
  }
  const metaName = lead?.metadata?.customerName?.trim();
  if (metaName && metaName.toLowerCase() !== 'valued client') {
    return metaName;
  }
  const email = lead?.customerEmail || lead?.contact?.email;
  if (email && typeof email === 'string' && email.includes('@')) {
    const local = email.split('@')[0].replace(/[._-]+/g, ' ').trim();
    if (local) {
      return local.replace(/\b\w/g, (c) => c.toUpperCase());
    }
  }
  return 'Customer';
}

function getLeadCustomerPhone(lead: any): string {
  if (lead?.contact?.phone) return lead.contact.phone;
  if (lead?.metadata?.customerPhone) return lead.metadata.customerPhone;
  if (lead?.call) {
    return lead.call.direction === 'outbound' ? lead.call.to : lead.call.from;
  }
  return '—';
}

export default function LeadsPage() {
  const {
    leadsList,
    handleUpdateLeadStatus,
    setCallDestination,
    setCallMode,
    setShowCallModal,
    handleSelectLead,
    bearerToken,
    fetchData,
  } = useConsole();

  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');
  const [updatingStageId, setUpdatingStageId] = useState<string | null>(null);

  // Calculate Pipeline Metrics strictly from leads that have received supplier quotes
  const activeLeads = leadsList.filter((l) => l.stage !== 'lost');
  const totalLeads = activeLeads.length;
  const activePipelineValue = activeLeads.reduce((sum, l) => {
    const val = getLeadQuotedPrice(l);
    return sum + (val ?? 0);
  }, 0);
  const confirmedWonValue = leadsList
    .filter((l) => l.stage === 'confirmed' || l.status === 'converted')
    .reduce((sum, l) => {
      const val = getLeadQuotedPrice(l);
      return sum + (val ?? 0);
    }, 0);

  // Stage transition helper
  const handleMoveStage = async (leadId: string, currentStage: string, direction: 'next' | 'prev') => {
    const currentIdx = PIPELINE_STAGES.findIndex((s) => s.id === currentStage);
    const targetIdx = direction === 'next' ? currentIdx + 1 : currentIdx - 1;
    if (targetIdx < 0 || targetIdx >= PIPELINE_STAGES.length) return;

    const targetStage = PIPELINE_STAGES[targetIdx].id;
    setUpdatingStageId(leadId);
    try {
      const res = await fetch(`/api/v1/leads/${leadId}/stage`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${bearerToken}`,
        },
        body: JSON.stringify({ stage: targetStage }),
      });
      if (res.ok) {
        await fetchData();
      }
    } catch (err) {
      console.warn('Error updating stage:', err);
    } finally {
      setUpdatingStageId(null);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header with Metrics & View Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <Compass className="w-5 h-5 text-indigo-400 shrink-0" />
            Lead Management & Pipeline Tracking (P2-17)
          </h2>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1">
            End-to-end concierge pipeline tracking from speech transcription intake to confirmed luxury bookings.
          </p>
        </div>

        {/* View Switcher Controls */}
        <div className="flex items-center gap-3">
          <div className="bg-zinc-900 border border-zinc-800 p-1 rounded-xl flex items-center gap-1 shadow-sm">
            <button
              type="button"
              onClick={() => setViewMode('kanban')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                viewMode === 'kanban'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Kanban className="w-3.5 h-3.5" />
              <span>Kanban Board</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                viewMode === 'list'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>List Grid</span>
            </button>
          </div>
        </div>
      </div>

      {/* Pipeline Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">Active Inquiries</div>
            <div className="text-xl font-bold text-white mt-1 font-mono">
              {totalLeads} {totalLeads === 1 ? 'Lead' : 'Leads'}
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center">
            <Users className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">Pipeline Deal Value</div>
            <div className="text-xl font-bold text-indigo-400 mt-1 font-mono">
              ₹{activePipelineValue.toLocaleString('en-IN', { minimumFractionDigits: 0 })}
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center font-mono font-bold text-base">
            ₹
          </div>
        </div>

        <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">Confirmed Revenue</div>
            <div className="text-xl font-bold text-emerald-400 mt-1 font-mono">
              ₹{confirmedWonValue.toLocaleString('en-IN', { minimumFractionDigits: 0 })}
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* KANBAN BOARD VIEW (P2-17) */}
      {viewMode === 'kanban' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3.5 overflow-x-auto pb-4">
          {PIPELINE_STAGES.map((col, colIdx) => {
            const colLeads = leadsList.filter((l) => (l.stage || 'new_inquiry') === col.id);
            const colValue = colLeads.reduce((s, l) => {
              const val = getLeadQuotedPrice(l);
              return s + (val ?? 0);
            }, 0);

            return (
              <div
                key={col.id}
                className="bg-zinc-950/80 border border-zinc-800/90 rounded-xl flex flex-col min-w-[220px] max-h-[78vh]"
              >
                {/* Column Header */}
                <div className="p-3 border-b border-zinc-800/80 flex items-center justify-between bg-zinc-900/40 rounded-t-xl">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white tracking-tight">{col.label}</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 font-semibold">
                      {colLeads.length}
                    </span>
                  </div>
                  {colValue > 0 && (
                    <span className="text-[10px] font-mono text-emerald-400 font-semibold">
                      ₹{colValue.toLocaleString('en-IN')}
                    </span>
                  )}
                </div>

                {/* Column Body Cards */}
                <div className="p-2 space-y-2.5 overflow-y-auto flex-1">
                  {colLeads.length === 0 ? (
                    <div className="py-8 text-center text-[11px] text-zinc-600 italic">No leads in stage</div>
                  ) : (
                    colLeads.map((lead) => {
                      const price = getLeadQuotedPrice(lead);
                      const durationDays = getLeadDurationDays(lead);
                      const customerName = getLeadCustomerName(lead);
                      const isUpdating = updatingStageId === lead.id;

                      return (
                        <div
                          key={lead.id}
                          className="bg-zinc-900/90 hover:bg-zinc-800/80 border border-zinc-800 rounded-xl p-3 space-y-2.5 transition shadow-sm group"
                        >
                          <div className="flex items-start justify-between gap-1">
                            <span className="text-xs font-semibold text-white line-clamp-1 group-hover:text-indigo-300 transition">
                              {lead.title}
                            </span>
                          </div>

                          <div className="text-[11px] text-indigo-400 flex items-center gap-1 font-medium">
                            <Compass className="w-3 h-3 shrink-0" />
                            <span className="line-clamp-1">{lead.destination || 'Unspecified'}</span>
                          </div>

                          <div className="flex items-center justify-between text-[10px] text-zinc-400 font-mono pt-1 border-t border-zinc-800/60">
                            {price !== null ? (
                              <span className="text-emerald-400 font-semibold">₹{price.toLocaleString('en-IN')}</span>
                            ) : (
                              <span className="text-zinc-500">{durationDays} Days</span>
                            )}
                            <span className="truncate max-w-[130px]">
                              {price !== null ? `${durationDays} Days • ${customerName}` : customerName}
                            </span>
                          </div>

                          {/* Quick Actions & Stage Transition Arrows */}
                          <div className="flex items-center justify-between pt-1 text-[10px]">
                            <button
                              type="button"
                              onClick={() => handleSelectLead(lead.id)}
                              className="text-xs bg-indigo-600/30 hover:bg-indigo-600 text-indigo-200 hover:text-white px-2 py-1 rounded transition flex items-center gap-1 font-medium"
                            >
                              <Edit3 className="w-2.5 h-2.5" /> Review
                            </button>

                            <div className="flex items-center gap-1">
                              {colIdx > 0 && (
                                <button
                                  type="button"
                                  disabled={isUpdating}
                                  onClick={() => handleMoveStage(lead.id, col.id, 'prev')}
                                  className="p-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition disabled:opacity-50"
                                  title="Move to previous stage"
                                >
                                  <ArrowLeft className="w-3 h-3" />
                                </button>
                              )}
                              {colIdx < PIPELINE_STAGES.length - 1 && (
                                <button
                                  type="button"
                                  disabled={isUpdating}
                                  onClick={() => handleMoveStage(lead.id, col.id, 'next')}
                                  className="p-1 rounded bg-indigo-600/40 hover:bg-indigo-600 text-indigo-200 hover:text-white transition disabled:opacity-50"
                                  title="Advance to next stage"
                                >
                                  <ArrowRight className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* TABLE LIST GRID VIEW */}
      {viewMode === 'list' && (
        <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] text-left text-xs">
              <thead className="bg-zinc-900/80 border-b border-zinc-800 text-zinc-400 font-medium">
                <tr>
                  <th className="py-3 px-4">Lead & Destination</th>
                  <th className="py-3 px-4">Contact Customer</th>
                  <th className="py-3 px-4">Pipeline Stage</th>
                  <th className="py-3 px-4">Deal Value</th>
                  <th className="py-3 px-4">Omnichannel Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                {leadsList.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 px-4 text-center">
                      <div className="max-w-md mx-auto space-y-3">
                        <div className="w-10 h-10 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center mx-auto">
                          <Compass className="w-5 h-5" />
                        </div>
                        <div className="text-sm font-semibold text-zinc-200">No Leads Generated Yet</div>
                        <p className="text-xs text-zinc-400 leading-relaxed">
                          Place or receive a call. In Call Details, click{' '}
                          <span className="text-indigo-300 font-semibold">&quot;Generate Itinerary with AI&quot;</span> to launch the intake form.
                        </p>
                        <Link
                          href="/console/calls"
                          className="inline-block text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3.5 py-1.5 rounded-lg font-medium transition"
                        >
                          Go to Calls &rarr;
                        </Link>
                      </div>
                    </td>
                  </tr>
                ) : (
                  leadsList.map((lead) => {
                    const price = getLeadQuotedPrice(lead);
                    const durationDays = getLeadDurationDays(lead);
                    const customerName = getLeadCustomerName(lead);
                    const customerPhone = getLeadCustomerPhone(lead);
                    const currentStageConfig = PIPELINE_STAGES.find((s) => s.id === (lead.stage || 'new_inquiry')) || PIPELINE_STAGES[0];

                    return (
                      <tr key={lead.id} className="hover:bg-zinc-800/30 transition">
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-zinc-100 flex items-center gap-2">
                            <span>{lead.title}</span>
                          </div>
                          <div className="text-[11px] text-indigo-400 flex items-center gap-1 mt-0.5 font-medium">
                            <Compass className="w-3 h-3" />
                            <span>{lead.destination || 'Unspecified Destination'}</span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="font-medium text-zinc-200">{customerName}</div>
                          <div className="text-[11px] text-zinc-400 font-mono">{customerPhone}</div>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border uppercase tracking-wider ${currentStageConfig.badge}`}>
                            {currentStageConfig.label}
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          {price !== null ? (
                            <div className="font-mono font-semibold text-emerald-400 text-xs">
                              ₹{price.toLocaleString('en-IN')}
                            </div>
                          ) : (
                            <div className="text-zinc-500 text-xs italic">Awaiting Supplier Quote</div>
                          )}
                          <div className="text-[10px] text-zinc-500">
                            {durationDays} Days • {lead.hotelTier ? lead.hotelTier.replace(/_/g, ' ') : 'Luxury'}
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="space-y-1 text-[11px]">
                            {lead.bookingReference ? (
                              <div className="text-emerald-400 font-mono font-semibold flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" /> Confirmed ({lead.bookingReference})
                              </div>
                            ) : lead.stage === 'quote_sent' ? (
                              <div className="text-violet-400 flex items-center gap-1">
                                <FileCheck className="w-3 h-3" /> Quote Dispatched
                              </div>
                            ) : (
                              <div className="text-zinc-500">In Preparation</div>
                            )}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-right space-x-2 whitespace-nowrap">
                          {lead.contact?.phone && (
                            <button
                              type="button"
                              onClick={() => {
                                setCallDestination(lead.contact.phone);
                                setCallMode('bridge');
                                setShowCallModal(true);
                              }}
                              className="text-xs bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 px-2.5 py-1.5 rounded border border-emerald-500/30 font-medium transition inline-flex items-center gap-1.5"
                            >
                              <PhoneCall className="w-3 h-3 text-emerald-400" />
                              <span>Talk</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleSelectLead(lead.id)}
                            className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded font-medium shadow-sm transition inline-flex items-center gap-1.5"
                          >
                            <Edit3 className="w-3 h-3" />
                            <span>Review & CPQ</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
