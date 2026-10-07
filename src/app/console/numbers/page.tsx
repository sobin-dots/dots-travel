'use client';

import React from 'react';
import { Plus } from 'lucide-react';
import { useConsole } from '@/context/ConsoleContext';

export default function NumbersPage() {
  const {
    numbers,
    setShowBuyModal,
    handleSearchNumbers,
  } = useConsole();

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white">Phone Numbers</h2>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1">
            Manage active phone lines, transcription toggles, and answer routing.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setShowBuyModal(true);
            handleSearchNumbers();
          }}
          className="bg-indigo-600 hover:bg-indigo-500 text-white px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 shadow-md transition self-start sm:self-auto"
        >
          <Plus className="w-3.5 h-3.5" /> Buy New Number
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {numbers.length === 0 ? (
          <div className="col-span-full py-12 text-center text-zinc-500 text-xs">
            No phone numbers provisioned yet. Click &quot;Buy New Number&quot; to add one.
          </div>
        ) : (
          numbers.map((num) => (
            <div key={num.id} className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-4 sm:p-5 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-mono text-base font-bold text-white tracking-wide truncate">{num.e164}</div>
                  <div className="text-xs text-zinc-400 mt-0.5 truncate">{num.friendlyName || 'Active Line'}</div>
                </div>
                <span className="px-2.5 py-0.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-full text-[10px] font-bold uppercase tracking-wider shrink-0">
                  {num.status}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs bg-zinc-950 p-3 rounded-lg border border-zinc-800/80">
                <div>
                  <span className="text-zinc-500 block text-[10px]">Monthly Rental</span>
                  <span className="font-medium text-zinc-200">${num.monthlyRental || '1.00'}/mo</span>
                </div>
                <div>
                  <span className="text-zinc-500 block text-[10px]">Voice Rate</span>
                  <span className="font-medium text-zinc-200">${num.voiceRate || '0.012'}/min</span>
                </div>
              </div>

              {/* Per-Number Policy Toggles */}
              <div className="space-y-2 pt-2 border-t border-zinc-800/80 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-300">Record Calls</span>
                  <span className="text-indigo-400 font-semibold">{num.recordCalls ? 'Enabled' : 'Disabled'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-300">Transcription Policy</span>
                  <span className={num.transcribeEnabled ? 'text-emerald-400 font-semibold' : 'text-zinc-500 font-semibold'}>
                    {num.transcribeEnabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
