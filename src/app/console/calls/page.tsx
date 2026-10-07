'use client';

import React from 'react';
import { Phone, PhoneIncoming, Radio } from 'lucide-react';
import { useConsole } from '@/context/ConsoleContext';

export default function CallsPage() {
  const {
    calls,
    setShowCallModal,
    bearerToken,
    setSelectedCallDetail,
    handleHangupLiveCall,
  } = useConsole();

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white">Call Logs & Live Control</h2>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1">
            Manage active call legs, answer incoming calls via WebRTC, DTMF controls, and status timelines.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setShowCallModal(true)}
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 shadow-md transition cursor-pointer"
          >
            <Phone className="w-3.5 h-3.5" /> Place Call
          </button>
        </div>
      </div>

      {/* Inbound Call Monitoring Banner */}
      <div className="p-3 sm:p-4 bg-emerald-950/20 border border-emerald-500/30 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2.5">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping shrink-0" />
          <div>
            <span className="font-semibold text-emerald-300">Live Inbound Call Answering Active: </span>
            <span className="text-zinc-300">Calls to </span>
            <span className="font-mono text-emerald-400 font-semibold">+918065531234</span>
            <span className="text-zinc-300"> ring this browser console directly with WebRTC audio & live transcription.</span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-mono text-[10px] font-semibold">
            ● Plivo Live SIP Trunk Active
          </span>
        </div>
      </div>

      {/* Calls List Table with horizontal scroll container */}
      <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-xs">
            <thead className="bg-zinc-900/80 border-b border-zinc-800 text-zinc-400 font-medium">
              <tr>
                <th className="py-3 px-4">Direction / Counterpart</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Duration</th>
                <th className="py-3 px-4">Cost</th>
                <th className="py-3 px-4">Policy Applied</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
              {calls.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-zinc-500">
                    No calls recorded yet. Click &quot;Place Call&quot; to make an outbound call.
                  </td>
                </tr>
              ) : (
                calls.map((call) => (
                  <tr key={call.id} className="hover:bg-zinc-800/30 transition">
                    <td className="py-3.5 px-4">
                      <div className="font-mono font-medium text-zinc-200">
                        {call.direction === 'inbound' ? 'Inbound' : 'Outbound'}: {call.from} &rarr; {call.to}
                      </div>
                      <div className="text-[10px] text-zinc-500 font-mono mt-0.5">{call.plivoCallUuid}</div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${
                          call.status === 'completed'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : call.status === 'in-progress'
                            ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 animate-pulse'
                            : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        }`}
                      >
                        {call.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      {call.durationSeconds ? `${call.durationSeconds}s (${call.billDurationSeconds}s billed)` : '—'}
                    </td>
                    <td className="py-3.5 px-4 font-mono">{call.totalCost ? `$${call.totalCost}` : '$0.00'}</td>
                    <td className="py-3.5 px-4">
                      <div className="text-[11px] text-zinc-400">
                        Rec: {call.recordingEnabled ? 'Yes' : 'No'} | Trans: {call.transcriptionEnabled ? 'Yes' : 'No'}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-right space-x-2 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={async () => {
                          const res = await fetch(`/api/v1/calls/${call.id}`, {
                            headers: { Authorization: `Bearer ${bearerToken}` },
                          });
                          const data = await res.json();
                          setSelectedCallDetail(data.call);
                        }}
                        className="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-2.5 py-1 rounded border border-zinc-700"
                      >
                        Detail
                      </button>
                      {call.status === 'in-progress' && (
                        <button
                          type="button"
                          onClick={() => handleHangupLiveCall(call.id)}
                          className="text-xs bg-rose-600/20 hover:bg-rose-600/30 text-rose-400 px-2.5 py-1 rounded border border-rose-500/30"
                        >
                          Hang Up
                        </button>
                      )}
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
