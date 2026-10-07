'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  Phone,
  Compass,
  Building2,
  BookUser,
  Users,
  MessageSquare,
  Mic,
  FileText,
  Hash,
  Settings,
  Shield,
  X,
} from 'lucide-react';
import { useConsole } from '@/context/ConsoleContext';

export function ConsoleSidebar() {
  const pathname = usePathname();
  const {
    calls,
    leadsList,
    suppliersList,
    contactsList,
    staffList,
    recordings,
    transcripts,
    numbers,
    isMobileMenuOpen,
    setIsMobileMenuOpen,
    incomingCall,
    webPhoneStatus,
  } = useConsole();

  const navItems = [
    { href: '/console', label: 'Overview', icon: Activity, exact: true },
    {
      href: '/console/calls',
      label: 'Calls',
      icon: Phone,
      badge: calls.filter((c) => c.status === 'in-progress').length || undefined,
    },
    { href: '/console/leads', label: 'Leads & Itineraries', icon: Compass, count: leadsList.length },
    { href: '/console/suppliers', label: 'Suppliers', icon: Building2, count: suppliersList.length },
    { href: '/console/contacts', label: 'Contacts', icon: BookUser, count: contactsList.length },
    { href: '/console/users', label: 'Staff Team', icon: Users, count: staffList.length },
    { href: '/console/messages', label: 'Messages', icon: MessageSquare },
    { href: '/console/recordings', label: 'Recordings', icon: Mic, count: recordings.length },
    { href: '/console/transcripts', label: 'Transcripts', icon: FileText, count: transcripts.length },
    { href: '/console/numbers', label: 'Numbers', icon: Hash, count: numbers.length },
    { href: '/console/settings', label: 'Settings', icon: Settings },
    { href: '/console/audit', label: 'Audit Log', icon: Shield },
  ];

  const renderNavList = (isMobile = false) => (
    <nav className="space-y-1">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = item.exact
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(item.href + '/');

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => {
              if (isMobile) setIsMobileMenuOpen(false);
            }}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition ${isActive
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200'
              }`}
          >
            <div className="flex items-center gap-2.5">
              <Icon className="w-4 h-4 shrink-0" />
              <span>{item.label}</span>
            </div>
            {item.badge && (
              <span className="bg-emerald-500 text-white text-[10px] px-1.5 py-0.2 rounded-full font-bold animate-pulse">
                {item.badge}
              </span>
            )}
            {item.count !== undefined && !item.badge && (
              <span className="text-[10px] text-zinc-500">{item.count}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <>
      {/* Desktop Persistent Sidebar */}
      <aside className="hidden md:flex w-60 border-r border-zinc-800/80 bg-zinc-900/30 p-4 space-y-1 shrink-0 flex-col justify-between">
        {renderNavList(false)}

        <div className="space-y-2">
          <div className="p-2.5 bg-emerald-950/40 border border-emerald-500/30 rounded-lg text-[11px] flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${incomingCall
                  ? 'bg-emerald-400 animate-ping'
                  : webPhoneStatus === 'connected'
                    ? 'bg-emerald-400 animate-pulse'
                    : 'bg-emerald-400'
                  }`}
              />
              <div className="min-w-0">
                <span className="font-semibold text-white block truncate">
                  {incomingCall ? 'Incoming Call...' : webPhoneStatus === 'connected' ? 'Call in Progress' : 'Inbound Ready'}
                </span>
                <span className="text-[10px] text-zinc-400 font-mono truncate block">+918065531234</span>
              </div>
            </div>
            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-mono font-bold shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              LIVE
            </div>
          </div>

          <div className="p-3 bg-zinc-950/60 border border-zinc-800/80 rounded-lg text-[11px] text-zinc-400 space-y-1">
            <div className="font-semibold text-zinc-300">Carrier Security</div>
            <div>HMAC-SHA256 V3: Active</div>
            <div>AES-256-GCM Vault: Locked</div>
          </div>
        </div>
      </aside>

      {/* Mobile Drawer & Backdrop */}
      {isMobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            onClick={() => setIsMobileMenuOpen(false)}
            className="fixed inset-0 bg-black/75 backdrop-blur-sm transition-opacity"
          />

          {/* Drawer */}
          <aside className="relative w-72 max-w-[85vw] bg-zinc-900 border-r border-zinc-800 p-4 space-y-4 flex flex-col justify-between shadow-2xl z-10 overflow-y-auto">
            <div>
              <div className="flex items-center justify-between pb-3 mb-2 border-b border-zinc-800">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-indigo-600 flex items-center justify-center font-bold text-xs text-white">
                    P
                  </div>
                  <span className="font-bold text-xs text-white">Plivo Console</span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="p-1 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {renderNavList(true)}
            </div>

            <div className="space-y-2">
              <div className="p-2.5 bg-emerald-950/40 border border-emerald-500/30 rounded-lg text-[11px] flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${incomingCall
                      ? 'bg-emerald-400 animate-ping'
                      : webPhoneStatus === 'connected'
                        ? 'bg-emerald-400 animate-pulse'
                        : 'bg-emerald-400'
                      }`}
                  />
                  <div className="min-w-0">
                    <span className="font-semibold text-white block truncate">
                      {incomingCall ? 'Incoming Call...' : webPhoneStatus === 'connected' ? 'Call in Progress' : 'Inbound Ready'}
                    </span>
                    <span className="text-[10px] text-zinc-400 font-mono truncate block">+918065531234</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-mono font-bold shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  LIVE
                </div>
              </div>


            </div>
          </aside>
        </div>
      )}
    </>
  );
}
