'use client';

import React from 'react';
import Link from 'next/link';
import {
  Compass,
  ChevronDown,
  FileCheck,
  PhoneCall,
  Edit3,
} from 'lucide-react';
import { useConsole } from '@/context/ConsoleContext';

export default function LeadsPage() {
  const {
    leadsList,
    handleUpdateLeadStatus,
    setCallDestination,
    setCallMode,
    setShowCallModal,
    handleSelectLead,
  } = useConsole();

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <Compass className="w-5 h-5 text-indigo-400 shrink-0" />
            Lead Management & AI Itineraries
          </h2>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1">
            Qualified customer travel leads synthesized from voice call transcripts by AI concierge.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <span className="text-xs font-mono text-zinc-400 bg-zinc-900 border border-zinc-800 px-3 py-1.5 rounded-lg">
            {leadsList.length} Registered Leads
          </span>
        </div>
      </div>

      {/* Leads Table with horizontal scroll container */}
      <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] text-left text-xs">
            <thead className="bg-zinc-900/80 border-b border-zinc-800 text-zinc-400 font-medium">
              <tr>
                <th className="py-3 px-4">Lead & Destination</th>
                <th className="py-3 px-4">Contact Customer</th>
                <th className="py-3 px-4">Approval Status</th>
                <th className="py-3 px-4">Supplier RFQ</th>
                <th className="py-3 px-4">Dispatched PDFs</th>
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
                        Place or receive a call with recording and transcription enabled. Then in the call details drawer, click{' '}
                        <span className="text-indigo-300 font-semibold">&quot;Generate Itinerary&quot;</span> to let AI create a lead and full travel itinerary.
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
                leadsList.map((lead) => (
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
                      <div className="font-medium text-zinc-200">{lead.contact?.name || 'Customer'}</div>
                      <div className="text-[11px] text-zinc-400 font-mono">{lead.contact?.phone || '—'}</div>
                      <div className="text-[11px] text-zinc-500">{lead.customerEmail || lead.contact?.email || 'No email set'}</div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="relative inline-block">
                        <select
                          value={lead.status}
                          onChange={(e) => handleUpdateLeadStatus(lead.id, e.target.value)}
                          className={`text-[11px] font-semibold rounded-lg px-2.5 py-1.5 appearance-none cursor-pointer pr-7 transition border shadow-sm ${
                            lead.status === 'approved'
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                              : lead.status === 'revision_requested'
                              ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30 hover:bg-indigo-500/20'
                              : lead.status === 'contacted'
                              ? 'bg-sky-500/10 text-sky-400 border-sky-500/30 hover:bg-sky-500/20'
                              : lead.status === 'converted'
                              ? 'bg-purple-500/10 text-purple-400 border-purple-500/30 hover:bg-purple-500/20'
                              : lead.status === 'lost'
                              ? 'bg-rose-500/10 text-rose-400 border-rose-500/30 hover:bg-rose-500/20'
                              : 'bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20'
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
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-1.5 text-zinc-400">
                          <ChevronDown className="w-3 h-3" />
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      {lead.supplier ? (
                        <div>
                          <div className="font-medium text-zinc-200">{lead.supplier.name}</div>
                          <div className="text-[10px] text-zinc-400 capitalize">{lead.supplier.category}</div>
                        </div>
                      ) : (
                        <span className="text-zinc-500 italic">None assigned</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="space-y-1 text-[11px]">
                        {lead.customerSentAt ? (
                          <div className="text-emerald-400 flex items-center gap-1">
                            <FileCheck className="w-3 h-3" /> Customer PDF sent
                          </div>
                        ) : (
                          <div className="text-zinc-500">Customer PDF pending</div>
                        )}
                        {lead.supplierSentAt ? (
                          <div className="text-indigo-400 flex items-center gap-1">
                            <FileCheck className="w-3 h-3" /> Supplier RFQ sent
                          </div>
                        ) : (
                          <div className="text-zinc-500">Supplier RFQ pending</div>
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
                          title="Bridge call to talk with lead"
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
                        <span>Review</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
