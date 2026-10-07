'use client';

import React from 'react';
import {
  Phone,
  Mic,
  PhoneCall,
  MicOff,
  PhoneOff,
  CheckCircle,
  Plus,
  AlertTriangle,
  Volume2,
} from 'lucide-react';
import { useConsole } from '@/context/ConsoleContext';

export function CallModal() {
  const {
    showCallModal,
    setShowCallModal,
    webPhoneStatus,
    setWebPhoneStatus,
    webPhoneMuted,
    webPhoneDuration,
    webPhoneError,
    setWebPhoneError,
    formatCallTimer,
    handleStartBrowserCall,
    handleToggleMute,
    handleHangupBrowserCall,
    callMode,
    setCallMode,
    callDestination,
    setCallDestination,
    callFromNumber,
    setCallFromNumber,
    callForwardTo,
    setCallForwardTo,
    callRecord,
    setCallRecord,
    callTranscribe,
    setCallTranscribe,
    callLoading,
    handlePlaceCall,
    numbers,
    contactsList,
    setShowContactModal,
  } = useConsole();

  if (!showCallModal) return null;

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-lg w-full max-h-[92vh] overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-5 shadow-2xl">
        <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Phone className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">
                {webPhoneStatus === 'connected' ? 'Live In-Browser Voice Call' : 'Outbound Voice Calling'}
              </h3>
              <p className="text-[11px] text-zinc-400">
                {webPhoneStatus === 'connected'
                  ? 'Connected live via WebRTC • 2-way cloud recording active'
                  : 'Connect live with customers & record audio for AI itineraries'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              if (webPhoneStatus === 'calling' || webPhoneStatus === 'ringing' || webPhoneStatus === 'connected') {
                handleHangupBrowserCall();
              }
              setShowCallModal(false);
              setWebPhoneStatus('idle');
              setWebPhoneError(null);
            }}
            className="text-zinc-500 hover:text-zinc-300 p-1 rounded-lg"
          >
            ✕
          </button>
        </div>

        {/* CALL MODE TABS: BROWSER VS BRIDGE */}
        {webPhoneStatus !== 'calling' && webPhoneStatus !== 'ringing' && webPhoneStatus !== 'connected' && (
          <div className="grid grid-cols-2 gap-2 bg-zinc-950 p-1.5 rounded-xl border border-zinc-800">
            <button
              type="button"
              onClick={() => setCallMode('browser')}
              className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition ${
                callMode === 'browser'
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-950'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Mic className="w-3.5 h-3.5" />
              <span>In-Browser Headset</span>
              <span className="text-[9px] bg-emerald-400/20 text-emerald-300 px-1.5 py-0.5 rounded font-mono">1-Leg</span>
            </button>
            <button
              type="button"
              onClick={() => setCallMode('bridge')}
              className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition ${
                callMode === 'bridge'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-950'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <PhoneCall className="w-3.5 h-3.5" />
              <span>Mobile Phone Bridge</span>
            </button>
          </div>
        )}

        {/* ACTIVE IN-BROWSER CALL INTERFACE */}
        {(webPhoneStatus === 'calling' || webPhoneStatus === 'ringing' || webPhoneStatus === 'connected') ? (
          <div className="py-6 flex flex-col items-center justify-center space-y-5 bg-zinc-950 rounded-xl border border-emerald-900/30 p-6">
            <div className="relative flex items-center justify-center">
              <div className="w-20 h-20 rounded-full bg-emerald-500/15 border-2 border-emerald-500 flex items-center justify-center text-emerald-400">
                <Mic className="w-8 h-8 animate-pulse" />
              </div>
              <div className="absolute -inset-2 rounded-full border border-emerald-400/30 animate-ping pointer-events-none" />
            </div>

            <div className="text-center space-y-1">
              <div className="text-lg font-bold text-white tracking-tight">{callDestination}</div>
              <div className="text-xs text-zinc-400 flex items-center justify-center gap-2">
                {webPhoneStatus === 'calling' && (
                  <span className="text-amber-400 flex items-center gap-1.5 font-medium">
                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                    Connecting... (Playing dot caller tune • • •)
                  </span>
                )}
                {webPhoneStatus === 'ringing' && (
                  <span className="text-sky-400 flex items-center gap-1.5 font-medium">
                    <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
                    Ringing customer line... (Playing ringing caller tune 🎵)
                  </span>
                )}
                {webPhoneStatus === 'connected' && (
                  <span className="text-emerald-400 font-bold font-mono text-sm flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    Live Call In Progress: {formatCallTimer(webPhoneDuration)}
                  </span>
                )}
              </div>
            </div>

            {/* Soundwave animation */}
            <div className="flex items-center gap-1.5 h-8">
              <span className="w-1.5 bg-emerald-400 rounded-full animate-bounce h-4" />
              <span className="w-1.5 bg-emerald-400 rounded-full animate-bounce h-7 delay-75" />
              <span className="w-1.5 bg-emerald-400 rounded-full animate-bounce h-3 delay-150" />
              <span className="w-1.5 bg-emerald-400 rounded-full animate-bounce h-6 delay-100" />
              <span className="w-1.5 bg-emerald-400 rounded-full animate-bounce h-8 delay-200" />
              <span className="w-1.5 bg-emerald-400 rounded-full animate-bounce h-5 delay-75" />
              <span className="w-1.5 bg-emerald-400 rounded-full animate-bounce h-3 delay-150" />
            </div>

            <div className="p-2.5 bg-zinc-900 border border-zinc-800 rounded-lg text-[11px] text-zinc-400 text-center max-w-sm">
              🎧 Speaking live via your browser microphone. Audio is being recorded on Plivo cloud and will be transcribed for AI itinerary generation.
            </div>

            {/* Call Controls */}
            <div className="flex items-center gap-4 pt-2">
              <button
                type="button"
                onClick={handleToggleMute}
                className={`p-3 rounded-full border transition flex items-center justify-center ${
                  webPhoneMuted
                    ? 'bg-amber-500/20 border-amber-500/50 text-amber-400'
                    : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:text-white hover:bg-zinc-700'
                }`}
                title={webPhoneMuted ? 'Unmute Microphone' : 'Mute Microphone'}
              >
                {webPhoneMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>

              <button
                type="button"
                onClick={handleHangupBrowserCall}
                className="px-6 py-2.5 rounded-full bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-rose-600/30 transition hover:scale-105"
              >
                <PhoneOff className="w-4 h-4" />
                <span>Hang Up (End Call)</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 text-xs">
            {webPhoneError && (
              <div className="p-3 bg-rose-950/40 border border-rose-800/60 rounded-xl text-rose-300 text-xs flex items-center justify-between">
                <span>{webPhoneError}</span>
                <button onClick={() => setWebPhoneError(null)} className="text-rose-400 hover:text-white">✕</button>
              </div>
            )}

            {webPhoneStatus === 'ended' && (
              <div className="p-3 bg-emerald-950/40 border border-emerald-800/60 rounded-xl text-emerald-300 text-xs flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Call completed successfully! Audio recording is now being transcribed for AI travel itinerary generation.</span>
              </div>
            )}

            {/* From Line */}
            <div>
              <label className="text-zinc-400 block mb-1">From Virtual Line</label>
              <select
                value={callFromNumber}
                onChange={(e) => setCallFromNumber(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-200"
              >
                {numbers.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.e164} ({n.friendlyName})
                  </option>
                ))}
              </select>
            </div>

            {/* Recipient Contact */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-zinc-400 block">Recipient Contact</label>
                <button
                  type="button"
                  onClick={() => {
                    setShowCallModal(false);
                    setShowContactModal(true);
                  }}
                  className="text-[11px] text-emerald-400 hover:underline flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Add Contact
                </button>
              </div>
              {contactsList.length === 0 ? (
                <div className="p-3 bg-amber-950/40 border border-amber-800/60 rounded-lg text-amber-300 text-xs space-y-2">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold">No contacts registered</p>
                      <p className="text-[11px] text-amber-400/80">Company policy requires selecting a verified contact before dialing.</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowCallModal(false);
                      setShowContactModal(true);
                    }}
                    className="w-full py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded text-xs font-semibold"
                  >
                    + Add Verified Contact First
                  </button>
                </div>
              ) : (
                <select
                  value={callDestination}
                  onChange={(e) => setCallDestination(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-200"
                >
                  <option value="">-- Select Contact to Call --</option>
                  {contactsList.map((c) => (
                    <option key={c.id} value={c.phone}>
                      {c.name} ({c.phone}) {c.company ? `— ${c.company}` : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* In-Browser Mode Banner */}
            {callMode === 'browser' && (
              <div className="p-3.5 bg-gradient-to-br from-emerald-950/40 to-teal-950/20 border border-emerald-800/50 rounded-xl space-y-2 text-xs text-emerald-300">
                <div className="flex items-center gap-2 font-bold text-white">
                  <Volume2 className="w-4 h-4 text-emerald-400" />
                  <span>Direct In-Browser Voice Calling (WebRTC)</span>
                </div>
                <p className="text-[11px] text-zinc-300 leading-relaxed">
                  You will speak and listen directly through your computer headset or microphone. Plivo dials the customer's phone from <span className="font-mono text-emerald-400 font-semibold">+918065531234</span> and connects them live to your browser.
                </p>
                <div className="flex items-center gap-2 pt-1 text-[11px] text-emerald-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Zero Mobile Charges • Single-Leg Cost • Cloud 2-Way Recording Active</span>
                </div>
              </div>
            )}

            {/* Phone-to-Phone Bridge Fields */}
            {callMode === 'bridge' && (
              <div className="p-3.5 bg-indigo-950/40 border border-indigo-800/60 rounded-xl space-y-2">
                <div className="flex items-center gap-1.5 text-indigo-300 font-semibold text-xs">
                  <PhoneCall className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Your Staff / Agent Mobile Phone Number</span>
                </div>
                <input
                  type="text"
                  placeholder="e.g. +919876543210 (your mobile phone)"
                  value={callForwardTo}
                  onChange={(e) => setCallForwardTo(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-200 text-xs font-mono focus:border-indigo-500"
                />
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  Plivo calls the customer's phone and calls your mobile phone, bridging both phones over cellular lines.
                </p>
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <span className="text-zinc-300">Record Call</span>
              <input
                type="checkbox"
                checked={callRecord}
                onChange={(e) => setCallRecord(e.target.checked)}
                className="rounded bg-zinc-950 border-zinc-800 text-emerald-600"
              />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-zinc-300">Transcribe Audio & Generate Itinerary</span>
              <input
                type="checkbox"
                checked={callTranscribe}
                onChange={(e) => setCallTranscribe(e.target.checked)}
                className="rounded bg-zinc-950 border-zinc-800 text-emerald-600"
              />
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setShowCallModal(false)}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs"
              >
                Cancel
              </button>

              {callMode === 'browser' ? (
                <button
                  type="button"
                  onClick={handleStartBrowserCall}
                  disabled={!callDestination || contactsList.length === 0}
                  className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-lg text-xs font-bold shadow-lg shadow-emerald-600/25 flex items-center gap-2 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Mic className="w-4 h-4" />
                  <span>Start In-Browser Call (Connect Mic)</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handlePlaceCall}
                  disabled={callLoading || !callDestination || !callForwardTo || contactsList.length === 0}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold shadow-lg shadow-indigo-600/25 flex items-center gap-2 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <PhoneCall className="w-4 h-4" />
                  <span>{callLoading ? 'Initiating...' : 'Dial via Mobile Bridge'}</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
