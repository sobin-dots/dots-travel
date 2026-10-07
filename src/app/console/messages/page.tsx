'use client';

import React, { useState } from 'react';
import { Send, ArrowLeft } from 'lucide-react';
import { useConsole } from '@/context/ConsoleContext';
import { analyzeMessageEncoding } from '@/lib/telephony/messaging/encoder';

export default function MessagesPage() {
  const {
    threads,
    activeThreadId,
    setActiveThreadId,
    activeThreadMessages,
    smsText,
    setSmsText,
    smsSending,
    handleSendSms,
  } = useConsole();

  // On mobile screens, allow toggling back to thread list
  const [showMobileChat, setShowMobileChat] = useState(false);

  const smsAnalysis = analyzeMessageEncoding(smsText);
  const activeThread = threads.find((t) => t.id === activeThreadId);

  return (
    <div className="space-y-4 sm:space-y-6 max-w-6xl">
      <div>
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white">Two-Way Messaging</h2>
        <p className="text-xs sm:text-sm text-zinc-400 mt-1">
          Two-way SMS thread routing, automated character segmentation, and GSM-7/UCS-2 encoding analyzer.
        </p>
      </div>

      <div className="h-[calc(100vh-220px)] min-h-[500px] max-h-[750px] bg-zinc-900/40 border border-zinc-800/80 rounded-xl overflow-hidden flex flex-col md:flex-row">
        {/* Thread List: visible on desktop OR on mobile when not viewing chat */}
        <div
          className={`w-full md:w-80 border-b md:border-b-0 md:border-r border-zinc-800 flex flex-col bg-zinc-950/40 ${
            showMobileChat ? 'hidden md:flex' : 'flex'
          }`}
        >
          <div className="p-3.5 sm:p-4 border-b border-zinc-800 font-semibold text-xs text-zinc-200 flex items-center justify-between">
            <span>Conversations ({threads.length})</span>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-zinc-800/60">
            {threads.length === 0 ? (
              <div className="p-6 text-center text-zinc-500 text-xs">
                No conversations recorded yet.
              </div>
            ) : (
              threads.map((t) => {
                const isSelected = activeThreadId === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setActiveThreadId(t.id);
                      setShowMobileChat(true);
                    }}
                    className={`w-full p-3 sm:p-4 text-left transition ${
                      isSelected ? 'bg-zinc-800/60' : 'hover:bg-zinc-850/40'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono text-xs font-semibold text-zinc-200">{t.counterpartE164}</span>
                      <span className="text-[10px] text-zinc-500">
                        {new Date(t.lastMessageAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div className="text-[11px] text-zinc-400 truncate">
                      {t.lastMessage?.body || 'No messages yet'}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Thread Messages & Composer: visible on desktop OR on mobile when viewing chat */}
        <div
          className={`flex-1 flex flex-col bg-zinc-900/20 ${
            !showMobileChat ? 'hidden md:flex' : 'flex'
          }`}
        >
          {/* Active Chat Header */}
          <div className="p-3 sm:p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/40">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowMobileChat(false)}
                className="md:hidden p-1 -ml-1 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800"
                title="Back to conversations list"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div>
                <span className="text-xs font-semibold text-zinc-200">
                  {activeThread?.counterpartE164 || 'Select counterpart'}
                </span>
                <span className="text-[10px] text-zinc-500 block">Two-way carrier messaging</span>
              </div>
            </div>
          </div>

          {/* Messages Feed */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3 sm:space-y-4">
            {activeThreadMessages.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-zinc-500 text-center p-4">
                {activeThreadId ? 'No messages in this conversation yet.' : 'Select a conversation from the list to view messages.'}
              </div>
            ) : (
              activeThreadMessages.map((msg) => {
                const isOutbound = msg.direction === 'outbound';
                return (
                  <div key={msg.id} className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[85%] sm:max-w-md p-3 sm:p-3.5 rounded-xl text-xs space-y-1 ${
                        isOutbound
                          ? 'bg-indigo-600 text-white rounded-br-none shadow-md'
                          : 'bg-zinc-800 text-zinc-200 rounded-bl-none border border-zinc-700/60'
                      }`}
                    >
                      <div className="break-words">{msg.body}</div>
                      <div className="flex items-center justify-end gap-1.5 text-[10px] text-zinc-400">
                        <span>{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        {isOutbound && (
                          <span className="capitalize font-medium text-emerald-300">
                            • {msg.status}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Message Composer with GSM-7 vs UCS-2 Widget */}
          <div className="p-3 sm:p-4 border-t border-zinc-800 bg-zinc-950/70 space-y-2 sm:space-y-3">
            <div className="flex items-center justify-between text-[10px] sm:text-[11px] text-zinc-400 px-1 flex-wrap gap-1">
              <div className="flex items-center gap-2 sm:gap-3">
                <span>
                  Enc: <strong className="text-zinc-200">{smsAnalysis.encoding}</strong>
                </span>
                <span>
                  Units: <strong className="text-indigo-400">{smsAnalysis.units}</strong>
                </span>
                <span>
                  Chars: <strong>{smsAnalysis.charCount}</strong>
                </span>
              </div>
              <span className="hidden sm:inline">{smsAnalysis.remainingInUnit} chars remaining in unit</span>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Type SMS text..."
                value={smsText}
                onChange={(e) => setSmsText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendSms()}
                className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 sm:px-4 py-2 sm:py-2.5 text-xs text-zinc-100 focus:outline-none focus:border-indigo-500"
              />
              <button
                type="button"
                onClick={handleSendSms}
                disabled={smsSending || !smsText}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition shrink-0"
              >
                <Send className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Send</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
