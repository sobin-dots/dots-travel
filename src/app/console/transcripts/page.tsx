'use client';

import React from 'react';
import { Search, Clock, Sparkles } from 'lucide-react';
import { useConsole } from '@/context/ConsoleContext';

export default function TranscriptsPage() {
  const {
    transcripts,
    transcriptSearch,
    setTranscriptSearch,
  } = useConsole();

  const filteredTranscripts = transcripts.filter(
    (t) => !transcriptSearch || t.text?.toLowerCase().includes(transcriptSearch.toLowerCase())
  );

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white">Call Transcripts</h2>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1">
            Searchable speech-to-text transcriptions resolved per organization and number policy.
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search transcripts..."
            value={transcriptSearch}
            onChange={(e) => setTranscriptSearch(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-9 pr-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      <div className="space-y-4">
        {filteredTranscripts.length === 0 ? (
          <div className="py-12 text-center text-zinc-500 text-xs">
            {transcriptSearch ? 'No transcripts match your search.' : 'No transcripts available yet.'}
          </div>
        ) : (
          filteredTranscripts.map((t) => {
            const rawDate = t.createdAt || t.updatedAt || t.call?.startedAt;
            const dateObj = rawDate ? new Date(rawDate) : null;
            const formattedDate = dateObj && !isNaN(dateObj.getTime())
              ? dateObj.toLocaleDateString('en-IN', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                })
              : null;
            const formattedTime = dateObj && !isNaN(dateObj.getTime())
              ? dateObj.toLocaleTimeString('en-IN', {
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: true,
                })
              : null;

            return (
              <div key={t.id} className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-4 sm:p-5 space-y-3">
                <div className="flex items-center justify-between text-xs flex-wrap gap-2">
                  <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                    {formattedDate && (
                      <span className="flex items-center gap-1 text-zinc-200 font-mono text-[11px] sm:text-xs">
                        <Clock className="w-3 h-3 text-indigo-400 shrink-0" />
                        {formattedDate} at {formattedTime}
                      </span>
                    )}
                    {formattedDate && <span className="text-zinc-600">•</span>}
                    {t.call && (
                      <>
                        <span className="text-zinc-300 font-mono text-[11px] sm:text-xs">
                          {t.call.from} → {t.call.to}
                        </span>
                        <span className="text-zinc-600">•</span>
                      </>
                    )}
                    <span className="font-mono text-zinc-400 text-[11px] sm:text-xs">
                      {t.recordingSid ? `SID: ${t.recordingSid}` : `ID: ${t.id.slice(0, 12)}...`}
                    </span>
                    <span className="text-zinc-600">•</span>
                    <span className="text-zinc-400">{t.language || 'en-US'}</span>
                    <span className="text-zinc-600">•</span>
                    <span className="text-zinc-400">{t.wordCount || 0} words</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {t.rawPayload?.model && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-zinc-800 text-zinc-400 border border-zinc-700">
                        {t.rawPayload.model}
                      </span>
                    )}
                    <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase font-bold">
                      {t.status}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-zinc-200 bg-zinc-950/60 p-3 sm:p-4 rounded-lg border border-zinc-800/80 leading-relaxed font-sans break-words">
                  &ldquo;{t.text}&rdquo;
                </p>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
