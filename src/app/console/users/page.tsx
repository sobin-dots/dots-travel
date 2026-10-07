'use client';

import React from 'react';
import { Users, UserPlus } from 'lucide-react';
import { useConsole } from '@/context/ConsoleContext';

export default function UsersPage() {
  const {
    staffList,
    currentUser,
    setShowStaffModal,
  } = useConsole();

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-400 shrink-0" />
            Staff Team Management
          </h2>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1">
            Admins can provision staff members who can log in with their own accounts to make calls and handle operations.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowStaffModal(true)}
          className="bg-indigo-600 hover:bg-indigo-500 text-white px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 shadow-md transition self-start sm:self-auto"
        >
          <UserPlus className="w-3.5 h-3.5" /> Add Staff Member
        </button>
      </div>

      <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[650px] text-left text-xs">
            <thead className="bg-zinc-900/80 border-b border-zinc-800 text-zinc-400 font-medium">
              <tr>
                <th className="py-3 px-4">Staff Member</th>
                <th className="py-3 px-4">Role</th>
                <th className="py-3 px-4">Account Status</th>
                <th className="py-3 px-4">Joined Date</th>
                <th className="py-3 px-4">Last Login</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
              {staffList.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-zinc-500">
                    No staff members registered.
                  </td>
                </tr>
              ) : (
                staffList.map((member) => (
                  <tr key={member.id} className="hover:bg-zinc-800/30 transition">
                    <td className="py-3.5 px-4">
                      <div className="font-medium text-zinc-100 flex items-center gap-2">
                        <span>{member.name}</span>
                        {currentUser?.email === member.email && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-950 text-indigo-400 border border-indigo-800/60 font-mono">
                            You
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-zinc-400 font-mono mt-0.5">{member.email}</div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${
                          member.role === 'owner' || member.role === 'admin'
                            ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                            : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        }`}
                      >
                        {member.role}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="px-2 py-0.5 rounded text-[10px] bg-zinc-800 text-zinc-300 font-medium capitalize">
                        {member.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-zinc-400">
                      {new Date(member.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-3.5 px-4 text-zinc-500">
                      {member.lastLoginAt ? new Date(member.lastLoginAt).toLocaleString() : 'Never logged in'}
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
