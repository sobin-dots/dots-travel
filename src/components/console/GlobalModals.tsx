'use client';

import React from 'react';
import {
  UserPlus,
  BookUser,
  Building2,
} from 'lucide-react';
import { useConsole } from '@/context/ConsoleContext';

export function GlobalModals() {
  const {
    // Buy Number
    showBuyModal,
    setShowBuyModal,
    searchIso,
    setSearchIso,
    availableNumbers,
    searchingNumbers,
    handleSearchNumbers,
    handleBuyNumber,

    // Staff
    showStaffModal,
    setShowStaffModal,
    staffName,
    setStaffName,
    staffEmail,
    setStaffEmail,
    staffPassword,
    setStaffPassword,
    staffRole,
    setStaffRole,
    staffLoading,
    handleCreateStaff,

    // Contact
    showContactModal,
    setShowContactModal,
    contactName,
    setContactName,
    contactPhone,
    setContactPhone,
    contactEmail,
    setContactEmail,
    contactCompany,
    setContactCompany,
    contactNotes,
    setContactNotes,
    contactLoading,
    handleCreateContact,

    // Supplier
    showSupplierModal,
    setShowSupplierModal,
    supplierName,
    setSupplierName,
    supplierCategory,
    setSupplierCategory,
    supplierEmail,
    setSupplierEmail,
    supplierPhone,
    setSupplierPhone,
    supplierContactPerson,
    setSupplierContactPerson,
    supplierNotes,
    setSupplierNotes,
    supplierLoading,
    handleCreateSupplier,
  } = useConsole();

  return (
    <>
      {/* MODAL: BUY NUMBER */}
      {showBuyModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-lg w-full max-h-[92vh] overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-5">
            <h3 className="text-sm font-bold text-white">Search & Buy Phone Number</h3>

            <div className="flex gap-2">
              <select
                value={searchIso}
                onChange={(e) => setSearchIso(e.target.value)}
                className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200"
              >
                <option value="US">United States (US)</option>
                <option value="GB">United Kingdom (GB)</option>
                <option value="IN">India (IN)</option>
              </select>
              <button
                type="button"
                onClick={handleSearchNumbers}
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-xs font-medium"
              >
                Search Inventory
              </button>
            </div>

            <div className="max-h-60 overflow-y-auto divide-y divide-zinc-800 text-xs">
              {searchingNumbers ? (
                <div className="py-6 text-center text-zinc-500">Querying inventory...</div>
              ) : (
                availableNumbers.map((num) => (
                  <div key={num.number} className="py-3 flex items-center justify-between">
                    <div>
                      <div className="font-mono font-bold text-zinc-200">{num.number}</div>
                      <div className="text-[11px] text-zinc-500">Rental: ${num.monthlyRental}/mo</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleBuyNumber(num.number)}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded text-xs font-medium"
                    >
                      Buy Now
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-end pt-3 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setShowBuyModal(false)}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADD STAFF MEMBER */}
      {showStaffModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-md w-full max-h-[92vh] overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-5">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-indigo-400" />
              Add New Staff Member
            </h3>
            <p className="text-xs text-zinc-400">
              Provision a staff account for this organization. Staff members can sign in, dial calls, and manage communication threads.
            </p>

            <form onSubmit={handleCreateStaff} className="space-y-4 text-xs">
              <div>
                <label className="text-zinc-400 block mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Rachel Adams"
                  value={staffName}
                  onChange={(e) => setStaffName(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-200 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">Work Email</label>
                <input
                  type="email"
                  required
                  placeholder="rachel@company.com"
                  value={staffEmail}
                  onChange={(e) => setStaffEmail(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-200 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">Password (min. 8 characters)</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  placeholder="••••••••••••"
                  value={staffPassword}
                  onChange={(e) => setStaffPassword(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-200 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">Staff Role</label>
                <select
                  value={staffRole}
                  onChange={(e) => setStaffRole(e.target.value as any)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-200"
                >
                  <option value="operator">Operator (Can make calls & send SMS)</option>
                  <option value="admin">Admin (Full administrative controls)</option>
                  <option value="viewer">Viewer (Read-only observation)</option>
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowStaffModal(false)}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={staffLoading}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold disabled:opacity-50"
                >
                  {staffLoading ? 'Creating...' : 'Create Staff Member'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD CONTACT */}
      {showContactModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-md w-full max-h-[92vh] overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-5">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <BookUser className="w-4 h-4 text-emerald-400" />
              Add Verified Contact
            </h3>
            <p className="text-xs text-zinc-400">
              Register a contact recipient. Staff can only initiate outbound calls to contacts stored in this directory.
            </p>

            <form onSubmit={handleCreateContact} className="space-y-4 text-xs">
              <div>
                <label className="text-zinc-400 block mb-1">Contact Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Marcus Vance"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-200 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">Phone Number (E.164) *</label>
                <input
                  type="text"
                  required
                  placeholder="+14155550199"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-200 font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-zinc-400 block mb-1">Company</label>
                  <input
                    type="text"
                    placeholder="Acme Corp"
                    value={contactCompany}
                    onChange={(e) => setContactCompany(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-200"
                  />
                </div>
                <div>
                  <label className="text-zinc-400 block mb-1">Email</label>
                  <input
                    type="email"
                    placeholder="marcus@acme.com"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-200"
                  />
                </div>
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">Notes / Relationship</label>
                <textarea
                  rows={2}
                  placeholder="Key account executive"
                  value={contactNotes}
                  onChange={(e) => setContactNotes(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-200"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowContactModal(false)}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={contactLoading}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold disabled:opacity-50"
                >
                  {contactLoading ? 'Saving...' : 'Save Contact'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD SUPPLIER */}
      {showSupplierModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-md w-full max-h-[92vh] overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-5">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Building2 className="w-4 h-4 text-indigo-400" />
              Add Travel Supplier / Partner
            </h3>
            <p className="text-xs text-zinc-400">
              Register a hotel, airline charter, ground transport, or tour provider for automated quotation requests (RFQs).
            </p>

            <form onSubmit={handleCreateSupplier} className="space-y-4 text-xs">
              <div>
                <label className="text-zinc-400 block mb-1">Supplier Business Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Grand Horizon Luxury Resorts"
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-200 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">Category *</label>
                <select
                  value={supplierCategory}
                  onChange={(e) => setSupplierCategory(e.target.value as any)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-200"
                >
                  <option value="hotels">Hotels & Resorts</option>
                  <option value="flights">Aviation / Air Charters</option>
                  <option value="transport">Ground Transport & Transfers</option>
                  <option value="activities">Tours & Activities</option>
                  <option value="packages">Complete Travel Packages</option>
                </select>
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">Quotation Email *</label>
                <input
                  type="email"
                  required
                  placeholder="rfq@resort-partner.com"
                  value={supplierEmail}
                  onChange={(e) => setSupplierEmail(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-200 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-zinc-400 block mb-1">Phone Number</label>
                  <input
                    type="text"
                    placeholder="+18005550199"
                    value={supplierPhone}
                    onChange={(e) => setSupplierPhone(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-200"
                  />
                </div>
                <div>
                  <label className="text-zinc-400 block mb-1">Contact Person</label>
                  <input
                    type="text"
                    placeholder="Jessica Vance"
                    value={supplierContactPerson}
                    onChange={(e) => setSupplierContactPerson(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-200"
                  />
                </div>
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">Notes / Partnership Terms</label>
                <textarea
                  rows={2}
                  placeholder="Special B2B trade discount 15%, 24-hour turnaround on quotation requests."
                  value={supplierNotes}
                  onChange={(e) => setSupplierNotes(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-200"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowSupplierModal(false)}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={supplierLoading}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold disabled:opacity-50"
                >
                  {supplierLoading ? 'Saving...' : 'Save Supplier'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
