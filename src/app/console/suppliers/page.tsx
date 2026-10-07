'use client';

import React from 'react';
import { Building2, Plus, Trash2 } from 'lucide-react';
import { useConsole } from '@/context/ConsoleContext';

export default function SuppliersPage() {
  const {
    suppliersList,
    setShowSupplierModal,
    handleDeleteSupplier,
  } = useConsole();

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <Building2 className="w-5 h-5 text-indigo-400 shrink-0" />
            Supplier Management
          </h2>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1">
            Manage hotels, air charters, ground transport, and tour suppliers for automated itinerary quotation requests (RFQs).
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowSupplierModal(true)}
          className="bg-indigo-600 hover:bg-indigo-500 text-white px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 shadow-md transition self-start sm:self-auto"
        >
          <Plus className="w-3.5 h-3.5" /> Add Supplier
        </button>
      </div>

      {/* Suppliers Table with horizontal scroll */}
      <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-xs">
            <thead className="bg-zinc-900/80 border-b border-zinc-800 text-zinc-400 font-medium">
              <tr>
                <th className="py-3 px-4">Supplier Name</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4">Contact Person</th>
                <th className="py-3 px-4">Email</th>
                <th className="py-3 px-4">Phone</th>
                <th className="py-3 px-4">Notes</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
              {suppliersList.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-zinc-500">
                    No suppliers registered. Click &quot;Add Supplier&quot; to register hotel or transport partners.
                  </td>
                </tr>
              ) : (
                suppliersList.map((supp) => (
                  <tr key={supp.id} className="hover:bg-zinc-800/30 transition">
                    <td className="py-3.5 px-4 font-semibold text-zinc-100">{supp.name}</td>
                    <td className="py-3.5 px-4">
                      <span className="capitalize px-2 py-0.5 rounded text-[10px] bg-indigo-950 text-indigo-300 border border-indigo-800/60 font-medium">
                        {supp.category}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-zinc-300">{supp.contactPerson || '—'}</td>
                    <td className="py-3.5 px-4 font-mono text-zinc-300">{supp.email}</td>
                    <td className="py-3.5 px-4 font-mono text-zinc-400">{supp.phone || '—'}</td>
                    <td className="py-3.5 px-4 text-zinc-500 max-w-xs truncate">{supp.notes || '—'}</td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => handleDeleteSupplier(supp.id)}
                        className="text-xs bg-zinc-800 hover:bg-rose-950 text-zinc-400 hover:text-rose-400 px-2 py-1 rounded border border-zinc-700 transition"
                        title="Delete Supplier"
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
