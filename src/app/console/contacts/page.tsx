'use client';

import React from 'react';
import { BookUser, Plus, PhoneCall, Trash2 } from 'lucide-react';
import { useConsole } from '@/context/ConsoleContext';

export default function ContactsPage() {
  const {
    contactsList,
    setShowContactModal,
    setCallDestination,
    setCallMode,
    setShowCallModal,
    handleDeleteContact,
  } = useConsole();

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <BookUser className="w-5 h-5 text-emerald-400 shrink-0" />
            Verified Contact Directory
          </h2>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1">
            Manage recipient contacts. Staff can only place calls to saved contacts in this directory.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowContactModal(true)}
          className="bg-emerald-600 hover:bg-emerald-500 text-white px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 shadow-md transition self-start sm:self-auto"
        >
          <Plus className="w-3.5 h-3.5" /> Add Contact
        </button>
      </div>

      <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-xs">
            <thead className="bg-zinc-900/80 border-b border-zinc-800 text-zinc-400 font-medium">
              <tr>
                <th className="py-3 px-4">Contact Name</th>
                <th className="py-3 px-4">Phone Number</th>
                <th className="py-3 px-4">Company</th>
                <th className="py-3 px-4">Email</th>
                <th className="py-3 px-4">Notes</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
              {contactsList.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-zinc-500">
                    <BookUser className="w-8 h-8 mx-auto mb-2 text-zinc-600 opacity-50" />
                    No contacts registered yet. Click &quot;Add Contact&quot; to allow staff to place calls.
                  </td>
                </tr>
              ) : (
                contactsList.map((contact) => (
                  <tr key={contact.id} className="hover:bg-zinc-800/30 transition">
                    <td className="py-3.5 px-4 font-semibold text-zinc-100">{contact.name}</td>
                    <td className="py-3.5 px-4 font-mono text-emerald-400 font-medium">{contact.phone}</td>
                    <td className="py-3.5 px-4 text-zinc-400">{contact.company || '—'}</td>
                    <td className="py-3.5 px-4 text-zinc-400">{contact.email || '—'}</td>
                    <td className="py-3.5 px-4 text-zinc-500 max-w-xs truncate">{contact.notes || '—'}</td>
                    <td className="py-3.5 px-4 text-right space-x-2 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => {
                          setCallDestination(contact.phone);
                          setCallMode('bridge');
                          setShowCallModal(true);
                        }}
                        className="text-xs bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 px-2.5 py-1 rounded border border-emerald-500/30 inline-flex items-center gap-1.5 transition"
                      >
                        <PhoneCall className="w-3 h-3 text-emerald-400" />
                        <span>Talk</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteContact(contact.id)}
                        className="text-xs bg-zinc-800 hover:bg-rose-950 text-zinc-400 hover:text-rose-400 px-2 py-1 rounded border border-zinc-700 transition"
                        title="Delete Contact"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
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
