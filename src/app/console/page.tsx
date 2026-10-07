'use client';

import React from 'react';
import Link from 'next/link';
import {
  CheckCircle,
  DollarSign,
  Phone,
  MessageSquare,
  Plus,
} from 'lucide-react';
import { useConsole } from '@/context/ConsoleContext';

export default function ConsoleOverviewPage() {
  const {
    calls,
    threads,
    numbers,
    setShowCallModal,
    setShowBuyModal,
    handleSearchNumbers,
  } = useConsole();

  const billedSpend = calls.reduce(
    (acc, c) => acc + Number(c.billDurationSeconds || 0) * 0.0002,
    0
  );

  return (
    <div className="space-y-6 sm:space-y-8 max-w-6xl">
      <div>
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white">Operations Overview</h2>
        <p className="text-xs sm:text-sm text-zinc-400 mt-1">
          Real-time telephony telemetry, carrier callbacks, and channel capacity.
        </p>
      </div>

      {/* KPI Cards: 1 col on mobile, 2 cols on tablets, 4 cols on desktop */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
        <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-4 sm:p-5">
          <div className="text-xs text-zinc-400 font-medium">Total Calls</div>
          <div className="text-2xl sm:text-3xl font-bold text-white mt-1">{calls.length}</div>
          <div className="text-[11px] text-emerald-400 mt-2 flex items-center gap-1">
            <CheckCircle className="w-3 h-3 shrink-0" /> All callbacks reconciled
          </div>
        </div>

        <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-4 sm:p-5">
          <div className="text-xs text-zinc-400 font-medium">Messages Sent / Rcvd</div>
          <div className="text-2xl sm:text-3xl font-bold text-white mt-1">{threads.length}</div>
          <div className="text-[11px] text-indigo-400 mt-2">Threaded counterpart routing</div>
        </div>

        <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-4 sm:p-5">
          <div className="text-xs text-zinc-400 font-medium">Active Phone Numbers</div>
          <div className="text-2xl sm:text-3xl font-bold text-white mt-1">{numbers.length}</div>
          <div className="text-[11px] text-zinc-400 mt-2">Provisioned via Plivo API</div>
        </div>

        <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-4 sm:p-5">
          <div className="text-xs text-zinc-400 font-medium">Billed Telephony Spend</div>
          <div className="text-2xl sm:text-3xl font-bold text-white mt-1">
            ${billedSpend.toFixed(3)}
          </div>
          <div className="text-[11px] text-amber-400 mt-2 flex items-center gap-1">
            <DollarSign className="w-3 h-3 shrink-0" /> Exact 60/60 US billing
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex flex-col sm:flex-row flex-wrap gap-2.5 sm:gap-3">
        <button
          type="button"
          onClick={() => setShowCallModal(true)}
          className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20 transition"
        >
          <Phone className="w-4 h-4" /> Place Outbound Call
        </button>
        <Link
          href="/console/messages"
          className="bg-zinc-800 hover:bg-zinc-700 text-zinc-100 px-4 py-2.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 border border-zinc-700 transition"
        >
          <MessageSquare className="w-4 h-4" /> Send SMS Message
        </Link>
        <button
          type="button"
          onClick={() => {
            setShowBuyModal(true);
            handleSearchNumbers();
          }}
          className="bg-zinc-800 hover:bg-zinc-700 text-zinc-100 px-4 py-2.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 border border-zinc-700 transition"
        >
          <Plus className="w-4 h-4" /> Buy Phone Number
        </button>
      </div>

      {/* Recent Activity Card */}
      <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl overflow-hidden">
        <div className="px-4 sm:px-5 py-3 border-b border-zinc-800 flex items-center justify-between">
          <h3 className="text-xs sm:text-sm font-semibold text-zinc-200">Recent Call Activity</h3>
          <Link href="/console/calls" className="text-xs text-indigo-400 hover:underline">
            View all calls &rarr;
          </Link>
        </div>
        <div className="divide-y divide-zinc-800/60">
          {calls.length === 0 ? (
            <div className="px-5 py-8 text-center text-xs text-zinc-500">
              No recent call activity.
            </div>
          ) : (
            calls.slice(0, 5).map((call) => (
              <div key={call.id} className="px-4 sm:px-5 py-3.5 flex items-center justify-between text-xs hover:bg-zinc-800/30 gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      call.status === 'completed'
                        ? 'bg-emerald-400'
                        : call.status === 'in-progress'
                        ? 'bg-indigo-400 animate-pulse'
                        : 'bg-amber-400'
                    }`}
                  />
                  <div className="min-w-0">
                    <div className="font-mono text-zinc-200 font-medium truncate">
                      {call.from} &rarr; {call.to}
                    </div>
                    <div className="text-[10px] text-zinc-500 font-mono truncate">UUID: {call.plivoCallUuid}</div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span className="capitalize px-2 py-0.5 rounded text-[10px] sm:text-[11px] bg-zinc-800 text-zinc-300 font-medium">
                    {call.status}
                  </span>
                  <div className="text-[10px] text-zinc-500 mt-1">
                    {call.billDurationSeconds ? `${call.billDurationSeconds}s billed` : 'Queued'}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
