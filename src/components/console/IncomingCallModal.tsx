'use client';

import React from 'react';
import { Phone, PhoneOff, PhoneIncoming, User, Building } from 'lucide-react';
import { useConsole } from '@/context/ConsoleContext';

export function IncomingCallModal() {
  const {
    incomingCall,
    handleAnswerIncomingCall,
    handleRejectIncomingCall,
    contactsList,
  } = useConsole();

  if (!incomingCall) return null;

  // Match caller phone number against verified contact directory
  const callerPhoneClean = (incomingCall.callerId || '').replace(/\D/g, '');
  const matchedContact = contactsList.find((c) => {
    if (!c.phone) return false;
    const cClean = c.phone.replace(/\D/g, '');
    return c.phone === incomingCall.callerId || (callerPhoneClean && cClean === callerPhoneClean);
  });

  return (
    <div className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-zinc-900 border-2 border-emerald-500/50 rounded-2xl p-6 shadow-2xl shadow-emerald-950/50 space-y-6 text-center relative overflow-hidden">
        {/* Glow ambient background effect */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Pulsing ringing avatar */}
        <div className="relative mx-auto w-20 h-20 flex items-center justify-center">
          <div className="w-20 h-20 rounded-full bg-emerald-500/20 border-2 border-emerald-500 flex items-center justify-center text-emerald-400 z-10">
            <PhoneIncoming className="w-9 h-9 animate-bounce text-emerald-400" />
          </div>
          <div className="absolute inset-0 rounded-full border-2 border-emerald-400/40 animate-ping pointer-events-none" />
          <div className="absolute -inset-3 rounded-full border border-emerald-500/20 animate-pulse pointer-events-none" />
        </div>

        {/* Caller Info */}
        <div className="space-y-1.5 relative z-10">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span>Incoming Call (Web Phone)</span>
          </div>

          <h3 className="text-xl font-bold text-white tracking-tight mt-2">
            {matchedContact ? matchedContact.name : incomingCall.callerId}
          </h3>

          {matchedContact ? (
            <div className="text-xs text-zinc-400 flex items-center justify-center gap-2">
              <span className="font-mono text-emerald-400">{matchedContact.phone}</span>
              {matchedContact.company && (
                <>
                  <span className="text-zinc-600">•</span>
                  <span className="text-zinc-300">{matchedContact.company}</span>
                </>
              )}
            </div>
          ) : (
            <p className="text-xs text-zinc-400 font-mono">
              Direct Inbound Call • Ready to Connect
            </p>
          )}
        </div>

        {/* Action Buttons: Answer (Green) & Decline (Red) */}
        <div className="grid grid-cols-2 gap-3 pt-2 relative z-10">
          <button
            type="button"
            onClick={handleRejectIncomingCall}
            className="w-full py-3 px-4 rounded-xl bg-zinc-800 hover:bg-rose-950/70 border border-zinc-700 hover:border-rose-700 text-zinc-200 hover:text-rose-300 font-semibold text-xs flex items-center justify-center gap-2 transition cursor-pointer"
          >
            <PhoneOff className="w-4 h-4 text-rose-400" />
            <span>Decline</span>
          </button>

          <button
            type="button"
            onClick={handleAnswerIncomingCall}
            className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30 transition hover:scale-[1.02] cursor-pointer"
          >
            <Phone className="w-4 h-4" />
            <span>Answer Call</span>
          </button>
        </div>

        <p className="text-[11px] text-zinc-500 relative z-10">
          Answering connects microphone audio immediately via WebRTC. Two-way call audio will be recorded and transcribed.
        </p>
      </div>
    </div>
  );
}
