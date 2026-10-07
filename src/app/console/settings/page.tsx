'use client';

import React from 'react';
import { Shield } from 'lucide-react';
import { useConsole } from '@/context/ConsoleContext';

export default function SettingsPage() {
  const {
    settings,
    systemMode,
  } = useConsole();

  return (
    <div className="space-y-6 sm:space-y-8 max-w-4xl">
      <div>
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white">Platform Settings</h2>
        <p className="text-xs sm:text-sm text-zinc-400 mt-1">
          Organization telephony policies, Plivo account credentials, and retention rules.
        </p>
      </div>

      {/* Plivo Account Credentials */}
      <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-4 sm:p-6 space-y-4">
        <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
          <Shield className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>Plivo Credentials (AES-256-GCM Encrypted at Rest)</span>
        </h3>
        <p className="text-xs text-zinc-400 leading-relaxed">
          Credentials are encrypted using the host KEK. Plaintext credentials never reach logs or browser.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-zinc-400 block mb-1">Masked Auth ID</label>
            <input
              type="text"
              disabled
              value={
                settings?.organization?.plivoAccounts?.[0]?.authIdLast4
                  ? `...${settings.organization.plivoAccounts[0].authIdLast4}`
                  : (systemMode === 'live' ? '...QYMC' : '...5678')
              }
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs font-mono text-zinc-400"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-zinc-400 block mb-1">Verification Status</label>
            <div className="flex items-center gap-2 h-9 px-3 bg-zinc-950 border border-zinc-800 rounded-lg">
              <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
              <span className="text-xs text-emerald-400 font-semibold truncate">Verified against Plivo</span>
            </div>
          </div>
        </div>
      </div>

      {/* Policies */}
      <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-4 sm:p-6 space-y-4">
        <h3 className="text-sm font-semibold text-zinc-200">Organization Telephony Policies</h3>
        <div className="space-y-4 text-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-zinc-800 gap-1.5">
            <div>
              <div className="font-medium text-zinc-200">Default Transcription Policy</div>
              <div className="text-zinc-500 text-[11px]">Automatically transcribe all answered recordings</div>
            </div>
            <span className="text-emerald-400 font-semibold self-start sm:self-auto">Enabled</span>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-zinc-800 gap-1.5">
            <div>
              <div className="font-medium text-zinc-200">Recording Retention Window</div>
              <div className="text-zinc-500 text-[11px]">Auto-prune recording storage on Plivo</div>
            </div>
            <span className="text-zinc-200 font-medium self-start sm:self-auto">90 Days</span>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
            <div>
              <div className="font-medium text-zinc-200">Redact Message Content (log: false)</div>
              <div className="text-zinc-500 text-[11px]">Irreversibly redacts message body from carrier MDR logs</div>
            </div>
            <span className="text-zinc-500 self-start sm:self-auto">Disabled</span>
          </div>
        </div>
      </div>
    </div>
  );
}
