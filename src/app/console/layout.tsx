'use client';

import React from 'react';
import Script from 'next/script';
import { ConsoleProvider, useConsole } from '@/context/ConsoleContext';
import { ConsoleHeader } from '@/components/console/ConsoleHeader';
import { ConsoleSidebar } from '@/components/console/ConsoleSidebar';
import { IncomingCallModal } from '@/components/console/IncomingCallModal';
import { CallModal } from '@/components/console/CallModal';
import { CallDetailDrawer } from '@/components/console/CallDetailDrawer';
import { LeadDetailDrawer } from '@/components/console/LeadDetailDrawer';
import { GlobalModals } from '@/components/console/GlobalModals';

function ConsoleLayoutContent({ children }: { children: React.ReactNode }) {
  const { initWebPhone } = useConsole();

  return (
    <div className="min-h-screen bg-black text-zinc-100 flex flex-col font-sans">
      <ConsoleHeader />
      <div className="flex-1 flex overflow-hidden">
        <ConsoleSidebar />
        <main className="flex-1 overflow-y-auto p-3.5 sm:p-6 lg:p-8 bg-zinc-950/50 min-w-0">
          {children}
        </main>
      </div>

      <IncomingCallModal />
      <CallModal />
      <CallDetailDrawer />
      <LeadDetailDrawer />
      <GlobalModals />

      {/* Plivo WebRTC Browser Calling SDK */}
      <Script
        src="https://cdn.plivo.com/sdk/browser/v2/plivo.min.js"
        strategy="afterInteractive"
        onLoad={() => {
          initWebPhone();
        }}
      />
    </div>
  );
}

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return (
    <ConsoleProvider>
      <ConsoleLayoutContent>{children}</ConsoleLayoutContent>
    </ConsoleProvider>
  );
}
