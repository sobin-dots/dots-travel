'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import {
  RefreshCw,
  ExternalLink,
  User,
  LogOut,
  Menu,
  X,
  Building2,
  ChevronDown,
  Plus,
  Check,
  Shield,
  Radio,
} from 'lucide-react';
import { useConsole } from '@/context/ConsoleContext';

export function ConsoleHeader() {
  const {
    loading,
    fetchData,
    currentOrg,
    currentUser,
    handleSignOut,
    isMobileMenuOpen,
    setIsMobileMenuOpen,
    organizationsList,
    handleSwitchOrganization,
    setShowOrgModal,
  } = useConsole();

  const [orgDropdownOpen, setOrgDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOrgDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const activeProvider = currentOrg?.primaryTelephonyProvider || 'plivo';

  return (
    <header className="border-b border-zinc-800 bg-zinc-900/90 backdrop-blur sticky top-0 z-30 px-3 sm:px-6 py-2.5 sm:py-3 flex items-center justify-between">
      <div className="flex items-center gap-2 sm:gap-4">
        {/* Mobile Hamburger Toggle Button */}
        <button
          type="button"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="md:hidden p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition cursor-pointer"
          aria-label={isMobileMenuOpen ? 'Close Navigation Menu' : 'Open Navigation Menu'}
        >
          {isMobileMenuOpen ? <X className="w-5 h-5 text-indigo-400" /> : <Menu className="w-5 h-5" />}
        </button>

        <Link href="/console" className="flex items-center gap-2 sm:gap-2.5">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center font-bold text-xs sm:text-sm text-white shadow-lg shadow-indigo-500/20 shrink-0">
            TA
          </div>
          <div>
            <span className="font-bold text-xs sm:text-sm tracking-tight text-white block">Travel Agent</span>
            <span className="text-[9px] sm:text-[10px] text-zinc-400 hidden xs:block -mt-0.5">Enterprise Operations Console</span>
          </div>
        </Link>

        <div className="h-4 w-px bg-zinc-800 mx-1 sm:mx-2 hidden sm:block" />

        {/* Dynamic Carrier Connection Badge */}
        <div
          className={`hidden sm:flex items-center gap-1.5 sm:gap-2 border px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-xs ${
            activeProvider === 'msg91'
              ? 'border-cyan-700/80 bg-cyan-950/80 text-cyan-300'
              : 'border-emerald-700/80 bg-emerald-950/80 text-emerald-300'
          }`}
          title={`Active Telephony Provider: ${activeProvider.toUpperCase()}`}
        >
          <span
            className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full animate-pulse ${
              activeProvider === 'msg91' ? 'bg-cyan-400 shadow-cyan-400' : 'bg-emerald-400 shadow-emerald-400'
            }`}
          />
          <span className="text-zinc-400 font-medium text-[10px] sm:text-[11px] hidden md:inline">Carrier:</span>
          <span className="font-semibold uppercase tracking-wider text-[10px] sm:text-[11px]">
            {activeProvider === 'msg91' ? 'MSG91 LIVE' : 'PLIVO LIVE'}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-3">
        {/* Sync Data Button */}
        <button
          type="button"
          onClick={fetchData}
          className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-zinc-200 transition text-xs flex items-center gap-1 sm:gap-1.5 border border-zinc-800/80 cursor-pointer"
          title="Refresh Data"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">Sync</span>
        </button>

        {/* API Docs Link */}
        <Link
          href="/docs"
          className="hidden md:flex text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-3 py-1.5 rounded-lg border border-zinc-700 items-center gap-1.5 transition"
        >
          <span>API Docs</span>
          <ExternalLink className="w-3 h-3" />
        </Link>

        {/* Interactive Multi-Tenant Organization Switcher */}
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setOrgDropdownOpen(!orgDropdownOpen)}
            className="flex items-center gap-2 text-xs bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 text-indigo-200 px-2.5 sm:px-3 py-1.5 rounded-lg font-medium transition cursor-pointer max-w-[170px] sm:max-w-[220px]"
            title="Switch Tenant Organization"
          >
            <Building2 className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <span className="truncate">{currentOrg?.name || 'Loading Org...'}</span>
            <ChevronDown className={`w-3 h-3 text-indigo-400 shrink-0 transition-transform ${orgDropdownOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* Organization Dropdown Menu */}
          {orgDropdownOpen && (
            <div className="absolute right-0 mt-2 w-72 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl p-2 z-50 text-xs">
              <div className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 border-b border-zinc-800/80 mb-1 flex items-center justify-between">
                <span>Tenant Organizations</span>
                <span className="text-zinc-500">{organizationsList.length} total</span>
              </div>

              <div className="max-h-56 overflow-y-auto space-y-1 py-1">
                {organizationsList.map((org) => {
                  const isCurrent = org.id === currentOrg?.id;
                  return (
                    <button
                      key={org.id}
                      type="button"
                      onClick={() => {
                        if (!isCurrent) {
                          handleSwitchOrganization(org.id);
                        }
                        setOrgDropdownOpen(false);
                      }}
                      className={`w-full text-left px-2.5 py-2 rounded-lg flex items-center justify-between transition cursor-pointer ${
                        isCurrent
                          ? 'bg-indigo-600/20 border border-indigo-500/40 text-white font-medium'
                          : 'hover:bg-zinc-800/70 text-zinc-300'
                      }`}
                    >
                      <div className="min-w-0 pr-2">
                        <div className="truncate font-medium">{org.name}</div>
                        <div className="text-[10px] text-zinc-500 flex items-center gap-1.5">
                          <span className="capitalize">{org.role || 'Member'}</span>
                          <span>•</span>
                          <span className="uppercase text-[9px] text-zinc-400">{org.primaryTelephonyProvider || 'plivo'}</span>
                        </div>
                      </div>
                      {isCurrent && <Check className="w-4 h-4 text-indigo-400 shrink-0" />}
                    </button>
                  );
                })}
              </div>

              <div className="pt-2 border-t border-zinc-800/80 mt-1">
                <button
                  type="button"
                  onClick={() => {
                    setOrgDropdownOpen(false);
                    setShowOrgModal(true);
                  }}
                  className="w-full text-left px-2.5 py-2 rounded-lg bg-zinc-800/50 hover:bg-zinc-800 text-indigo-300 hover:text-indigo-200 flex items-center gap-2 transition cursor-pointer font-medium"
                >
                  <Plus className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Create New Organization</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* User Account / Profile */}
        <Link
          href="/console/users"
          className="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-2 sm:px-2.5 py-1.5 rounded-lg border border-zinc-700 flex items-center gap-1.5 transition"
          title="Account / Users"
        >
          <User className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span className="max-w-[70px] sm:max-w-[110px] truncate hidden xs:inline">{currentUser?.name || 'Account'}</span>
        </Link>

        {/* Sign Out Button */}
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
