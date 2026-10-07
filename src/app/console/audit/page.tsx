'use client';

import React from 'react';
import { useConsole } from '@/context/ConsoleContext';

export default function AuditPage() {
  const { auditLogs } = useConsole();

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white">Immutable Audit Log</h2>
        <p className="text-xs sm:text-sm text-zinc-400 mt-1">
          Cryptographically trackable record of privileged telephony events, purchases, and security logins.
        </p>
      </div>

      <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[650px] text-left text-xs">
            <thead className="bg-zinc-900/80 border-b border-zinc-800 text-zinc-400">
              <tr>
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">Action</th>
                <th className="py-3 px-4">Target</th>
                <th className="py-3 px-4">Actor</th>
                <th className="py-3 px-4 text-right">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
              {auditLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-zinc-500">
                    No audit logs recorded yet.
                  </td>
                </tr>
              ) : (
                auditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-zinc-800/30">
                    <td className="py-3 px-4 font-mono text-zinc-400">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className="py-3 px-4 font-semibold text-indigo-400">{log.action}</td>
                    <td className="py-3 px-4 text-zinc-400">{log.targetType || 'System'}</td>
                    <td className="py-3 px-4">{log.actor?.email || 'admin@example.com'}</td>
                    <td className="py-3 px-4 text-right">
                      <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400 font-bold uppercase">
                        {log.result}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
