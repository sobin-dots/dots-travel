'use client';

import React from 'react';
import Link from 'next/link';
import { RefreshCw, ExternalLink, User, LogOut, Menu, X } from 'lucide-react';
import { useConsole } from '@/context/ConsoleContext';

export function ConsoleHeader() {
  const {
    settings,
    systemMode,
    loading,
    fetchData,
    currentOrg,
    currentUser,
    handleSignOut,
    isMobileMenuOpen,
    setIsMobileMenuOpen,
  } = useConsole();

  const isLive = (settings?.telephonyMode || systemMode) === 'live';

  return (
    <header className="border-b border-zinc-800 bg-zinc-900/80 backdrop-blur sticky top-0 z-30 px-3 sm:px-6 py-2.5 sm:py-3 flex items-center justify-between">
      <div className="flex items-center gap-2 sm:gap-4">
        {/* Mobile Hamburger Toggle Button */}
        <button
          type="button"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="md:hidden p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
          aria-label={isMobileMenuOpen ? 'Close Navigation Menu' : 'Open Navigation Menu'}
        >
          {isMobileMenuOpen ? <X className="w-5 h-5 text-indigo-400" /> : <Menu className="w-5 h-5" />}
        </button>

        <Link href="/console" className="flex items-center gap-2 sm:gap-2.5">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center font-bold text-xs sm:text-sm text-white shadow-lg shadow-indigo-500/20 shrink-0">
            P
          </div>
          <div>
            <span className="font-bold text-xs sm:text-sm tracking-tight text-white block">Plivo Platform</span>
            <span className="text-[9px] sm:text-[10px] text-zinc-400 hidden xs:block -mt-0.5">Enterprise Operations Console</span>
          </div>
        </Link>

        <div className="h-4 w-px bg-zinc-800 mx-1 sm:mx-2 hidden sm:block" />

        {/* Telephony Mode Badge */}
        <div
          className={`hidden sm:flex items-center gap-1.5 sm:gap-2 border px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-xs transition ${
            isLive ? 'bg-emerald-950/80 border-emerald-700/80' : 'bg-zinc-950 border-zinc-800'
          }`}
        >
          <span
            className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full ${
              isLive ? 'bg-emerald-400 shadow-sm shadow-emerald-400' : 'bg-amber-400'
            } animate-pulse`}
          />
          <span className="text-zinc-300 font-medium text-[10px] sm:text-[11px] hidden md:inline">Mode:</span>
          <span
            className={`font-semibold uppercase tracking-wider text-[10px] sm:text-[11px] ${
              isLive ? 'text-emerald-400' : 'text-amber-400'
            }`}
          >
            {isLive ? 'LIVE' : 'SIM'}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-3">
        <button
          type="button"
          onClick={fetchData}
          className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-zinc-200 transition text-xs flex items-center gap-1 sm:gap-1.5 border border-zinc-800/80 cursor-pointer"
          title="Refresh Data"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">Sync</span>
        </button>

        <Link
          href="/docs"
          className="hidden md:flex text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-3 py-1.5 rounded-lg border border-zinc-700 items-center gap-1.5 transition"
        >
          <span>API Docs</span>
          <ExternalLink className="w-3 h-3" />
        </Link>

        <div className="hidden lg:block text-xs bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 px-3 py-1.5 rounded-lg font-medium max-w-[150px] truncate">
          {currentOrg?.name || 'Acme Communications'}
        </div>

        <Link
          href="/login"
          className="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-2 sm:px-2.5 py-1.5 rounded-lg border border-zinc-700 flex items-center gap-1.5 transition"
          title="Switch User / Login"
        >
          <User className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span className="max-w-[80px] sm:max-w-[120px] truncate hidden xs:inline">{currentUser?.name || 'Account'}</span>
        </Link>

        <button
          type="button"
          onClick={handleSignOut}
          className="text-xs text-zinc-400 hover:text-red-400 p-1.5 hover:bg-zinc-800 rounded-lg transition border border-transparent hover:border-zinc-700 cursor-pointer"
          title="Sign Out"
        >
          <LogOut className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
}
