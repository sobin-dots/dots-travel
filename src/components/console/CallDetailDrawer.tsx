'use client';

import React from 'react';
import {
  RefreshCw,
  Mic,
  FileText,
  Sparkles,
} from 'lucide-react';
import { useConsole } from '@/context/ConsoleContext';

export function CallDetailDrawer() {
  const {
    selectedCallDetail,
    setSelectedCallDetail,
    callDetailSyncing,
    refreshCallDetail,
    handleSendDtmf,
    handleHangupLiveCall,
    handleTriggerTranscription,
    transcribingRecId,
    transcribingProvider,
    handleRefetchPlivoTranscriptionForCall,
    handleGenerateItinerary,
    generatingItineraryCallId,
  } = useConsole();

  if (!selectedCallDetail) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex justify-end">
      <div className="bg-zinc-900 border-l border-zinc-800 w-full sm:max-w-md h-full p-4 sm:p-6 space-y-5 sm:space-y-6 overflow-y-auto">
        <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-white">Call Detail & Timeline</h3>
            {callDetailSyncing && (
              <span className="text-[10px] text-emerald-400 flex items-center gap-1 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800/40">
                <RefreshCw className="w-2.5 h-2.5 animate-spin" /> Syncing...
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => refreshCallDetail(selectedCallDetail.id)}
              disabled={callDetailSyncing}
              className="text-xs text-zinc-400 hover:text-white p-1.5 rounded hover:bg-zinc-800 transition flex items-center gap-1"
              title="Sync latest recording and transcript from carrier"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${callDetailSyncing ? 'animate-spin text-emerald-400' : ''}`} />
              <span className="text-[10px] font-mono">Sync</span>
            </button>
            <button
              type="button"
              onClick={() => setSelectedCallDetail(null)}
              className="text-zinc-500 hover:text-zinc-300 text-sm p-1"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="space-y-3 bg-zinc-950 p-4 rounded-xl border border-zinc-800 text-xs">
          <div>
            <span className="text-zinc-500 block text-[10px]">Call UUID</span>
            <span className="font-mono text-zinc-200">{selectedCallDetail.plivoCallUuid}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-zinc-500 block text-[10px]">From</span>
              <span className="font-mono text-zinc-200">{selectedCallDetail.from}</span>
            </div>
            <div>
              <span className="text-zinc-500 block text-[10px]">To</span>
              <span className="font-mono text-zinc-200">{selectedCallDetail.to}</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-zinc-500 block text-[10px]">Duration</span>
              <span className="text-zinc-200">{selectedCallDetail.durationSeconds || 0}s</span>
            </div>
            <div>
              <span className="text-zinc-500 block text-[10px]">Bill Duration</span>
              <span className="text-zinc-200">{selectedCallDetail.billDurationSeconds || 0}s</span>
            </div>
          </div>
          <div>
            <span className="text-zinc-500 block text-[10px]">Hangup Explanation</span>
            <span className="text-amber-400 font-medium">{selectedCallDetail.hangupExplanation}</span>
          </div>
        </div>

        {/* Live Controls if Call is in-progress */}
        {selectedCallDetail.status === 'in-progress' && (
          <div className="bg-zinc-950 p-4 rounded-xl border border-indigo-500/30 space-y-3 text-xs">
            <div className="font-bold text-indigo-400 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
              Live Call Controls
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleSendDtmf(selectedCallDetail.id, '1')}
                className="p-2 bg-zinc-800 hover:bg-zinc-700 rounded text-center font-mono font-bold"
              >
                1
              </button>
              <button
                type="button"
                onClick={() => handleSendDtmf(selectedCallDetail.id, '2')}
                className="p-2 bg-zinc-800 hover:bg-zinc-700 rounded text-center font-mono font-bold"
              >
                2
              </button>
              <button
                type="button"
                onClick={() => handleSendDtmf(selectedCallDetail.id, '#')}
                className="p-2 bg-zinc-800 hover:bg-zinc-700 rounded text-center font-mono font-bold"
              >
                #
              </button>
            </div>
            <button
              type="button"
              onClick={() => handleHangupLiveCall(selectedCallDetail.id)}
              className="w-full py-2 bg-rose-600 hover:bg-rose-500 text-white rounded font-bold"
            >
              Terminate Call
            </button>
          </div>
        )}

        {/* Call Audio Recording */}
        <div className="space-y-2 bg-zinc-950 p-4 rounded-xl border border-zinc-800 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-bold text-zinc-200 flex items-center gap-1.5">
              <Mic className="w-3.5 h-3.5 text-emerald-400" />
              Call Audio Recording
            </span>
            {selectedCallDetail.recordings?.length > 0 ? (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/60">
                MP3 Audio Ready
              </span>
            ) : (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950/80 text-amber-400 border border-amber-800/50 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                Processing
              </span>
            )}
          </div>
          {selectedCallDetail.recordings?.length > 0 ? (
            selectedCallDetail.recordings.map((rec: any) => (
              <div key={rec.id} className="pt-2 space-y-2">
                <audio
                  controls
                  className="w-full h-9 rounded bg-zinc-900 border border-zinc-800"
                  src={`/api/v1/recordings/${rec.id}/stream`}
                />
                <div className="flex items-center justify-between text-[11px] text-zinc-500 font-mono">
                  <span>ID: {rec.plivoRecordingId}</span>
                  <span>Duration: {rec.durationSeconds || selectedCallDetail.durationSeconds || 0}s</span>
                </div>
              </div>
            ))
          ) : (
            <div className="p-4 bg-zinc-900/60 border border-emerald-900/30 rounded-xl space-y-3 mt-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-emerald-400 font-semibold text-xs">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Processing Call Recording...</span>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-400 border border-emerald-800/50 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  Carrier Syncing
                </span>
              </div>

              {/* Soundwave animation */}
              <div className="flex items-center justify-center gap-1.5 py-2">
                <span className="w-1.5 bg-emerald-500/70 rounded-full animate-bounce h-4" />
                <span className="w-1.5 bg-emerald-500/80 rounded-full animate-bounce h-7 delay-75" />
                <span className="w-1.5 bg-emerald-400 rounded-full animate-bounce h-3 delay-150" />
                <span className="w-1.5 bg-emerald-500/90 rounded-full animate-bounce h-6 delay-100" />
                <span className="w-1.5 bg-emerald-400 rounded-full animate-bounce h-8 delay-200" />
                <span className="w-1.5 bg-emerald-500/80 rounded-full animate-bounce h-5 delay-75" />
                <span className="w-1.5 bg-emerald-500/60 rounded-full animate-bounce h-3 delay-150" />
              </div>

              <p className="text-[11px] text-zinc-400 leading-relaxed text-center">
                Plivo carrier is rendering and encoding the dual-channel call recording. The audio file will appear automatically as soon as carrier encoding completes.
              </p>
              
              <div className="pt-1 flex items-center justify-between border-t border-zinc-800/60 text-[10px] text-zinc-500">
                <span>Auto-refreshing every 2.5s</span>
                <button
                  type="button"
                  onClick={() => refreshCallDetail(selectedCallDetail.id)}
                  disabled={callDetailSyncing}
                  className="text-emerald-400 hover:text-emerald-300 flex items-center gap-1 hover:underline font-medium"
                >
                  <RefreshCw className={`w-2.5 h-2.5 ${callDetailSyncing ? 'animate-spin' : ''}`} />
                  <span>Check Now</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Call Speech Transcription */}
        <div className="space-y-2 bg-zinc-950 p-4 rounded-xl border border-zinc-800 text-xs">
          <div className="flex items-center justify-between gap-1 flex-wrap">
            <span className="font-bold text-zinc-200 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-indigo-400" />
              Call Speech Transcription
            </span>
            <div className="flex items-center gap-1.5 flex-wrap">
              {/* Option to Refetch from Plivo */}
              <button
                type="button"
                onClick={() => {
                  if (selectedCallDetail.recordings?.length > 0) {
                    handleTriggerTranscription(selectedCallDetail.recordings[0].id, 'plivo');
                  } else {
                    handleRefetchPlivoTranscriptionForCall(selectedCallDetail.id);
                  }
                }}
                disabled={
                  (transcribingRecId && selectedCallDetail.recordings?.[0]?.id === transcribingRecId) ||
                  (transcribingProvider === 'plivo')
                }
                className="text-[10px] bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 px-2.5 py-1 rounded border border-blue-500/30 flex items-center gap-1.5 transition disabled:opacity-50"
                title="Refetch transcription directly from Plivo carrier REST API"
              >
                <RefreshCw className={`w-3 h-3 text-blue-400 ${transcribingProvider === 'plivo' ? 'animate-spin' : ''}`} />
                <span>
                  {transcribingProvider === 'plivo' ? 'Fetching Plivo...' : 'Refetch Plivo'}
                </span>
              </button>

              {/* Option to Transcribe with OpenAI Whisper */}
              {selectedCallDetail.recordings?.length > 0 && (
                <button
                  type="button"
                  onClick={() => handleTriggerTranscription(selectedCallDetail.recordings[0].id, 'openai')}
                  disabled={
                    (transcribingRecId && selectedCallDetail.recordings?.[0]?.id === transcribingRecId) ||
                    (transcribingProvider === 'openai')
                  }
                  className="text-[10px] bg-gradient-to-r from-emerald-600/20 to-teal-600/20 hover:from-emerald-600/30 hover:to-teal-600/30 text-emerald-300 px-2.5 py-1 rounded border border-emerald-500/30 flex items-center gap-1.5 transition disabled:opacity-50"
                  title="Transcribe recording audio using OpenAI Whisper"
                >
                  <Sparkles className="w-3 h-3 text-emerald-400" />
                  <span>
                    {transcribingProvider === 'openai' && transcribingRecId === selectedCallDetail.recordings[0].id
                      ? 'Whisper...'
                      : 'OpenAI Whisper'}
                  </span>
                </button>
              )}
            </div>
          </div>

          {selectedCallDetail.transcriptions?.length > 0 ? (
            selectedCallDetail.transcriptions.map((tr: any) => {
              const isWhisper = tr.source === 'openai_whisper';
              const isPlivo = tr.source === 'plivo' || tr.source === 'callback' || tr.source === 'on_demand';
              return (
                <div key={tr.id} className="pt-2 space-y-1.5">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className={`px-2 py-0.5 rounded font-mono font-medium border ${
                      isWhisper
                        ? 'bg-emerald-950/80 text-emerald-400 border-emerald-800/60'
                        : isPlivo
                        ? 'bg-blue-950/80 text-blue-400 border-blue-800/60'
                        : 'bg-zinc-800 text-zinc-300 border-zinc-700'
                    }`}>
                      {isWhisper ? 'OpenAI Whisper' : 'Plivo Carrier ASR'}
                    </span>
                    <span className="text-zinc-500 font-mono">
                      {tr.wordCount || 0} words • {tr.status}
                    </span>
                  </div>
                  <div className="bg-zinc-900 p-3 rounded-lg border border-zinc-800/80 font-mono text-zinc-300 text-xs whitespace-pre-line leading-relaxed">
                    {tr.text || '(Empty audio transcript)'}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="p-4 bg-zinc-900/60 border border-indigo-900/30 rounded-xl space-y-3 mt-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-indigo-400 font-semibold text-xs">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Ready for Transcription</span>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-950/80 text-indigo-400 border border-indigo-800/50 flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3 text-emerald-400" />
                  Carrier & AI Engine
                </span>
              </div>

              <p className="text-[11px] text-zinc-400 leading-relaxed text-center">
                Fetch the transcription directly from Plivo carrier or generate a high-fidelity transcript using OpenAI Whisper.
              </p>
              <div className="pt-1 flex justify-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    if (selectedCallDetail.recordings?.length > 0) {
                      handleTriggerTranscription(selectedCallDetail.recordings[0].id, 'plivo');
                    } else {
                      handleRefetchPlivoTranscriptionForCall(selectedCallDetail.id);
                    }
                  }}
                  disabled={transcribingProvider === 'plivo'}
                  className="px-3.5 py-2 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 font-semibold text-xs flex items-center gap-2 transition disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${transcribingProvider === 'plivo' ? 'animate-spin' : ''}`} />
                  <span>{transcribingProvider === 'plivo' ? 'Fetching Plivo...' : 'Fetch Plivo Transcription'}</span>
                </button>
                {selectedCallDetail.recordings?.length > 0 && (
                  <button
                    type="button"
                    onClick={() => handleTriggerTranscription(selectedCallDetail.recordings[0].id, 'openai')}
                    disabled={transcribingProvider === 'openai'}
                    className="px-3.5 py-2 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold text-xs flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition disabled:opacity-50"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{transcribingProvider === 'openai' ? 'Transcribing...' : 'Transcribe with OpenAI'}</span>
                  </button>
                )}
              </div>
              <div className="pt-1 flex items-center justify-between border-t border-zinc-800/60 text-[10px] text-zinc-500">
                <span>Auto-checking transcription webhook</span>
                <button
                  type="button"
                  onClick={() => refreshCallDetail(selectedCallDetail.id)}
                  disabled={callDetailSyncing}
                  className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1 hover:underline font-medium"
                >
                  <RefreshCw className={`w-2.5 h-2.5 ${callDetailSyncing ? 'animate-spin' : ''}`} />
                  <span>Check Now</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* AI Concierge Itinerary Generator */}
        {(() => {
          const isGenerating = generatingItineraryCallId === selectedCallDetail.id;

          return (
            <div className="bg-gradient-to-br from-indigo-950/40 via-violet-950/20 to-zinc-950 p-4 rounded-xl border border-indigo-500/30 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-white text-xs flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  AI Travel Concierge
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  Auto Itinerary
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                Convert customer travel preferences from this call into a personalized day-by-day itinerary and create a lead in Lead Management.
              </p>
              <button
                type="button"
                onClick={() => handleGenerateItinerary(selectedCallDetail.id)}
                disabled={isGenerating}
                className={`w-full py-2.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition shadow-md ${
                  !isGenerating
                    ? 'bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white shadow-indigo-600/20 cursor-pointer hover:scale-[1.01]'
                    : 'bg-zinc-800/80 text-zinc-500 cursor-not-allowed border border-zinc-700/50'
                }`}
              >
                {isGenerating ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-white" />
                    <span>Generating Itinerary with AI...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                    <span>Generate Itinerary with AI</span>
                  </>
                )}
              </button>
            </div>
          );
        })()}

        {/* Timeline Events */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold text-zinc-300">Carrier Event Timeline</h4>
          <div className="space-y-3 relative before:absolute before:inset-0 before:left-2 before:w-0.5 before:bg-zinc-800">
            {selectedCallDetail.events?.map((ev: any) => (
              <div key={ev.id} className="relative pl-6 text-xs space-y-0.5">
                <span className="absolute left-1 top-1 w-2.5 h-2.5 rounded-full bg-indigo-500 -translate-x-1" />
                <div className="font-semibold text-zinc-200 capitalize">{ev.eventType} Event</div>
                <div className="text-[10px] text-zinc-500">{new Date(ev.occurredAt).toLocaleTimeString()}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
