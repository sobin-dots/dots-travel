'use client';

import React from 'react';
import { Search } from 'lucide-react';
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
          filteredTranscripts.map((t) => (
            <div key={t.id} className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-4 sm:p-5 space-y-3">
              <div className="flex items-center justify-between text-xs flex-wrap gap-2">
                <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                  <span className="font-mono text-zinc-300 font-medium text-[11px] sm:text-xs">SID: {t.recordingSid}</span>
                  <span className="text-zinc-500">•</span>
                  <span className="text-zinc-400">{t.language || 'en-US'}</span>
                  <span className="text-zinc-500">•</span>
                  <span className="text-zinc-400">{t.wordCount || 18} words</span>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase font-bold shrink-0">
                  {t.status}
                </span>
              </div>
              <p className="text-xs text-zinc-200 bg-zinc-950/60 p-3 sm:p-4 rounded-lg border border-zinc-800/80 leading-relaxed font-sans break-words">
                &ldquo;{t.text}&rdquo;
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
