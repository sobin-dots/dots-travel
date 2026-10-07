'use client';

import React from 'react';
import {
  Compass,
  ChevronDown,
  Download,
  BookUser,
  Mail,
  CheckCircle2,
  AlertTriangle,
  Mic,
  RefreshCw,
  FileText,
  Edit3,
  Sparkles,
  Building2,
  Plus,
  X,
} from 'lucide-react';
import { useConsole } from '@/context/ConsoleContext';
import { VisualItinerary } from '@/components/VisualItinerary';

export function LeadDetailDrawer() {
  const {
    selectedLead,
    setSelectedLead,
    bearerToken,
    contactsList,
    suppliersList,
    setShowSupplierModal,
    leadRevisionNotes,
    setLeadRevisionNotes,
    leadCustomerEmail,
    setLeadCustomerEmail,
    leadSelectedSupplierId,
    setLeadSelectedSupplierId,
    leadRevising,
    leadSending,
    showSendConfirmModal,
    setShowSendConfirmModal,
    handleUpdateLeadStatus,
    handleReviseItinerary,
    handleApproveAndSendItinerary,
    resolveCustomerEmailForLead,
  } = useConsole();

  if (!selectedLead) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-2 sm:p-4 lg:p-6 overflow-hidden">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-6xl max-h-[96vh] sm:max-h-[94vh] flex flex-col shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-zinc-800 bg-zinc-900/90 flex flex-col md:flex-row md:items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
                <Compass className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2.5">
                  <h3 className="text-base font-bold text-white tracking-tight">{selectedLead.title}</h3>
                  <div className="relative inline-block">
                    <select
                      value={selectedLead.status}
                      onChange={(e) => handleUpdateLeadStatus(selectedLead.id, e.target.value)}
                      className={`text-[10px] font-semibold uppercase tracking-wider rounded px-2.5 py-1 appearance-none cursor-pointer pr-6 border transition shadow-sm ${
                        selectedLead.status === 'approved'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                          : selectedLead.status === 'revision_requested'
                          ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30'
                          : selectedLead.status === 'contacted'
                          ? 'bg-sky-500/10 text-sky-400 border-sky-500/30'
                          : selectedLead.status === 'converted'
                          ? 'bg-purple-500/10 text-purple-400 border-purple-500/30'
                          : selectedLead.status === 'lost'
                          ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                          : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                      }`}
                      title="Click to change lead status"
                    >
                      <option value="pending_approval" className="bg-zinc-900 text-amber-400">⏳ Pending Approval</option>
                      <option value="revision_requested" className="bg-zinc-900 text-indigo-400">✏️ Revision Requested</option>
                      <option value="approved" className="bg-zinc-900 text-emerald-400">✅ Approved</option>
                      <option value="contacted" className="bg-zinc-900 text-sky-400">📞 Contacted</option>
                      <option value="converted" className="bg-zinc-900 text-purple-400">🏆 Converted / Won</option>
                      <option value="lost" className="bg-zinc-900 text-rose-400">❌ Closed / Lost</option>
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-1 text-zinc-400">
                      <ChevronDown className="w-3 h-3" />
                    </div>
                  </div>
                </div>
                <div className="text-xs text-indigo-400 flex items-center gap-1.5 mt-0.5">
                  <span>Destination:</span>
                  <span className="font-semibold">{selectedLead.destination || 'Unspecified'}</span>
                  <span className="text-zinc-600">•</span>
                  <span className="text-zinc-400 font-mono text-[11px]">Lead #{selectedLead.id.slice(0, 8)}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap self-end md:self-auto">
              {/* PDF Quick Download Links */}
              <a
                href={`/api/v1/leads/${selectedLead.id}/pdf?type=customer&token=${bearerToken}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-3 py-1.5 rounded-lg border border-zinc-700 flex items-center gap-1.5 transition"
                title="Download Customer PDF Itinerary"
              >
                <Download className="w-3.5 h-3.5 text-indigo-400" />
                <span>Customer PDF</span>
              </a>
              <a
                href={`/api/v1/leads/${selectedLead.id}/pdf?type=supplier&token=${bearerToken}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-3 py-1.5 rounded-lg border border-zinc-700 flex items-center gap-1.5 transition"
                title="Download Supplier RFQ Quotation PDF"
              >
                <Download className="w-3.5 h-3.5 text-amber-400" />
                <span>Supplier RFQ PDF</span>
              </a>
              <button
                type="button"
                onClick={() => setSelectedLead(null)}
                className="text-zinc-400 hover:text-white p-1.5 rounded-lg hover:bg-zinc-800 text-lg leading-none transition ml-1"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Modal Body: Two-Column Layout */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6">
            {/* Left Column (5 cols): Contact & Source Media (Recording + Transcript) */}
            <div className="lg:col-span-5 space-y-5">
              {/* Contact Card & Customer Email Gate */}
              <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-zinc-800/60 pb-2">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <BookUser className="w-3.5 h-3.5 text-emerald-400" />
                    Lead Contact Details
                  </span>
                  <span className="text-[10px] text-zinc-500 font-mono">
                    {selectedLead.contact?.id ? 'Verified Contact' : 'Direct Call Leg'}
                  </span>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Contact Name:</span>
                    <span className="font-semibold text-zinc-200">{selectedLead.contact?.name || 'Customer'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Phone:</span>
                    <span className="font-mono text-emerald-400">{selectedLead.contact?.phone || selectedLead.call?.to || '—'}</span>
                  </div>
                  {selectedLead.contact?.company && (
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Company:</span>
                      <span className="text-zinc-300">{selectedLead.contact.company}</span>
                    </div>
                  )}
                </div>

                {/* Customer Email Input */}
                <div className="pt-2 border-t border-zinc-800/60 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-zinc-300 flex items-center gap-1">
                      <Mail className="w-3.5 h-3.5 text-indigo-400" />
                      Customer Email (Required to Send PDF) *
                    </label>
                    {(() => {
                      const resolved = resolveCustomerEmailForLead(selectedLead, contactsList);
                      return resolved.contactName ? (
                        <span className="text-[10px] text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-2 py-0.5 rounded-full flex items-center gap-1 font-medium">
                          <CheckCircle2 className="w-2.5 h-2.5" />
                          Linked: {resolved.contactName}
                        </span>
                      ) : null;
                    })()}
                  </div>
                  <input
                    type="email"
                    required
                    placeholder="customer@example.com"
                    value={leadCustomerEmail}
                    onChange={(e) => setLeadCustomerEmail(e.target.value)}
                    className={`w-full bg-zinc-900 border rounded-lg p-2.5 text-xs text-zinc-200 focus:outline-none ${
                      !leadCustomerEmail || !leadCustomerEmail.includes('@')
                        ? 'border-amber-500/60 focus:border-amber-400'
                        : 'border-zinc-700 focus:border-indigo-500'
                    }`}
                  />
                  {(!leadCustomerEmail || !leadCustomerEmail.includes('@')) && (
                    <p className="text-[11px] text-amber-400 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3 shrink-0" />
                      Please provide a valid email before approving and dispatching the itinerary.
                    </p>
                  )}
                </div>
              </div>

              {/* Call Audio Recording */}
              <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-zinc-800/60 pb-2">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Mic className="w-3.5 h-3.5 text-emerald-400" />
                    Source Call Recording
                  </span>
                  {selectedLead.call?.recordings && selectedLead.call.recordings.length > 0 ? (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/60">
                      MP3 Audio Ready
                    </span>
                  ) : (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950/80 text-amber-400 border border-amber-800/50 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                      Processing Audio
                    </span>
                  )}
                </div>

                {selectedLead.call?.recordings && selectedLead.call.recordings.length > 0 ? (
                  selectedLead.call.recordings.map((rec: any) => (
                    <div key={rec.id} className="space-y-2">
                      <audio
                        controls
                        className="w-full h-9 rounded bg-zinc-900 border border-zinc-800"
                        src={`/api/v1/recordings/${rec.id}/stream`}
                      />
                      <div className="flex items-center justify-between text-[11px] text-zinc-500 font-mono">
                        <span>Recording: {rec.plivoRecordingId || rec.id.slice(0, 10)}</span>
                        <span>{rec.durationSeconds || selectedLead.call?.durationSeconds || 0}s duration</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-3.5 bg-zinc-900/60 border border-emerald-900/30 rounded-xl space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-emerald-400 font-semibold text-xs">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Processing Call Recording...</span>
                      </div>
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-emerald-950/80 text-emerald-400 border border-emerald-800/50">
                        Carrier Sync
                      </span>
                    </div>
                    <div className="flex items-center justify-center gap-1.5 py-1">
                      <span className="w-1 bg-emerald-500/70 rounded-full animate-bounce h-3" />
                      <span className="w-1 bg-emerald-500/80 rounded-full animate-bounce h-5 delay-75" />
                      <span className="w-1 bg-emerald-400 rounded-full animate-bounce h-2 delay-150" />
                      <span className="w-1 bg-emerald-500/90 rounded-full animate-bounce h-6 delay-100" />
                      <span className="w-1 bg-emerald-400 rounded-full animate-bounce h-4 delay-200" />
                    </div>
                    <p className="text-[10px] text-zinc-400 leading-relaxed text-center">
                      Dual-channel audio is finalizing on Plivo carrier and will be attached automatically.
                    </p>
                  </div>
                )}
              </div>

              {/* Call Speech Transcription */}
              <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-zinc-800/60 pb-2">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-indigo-400" />
                    Speech Transcription
                  </span>
                  {selectedLead.call?.transcriptions && selectedLead.call.transcriptions.length > 0 ? (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-950 text-indigo-400 border border-indigo-800/60">
                      {selectedLead.call.transcriptions[0].language || 'en-US'} Ready
                    </span>
                  ) : (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-950/80 text-purple-400 border border-purple-800/50 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
                      Transcribing
                    </span>
                  )}
                </div>

                {selectedLead.call?.transcriptions && selectedLead.call.transcriptions.length > 0 ? (
                  <div className="bg-zinc-900 p-3 rounded-lg border border-zinc-800/80 max-h-48 overflow-y-auto font-mono text-zinc-300 text-xs whitespace-pre-line leading-relaxed">
                    {selectedLead.call.transcriptions[0].text || '(No transcript text)'}
                  </div>
                ) : (
                  <div className="p-3.5 bg-zinc-900/60 border border-indigo-900/30 rounded-xl space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-indigo-400 font-semibold text-xs">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Transcribing Speech to Text...</span>
                      </div>
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-indigo-950/80 text-indigo-400 border border-indigo-800/50">
                        Plivo ASR
                      </span>
                    </div>
                    <div className="space-y-1.5 py-1">
                      <div className="h-2 bg-zinc-800 rounded animate-pulse w-full" />
                      <div className="h-2 bg-zinc-800/70 rounded animate-pulse w-4/5" />
                    </div>
                    <p className="text-[10px] text-zinc-400 leading-relaxed text-center">
                      Synthesizing verbatim customer speech for AI itinerary quotation generation.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Right Column (7 cols): AI Itinerary, Revision & Supplier Dispatch */}
            <div className="lg:col-span-7 space-y-5">
              {/* Visual Itinerary Presentation */}
              <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-xl p-4">
                <VisualItinerary
                  itineraryText={selectedLead.itinerary}
                  destination={selectedLead.destination}
                  leadTitle={selectedLead.title}
                />
              </div>

              {/* Prompt User for Approval & Corrections (AI Revision Workflow) */}
              <div className="bg-gradient-to-br from-indigo-950/30 via-zinc-950 to-zinc-950 border border-indigo-500/20 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-zinc-200 flex items-center gap-1.5">
                    <Edit3 className="w-3.5 h-3.5 text-indigo-400" />
                    Prompt for Corrections & Revisions
                  </span>
                  <span className="text-[10px] text-indigo-300 font-medium">AI Interactive Refinement</span>
                </div>
                <p className="text-[11px] text-zinc-400">
                  Review the itinerary above. If any changes are needed (e.g. hotel upgrade, adding excursions, adjusting duration, budget constraints), specify them below and AI will revise the itinerary.
                </p>
                <textarea
                  rows={2}
                  placeholder="e.g. Upgrade resort to 5-star beachfront with private pool, add half-day scuba diving on day 3, budget maximum $5,000..."
                  value={leadRevisionNotes}
                  onChange={(e) => setLeadRevisionNotes(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500 resize-none"
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleReviseItinerary}
                    disabled={leadRevising || !leadRevisionNotes.trim()}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 shadow-md transition disabled:opacity-50"
                  >
                    {leadRevising ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Revising with AI...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                        <span>Revise Itinerary with AI</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Supplier Selection & Approval Dispatch */}
              <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-xl p-4 space-y-4">
                <div className="flex items-center justify-between border-b border-zinc-800/60 pb-2">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-indigo-400" />
                    Select Supplier for Quotation (RFQ)
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowSupplierModal(true)}
                    className="text-[11px] text-indigo-400 hover:underline flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> Add New Supplier
                  </button>
                </div>

                <div className="space-y-2 text-xs">
                  <label className="text-zinc-400 block">Choose Partner Supplier for Quotation Request</label>
                  <select
                    value={leadSelectedSupplierId}
                    onChange={(e) => setLeadSelectedSupplierId(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-zinc-200"
                  >
                    <option value="">-- No Supplier (Customer Itinerary Only) --</option>
                    {suppliersList.map((supp) => (
                      <option key={supp.id} value={supp.id}>
                        {supp.name} ({supp.category.toUpperCase()}) — {supp.email}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Dispatch Status Indicators */}
                {(selectedLead.customerSentAt || selectedLead.supplierSentAt) && (
                  <div className="p-3 bg-emerald-950/30 border border-emerald-800/40 rounded-lg space-y-1 text-[11px]">
                    {selectedLead.customerSentAt && (
                      <div className="text-emerald-400 flex items-center gap-1.5 font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        <span>Customer Itinerary PDF dispatched to {selectedLead.customerEmail || leadCustomerEmail}</span>
                      </div>
                    )}
                    {selectedLead.supplierSentAt && (
                      <div className="text-indigo-400 flex items-center gap-1.5 font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        <span>Supplier RFQ Quotation PDF dispatched to partner supplier.</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Approve and Dispatch Button */}
                <div className="pt-2 flex items-center justify-between">
                  <div className="text-[11px] text-zinc-400">
                    Dispatches formatted PDF attachments to both customer and supplier.
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (!leadCustomerEmail || !leadCustomerEmail.includes('@')) {
                        alert('Please enter or verify a valid customer email address before dispatching.');
                        return;
                      }
                      setShowSendConfirmModal(true);
                    }}
                    disabled={leadSending || !leadCustomerEmail}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2.5 rounded-lg text-xs font-bold flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {leadSending ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Generating & Sending PDFs...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Approve & Send Itinerary PDFs</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* MODAL: CONFIRM ITINERARY DISPATCH */}
      {showSendConfirmModal && selectedLead && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-lg w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-start justify-between border-b border-zinc-800/80 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <Mail className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Confirm Itinerary Dispatch</h3>
                  <p className="text-[11px] text-zinc-400">Review recipient details before official PDF dispatch.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSendConfirmModal(false)}
                className="text-zinc-500 hover:text-zinc-300 p-1 rounded-lg hover:bg-zinc-800 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              {/* Itinerary info card */}
              <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-lg p-3 space-y-1.5">
                <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">Itinerary & Destination</div>
                <div className="font-semibold text-zinc-200">{selectedLead.title}</div>
                <div className="text-[11px] text-indigo-400 flex items-center gap-1 font-medium">
                  <Compass className="w-3 h-3" />
                  <span>{selectedLead.destination || 'Luxury Destination'}</span>
                </div>
              </div>

              {/* Recipients card */}
              <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-lg p-3 space-y-2.5 divide-y divide-zinc-800/50">
                <div className="space-y-1">
                  <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold flex items-center justify-between">
                    <span>Customer Recipient</span>
                    <span className="text-[10px] text-emerald-400 font-normal">Customer Itinerary PDF</span>
                  </div>
                  <div className="font-medium text-emerald-400 flex items-center gap-1.5 font-mono text-[11px]">
                    <Mail className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>{leadCustomerEmail}</span>
                  </div>
                  {(() => {
                    const resolved = resolveCustomerEmailForLead(selectedLead, contactsList);
                    return resolved.contactName ? (
                      <div className="text-[11px] text-zinc-400">
                        Linked Contact: <span className="text-zinc-300 font-medium">{resolved.contactName}</span>
                      </div>
                    ) : null;
                  })()}
                </div>

                <div className="pt-2 space-y-1">
                  <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold flex items-center justify-between">
                    <span>Supplier Partner RFQ</span>
                    <span className="text-[10px] text-indigo-400 font-normal">Supplier RFQ PDF</span>
                  </div>
                  {leadSelectedSupplierId ? (
                    (() => {
                      const supp = suppliersList.find((s) => s.id === leadSelectedSupplierId);
                      return supp ? (
                        <div className="space-y-0.5">
                          <div className="font-medium text-indigo-300">{supp.name}</div>
                          <div className="text-[11px] text-zinc-400 font-mono">{supp.email}</div>
                        </div>
                      ) : (
                        <div className="text-zinc-500 italic">Supplier selected ({leadSelectedSupplierId})</div>
                      );
                    })()
                  ) : (
                    <div className="text-zinc-500 italic text-[11px]">No supplier selected (Customer PDF only)</div>
                  )}
                </div>
              </div>

              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-[11px] text-emerald-300 flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  Clicking <strong>Confirm & Dispatch</strong> will generate the branded PDF documents and dispatch them via email.
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-zinc-800/80">
              <button
                type="button"
                onClick={() => setShowSendConfirmModal(false)}
                disabled={leadSending}
                className="px-4 py-2 text-xs rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  setShowSendConfirmModal(false);
                  await handleApproveAndSendItinerary();
                }}
                disabled={leadSending}
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2 rounded-lg text-xs font-bold flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition"
              >
                {leadSending ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Sending...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Confirm & Dispatch PDFs</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
