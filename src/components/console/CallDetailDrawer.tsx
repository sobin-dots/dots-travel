'use client';

import React, { useRef } from 'react';
import {
  RefreshCw,
  RotateCcw,
  Mic,
  FileText,
  Sparkles,
  Loader2,
  AlertCircle,
  Clock,
} from 'lucide-react';
import { useConsole } from '@/context/ConsoleContext';

export function CallDetailDrawer() {
  const {
    selectedCallDetail,
    setSelectedCallDetail,
    callDetailSyncing,
    refreshCallDetail,
    handleSendDtmf,
    sendingDtmfDigits,
    handleHangupLiveCall,
    hangingUpCallId,
    handleTriggerTranscription,
    handleTriggerCallTranscription,
    transcribingRecId,
    transcribingProvider,
    generatingItineraryCallId,
    openItineraryIntakeModal,
    integrationsSummary,
  } = useConsole();

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const openaiInteg = integrationsSummary?.integrations?.find((i: any) => i.provider === 'openai');
  const configuredTranscriptionModel = openaiInteg?.metadata?.model || 'gpt-4o-transcribe';

  if (!selectedCallDetail) return null;

  // Select the single primary recording (preferring non-zero duration / transcribed recording) so only one audio player is shown
  const primaryRecording = (() => {
    const recs = Array.isArray(selectedCallDetail.recordings) ? selectedCallDetail.recordings : [];
    if (recs.length === 0) return null;
    if (recs.length === 1) return recs[0];
    const sorted = [...recs].sort((a: any, b: any) => {
      const aDur = Number(a.durationSeconds || 0);
      const bDur = Number(b.durationSeconds || 0);
      if (bDur !== aDur) return bDur - aDur;
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bTime - aTime;
    });
    return sorted[0];
  })();

  const handleReplayAudio = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {});
    }
  };

  const formattedCallTimestamp = selectedCallDetail.startedAt
    ? new Date(selectedCallDetail.startedAt).toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      })
    : '—';

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
              onClick={() => refreshCallDetail(selectedCallDetail.id, true)}
              disabled={callDetailSyncing}
              className="text-xs text-zinc-400 hover:text-white p-1.5 rounded hover:bg-zinc-800 transition flex items-center gap-1"
              title="Retry syncing recording and transcript from carrier"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${callDetailSyncing ? 'animate-spin text-emerald-400' : ''}`} />
              <span className="text-[10px] font-mono">Retry Sync</span>
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
          <div className="flex items-start justify-between gap-2">
            <div>
              <span className="text-zinc-500 block text-[10px]">Call UUID</span>
              <span className="font-mono text-zinc-200">{selectedCallDetail.plivoCallUuid}</span>
            </div>
            <div className="text-right">
              <span className="text-zinc-500 block text-[10px]">Timestamp</span>
              <span className="font-mono text-zinc-300 flex items-center gap-1 justify-end">
                <Clock className="w-3 h-3 text-indigo-400" />
                {formattedCallTimestamp}
              </span>
            </div>
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
              {(['1', '2', '#'] as const).map((digit) => (
                <button
                  key={digit}
                  type="button"
                  disabled={Boolean(sendingDtmfDigits)}
                  onClick={() => handleSendDtmf(selectedCallDetail.id, digit)}
                  className="p-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 rounded text-center font-mono font-bold flex items-center justify-center gap-1"
                >
                  {sendingDtmfDigits === digit && <Loader2 className="w-3 h-3 animate-spin" />}
                  <span>{digit}</span>
                </button>
              ))}
            </div>
            <button
              type="button"
              disabled={hangingUpCallId === selectedCallDetail.id}
              onClick={() => handleHangupLiveCall(selectedCallDetail.id)}
              className="w-full py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white rounded font-bold flex items-center justify-center gap-1.5"
            >
              {hangingUpCallId === selectedCallDetail.id && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{hangingUpCallId === selectedCallDetail.id ? 'Terminating...' : 'Terminate Call'}</span>
            </button>
          </div>
        )}

        {/* Call Audio Recording (Strictly Single Player + Replay Button) */}
        <div className="space-y-2 bg-zinc-950 p-4 rounded-xl border border-zinc-800 text-xs">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="font-bold text-zinc-200 flex items-center gap-1.5">
              <Mic className="w-3.5 h-3.5 text-emerald-400" />
              Call Audio Recording
            </span>
            <div className="flex items-center gap-2">
              {primaryRecording && (
                <button
                  type="button"
                  onClick={handleReplayAudio}
                  className="text-[10px] font-mono px-2.5 py-0.5 rounded bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 flex items-center gap-1 transition cursor-pointer"
                  title="Replay audio recording from the beginning"
                >
                  <RotateCcw className="w-3 h-3 text-indigo-400" />
                  <span>Replay Audio</span>
                </button>
              )}
              {primaryRecording ? (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/60">
                  MP3 Audio Ready
                </span>
              ) : selectedCallDetail.isRecordingProcessing || callDetailSyncing ? (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950/80 text-amber-400 border border-amber-800/50 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                  Processing
                </span>
              ) : (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-950/80 text-rose-400 border border-rose-800/60">
                  No Audio Recording Available
                </span>
              )}
            </div>
          </div>
          {primaryRecording ? (
            <div key={primaryRecording.id} className="pt-2 space-y-2">
              <audio
                ref={audioRef}
                controls
                className="w-full h-9 rounded bg-zinc-900 border border-zinc-800"
                src={`/api/v1/recordings/${primaryRecording.id}/stream`}
              />
              <div className="flex items-center justify-between text-[11px] text-zinc-500 font-mono">
                <span>ID: {primaryRecording.plivoRecordingId}</span>
                <span>Duration: {primaryRecording.durationSeconds || selectedCallDetail.durationSeconds || 0}s</span>
              </div>
            </div>
          ) : selectedCallDetail.isRecordingProcessing || callDetailSyncing ? (
            <div className="p-4 bg-zinc-900/60 border border-emerald-900/30 rounded-xl space-y-3 mt-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-emerald-400 font-semibold text-xs">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Checking Carrier for Call Recording...</span>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-400 border border-emerald-800/50 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  Syncing
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 leading-relaxed text-center">
                Checking Plivo carrier for any active or recently encoded dual-channel call recording.
              </p>
            </div>
          ) : (
            <div className="p-3.5 bg-zinc-900/60 border border-rose-900/40 rounded-xl space-y-2.5 mt-2">
              <div className="flex items-start gap-2 text-rose-300 text-xs">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold">No Audio Recording Available</div>
                  <p className="text-[11px] text-zinc-400 mt-0.5 leading-relaxed">
                    {selectedCallDetail.recordingError ||
                      'No recording was found for this call on the carrier. Auto-polling has been stopped.'}
                  </p>
                </div>
              </div>
              <div className="pt-1 flex justify-end border-t border-zinc-800/60">
                <button
                  type="button"
                  onClick={() => refreshCallDetail(selectedCallDetail.id, true)}
                  disabled={callDetailSyncing}
                  className="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-3 py-1 rounded border border-zinc-700 flex items-center gap-1.5 transition"
                >
                  <RefreshCw className={`w-3 h-3 ${callDetailSyncing ? 'animate-spin' : ''}`} />
                  <span>Retry Recording Check</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Call Speech Transcription */}
        <div className="space-y-2 bg-zinc-950 p-4 rounded-xl border border-zinc-800 text-xs">
          <div className="flex items-center justify-between gap-1 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="font-bold text-zinc-200 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-indigo-400" />
                Call Speech Transcription
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1" title="Primary transcription model configured in Settings">
                <Sparkles className="w-2.5 h-2.5" />
                <span>{configuredTranscriptionModel}</span>
              </span>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              {/* Transcribe directly with Primary OpenAI Model */}
              <button
                type="button"
                onClick={() => {
                  if (primaryRecording) {
                    handleTriggerTranscription(primaryRecording.id, 'openai', configuredTranscriptionModel);
                  } else {
                    handleTriggerCallTranscription(selectedCallDetail.id, 'openai', configuredTranscriptionModel);
                  }
                }}
                disabled={
                  Boolean(transcribingRecId && primaryRecording?.id === transcribingRecId) ||
                  transcribingProvider === 'openai' ||
                  !primaryRecording
                }
                className="text-[10px] bg-gradient-to-r from-emerald-600/20 to-teal-600/20 hover:from-emerald-600/30 hover:to-teal-600/30 text-emerald-300 px-2.5 py-1 rounded border border-emerald-500/30 flex items-center gap-1.5 transition disabled:opacity-50 cursor-pointer"
                title={`Transcribe call recording directly with OpenAI (${configuredTranscriptionModel})`}
              >
                <Sparkles className="w-3 h-3 text-emerald-400" />
                <span>
                  {transcribingProvider === 'openai'
                    ? `${configuredTranscriptionModel}...`
                    : `OpenAI (${configuredTranscriptionModel})`}
                </span>
              </button>
            </div>
          </div>

          {selectedCallDetail.transcriptions?.length > 0 ? (
            selectedCallDetail.transcriptions.map((tr: any) => {
              const modelLabel = tr.rawPayload?.model || configuredTranscriptionModel;
              return (
                <div key={tr.id} className="pt-2 space-y-1.5">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="px-2 py-0.5 rounded font-mono font-medium border flex items-center gap-1 bg-emerald-950/80 text-emerald-400 border-emerald-800/60">
                      <Sparkles className="w-2.5 h-2.5 text-emerald-400" />
                      <span>{`OpenAI (${modelLabel})`}</span>
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
          ) : selectedCallDetail.transcriptionError ? (
            <div className="p-3.5 bg-zinc-900/60 border border-rose-900/40 rounded-xl space-y-2.5 mt-2">
              <div className="flex items-start gap-2 text-rose-300 text-xs">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold">Transcription Failed</div>
                  <p className="text-[11px] text-zinc-400 mt-0.5 leading-relaxed">
                    {selectedCallDetail.transcriptionError}
                  </p>
                </div>
              </div>
              <div className="pt-1 flex justify-end border-t border-zinc-800/60">
                <button
                  type="button"
                  onClick={() => {
                    if (primaryRecording) {
                      handleTriggerTranscription(primaryRecording.id, 'openai', configuredTranscriptionModel);
                    } else {
                      refreshCallDetail(selectedCallDetail.id, true);
                    }
                  }}
                  disabled={transcribingProvider === 'openai' || callDetailSyncing}
                  className="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-3 py-1 rounded border border-zinc-700 flex items-center gap-1.5 transition"
                >
                  <RefreshCw className={`w-3 h-3 ${transcribingProvider === 'openai' || callDetailSyncing ? 'animate-spin' : ''}`} />
                  <span>Retry Transcription</span>
                </button>
              </div>
            </div>
          ) : !primaryRecording ? (
            <div className="p-3.5 bg-zinc-900/60 border border-zinc-800 rounded-xl text-[11px] text-zinc-400 mt-2">
              No audio recording is available to transcribe for this call. You can still click <strong>Generate Itinerary with AI</strong> below and enter trip details manually.
            </div>
          ) : (
            <div className="p-4 bg-zinc-900/60 border border-indigo-900/30 rounded-xl space-y-3 mt-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-indigo-400 font-semibold text-xs">
                  {transcribingProvider === 'openai' ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5" />
                  )}
                  <span>{transcribingProvider === 'openai' ? 'Transcribing with OpenAI...' : 'Ready for OpenAI Transcription'}</span>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-400 border border-emerald-800/50 flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3 text-emerald-400" />
                  <span>Primary: {configuredTranscriptionModel}</span>
                </span>
              </div>

              <p className="text-[11px] text-zinc-400 leading-relaxed text-center">
                Generate transcription directly using your primary OpenAI model{' '}
                <span className="text-emerald-400 font-mono font-semibold">({configuredTranscriptionModel})</span> configured in Settings.
              </p>
              <div className="pt-1 flex justify-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    if (primaryRecording) {
                      handleTriggerTranscription(primaryRecording.id, 'openai', configuredTranscriptionModel);
                    } else {
                      handleTriggerCallTranscription(selectedCallDetail.id, 'openai', configuredTranscriptionModel);
                    }
                  }}
                  disabled={transcribingProvider === 'openai'}
                  className="px-3.5 py-2 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold text-xs flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition disabled:opacity-50 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>
                    {transcribingProvider === 'openai'
                      ? `Transcribing with ${configuredTranscriptionModel}...`
                      : `Transcribe with OpenAI (${configuredTranscriptionModel})`}
                  </span>
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
                onClick={() => openItineraryIntakeModal(selectedCallDetail)}
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
