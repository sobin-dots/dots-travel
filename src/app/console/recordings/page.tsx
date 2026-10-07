'use client';

import React from 'react';
import { Sparkles, Download } from 'lucide-react';
import { useConsole } from '@/context/ConsoleContext';

export default function RecordingsPage() {
  const {
    recordings,
    handleTriggerTranscription,
    transcribingRecId,
  } = useConsole();

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white">Call Recordings</h2>
        <p className="text-xs sm:text-sm text-zinc-400 mt-1">
          Audio streaming proxied via short-lived signed URLs. Raw vendor URLs are never exposed.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {recordings.length === 0 ? (
          <div className="col-span-full py-12 text-center text-zinc-500 text-xs">
            No audio recordings available yet.
          </div>
        ) : (
          recordings.map((rec) => (
            <div key={rec.id} className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-4 sm:p-5 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-mono text-xs font-semibold text-zinc-200 truncate">{rec.plivoRecordingId}</div>
                  <div className="text-[11px] text-zinc-500 mt-0.5">Duration: {rec.durationSeconds || 45} seconds</div>
                </div>
                <span className="px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded text-[10px] font-medium shrink-0">
                  {rec.status}
                </span>
              </div>

              {/* Inline HTML5 Audio Player via Signed Proxy URL */}
              <div className="bg-zinc-950 p-2.5 sm:p-3 rounded-lg border border-zinc-800">
                <audio controls className="w-full h-8" src={rec.streamUrl}>
                  Your browser does not support audio element.
                </audio>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-zinc-800/80 gap-2 flex-wrap">
                <div className="text-[11px] text-zinc-500">Storage: $0.0003/mo</div>
                <div className="flex gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => handleTriggerTranscription(rec.id, 'openai')}
                    disabled={transcribingRecId === rec.id}
                    className="text-[11px] bg-gradient-to-r from-emerald-600/20 to-teal-600/20 hover:from-emerald-600/30 hover:to-teal-600/30 text-emerald-300 px-2.5 py-1 rounded border border-emerald-500/30 flex items-center gap-1.5 transition disabled:opacity-50"
                    title="Generate high-accuracy transcription using OpenAI Whisper"
                  >
                    <Sparkles className="w-3 h-3 text-emerald-400" />
                    <span>
                      {transcribingRecId === rec.id
                        ? 'Transcribing...'
                        : (rec.transcriptions?.length > 0 ? 'Re-transcribe' : 'Transcribe (OpenAI)')}
                    </span>
                  </button>
                  <a
                    href={rec.streamUrl}
                    download
                    className="text-[11px] bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-2.5 py-1 rounded border border-zinc-700 flex items-center gap-1"
                  >
                    <Download className="w-3 h-3" /> Download
                  </a>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
