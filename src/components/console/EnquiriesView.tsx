'use client';

import React, { useMemo, useState } from 'react';
import { BookUser, Edit3, Loader2, Plus, PhoneCall, Search, Trash2, Upload, UserCheck } from 'lucide-react';
import { useConsole } from '@/context/ConsoleContext';
import { EnquiryFormModal } from '@/components/console/EnquiryFormModal';
import { formatTravelMonth } from '@/lib/contact-fields';
import { ENQUIRY_STATUSES, ENQUIRY_STATUS_LABELS, ENQUIRY_TAGS, ENQUIRY_TAG_LABELS, type EnquiryTag } from '@/lib/enquiry-fields';

const control = 'rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-xs text-zinc-200 outline-none focus:border-emerald-500/60 disabled:opacity-50';
const tagStyle: Record<EnquiryTag, string> = {
  hot: 'border-red-500/40 bg-red-500/10 text-red-300',
  warm: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
  cold: 'border-sky-500/40 bg-sky-500/10 text-sky-300',
};

export function getContactSource(item: Record<string, any>): string {
  if (item.source && typeof item.source === 'string' && item.source.trim()) {
    return item.source.trim();
  }
  const tags: string[] = Array.isArray(item.tags) ? item.tags : [];
  const sourceTag = tags.find((t: string) => t.toLowerCase().startsWith('source:'));
  if (sourceTag) {
    const raw = sourceTag.slice(7).trim();
    if (!raw) return 'Direct';
    return raw
      .split(/[_\s-]+/)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }
  return 'Direct';
}

function getSourceBadgeClass(source: string): string {
  const s = source.toLowerCase();
  if (s.includes('google')) return 'border-blue-500/40 bg-blue-500/10 text-blue-300';
  if (s.includes('insta') || s.includes('meta') || s.includes('fb') || s.includes('facebook')) return 'border-pink-500/40 bg-pink-500/10 text-pink-300';
  if (s.includes('web') || s.includes('form') || s.includes('public')) return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300';
  if (s.includes('referral') || s.includes('walk') || s.includes('direct')) return 'border-purple-500/40 bg-purple-500/10 text-purple-300';
  return 'border-zinc-700 bg-zinc-800 text-zinc-300';
}

/**
 * The enquiry workspace. `mine` shows only the enquiries assigned to the signed-in
 * staff member (the "Assigned to me" menu); otherwise every enquiry the user may see.
 */
export function EnquiriesView({ mine = false }: { mine?: boolean }) {
  const {
    contactsList, setContactsList, staffList, currentUser, currentOrg, authFetch,
    setShowBulkContactsModal, setCallDestination, callForwardTo, setCallMode, setShowCallModal,
    handleDeleteContact, deletingContactId,
  } = useConsole();
  const isAdmin = ['owner', 'admin'].includes(currentOrg?.role);
  const canEdit = currentOrg?.role !== 'viewer';

  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Record<string, any> | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('');

  const staff = useMemo(() => staffList.filter(member => member.status === 'active' && member.role !== 'viewer'), [staffList]);
  const staffName = (id?: string | null) => (id ? staffList.find(member => member.id === id)?.name || 'Staff member' : '');

  const availableSources = useMemo(() => {
    const set = new Set<string>();
    contactsList.forEach(item => {
      const src = getContactSource(item);
      if (src) set.add(src);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [contactsList]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return contactsList.filter(item => {
      if (mine && item.assignedToId !== currentUser?.id) return false;
      if (sourceFilter && getContactSource(item).toLowerCase() !== sourceFilter.toLowerCase()) return false;
      if (statusFilter && item.enquiryStatus !== statusFilter) return false;
      if (tagFilter && item.enquiryTag !== tagFilter) return false;
      if (!mine && ownerFilter) {
        if (ownerFilter === 'me' ? item.assignedToId !== currentUser?.id : ownerFilter === 'unassigned' ? !!item.assignedToId : item.assignedToId !== ownerFilter) return false;
      }
      if (!term) return true;
      return [item.name, item.phone, item.email, item.city, item.company, item.tourType, getContactSource(item), ...(item.tags || [])]
        .filter(Boolean).join(' ').toLowerCase().includes(term);
    });
  }, [contactsList, mine, currentUser?.id, sourceFilter, statusFilter, tagFilter, ownerFilter, search]);

  async function quickUpdate(item: Record<string, any>, changes: Record<string, unknown>) {
    setBusyId(item.id); setError('');
    try {
      const res = await authFetch(`/api/v1/enquiries/${item.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(changes) });
      const data = await res.json();
      if (!res.ok || !data.contact) throw new Error(data.error || 'The update was not confirmed');
      setContactsList(previous => previous.map(row => (row.id === item.id ? data.contact : row)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update the enquiry');
    } finally {
      setBusyId(null);
    }
  }

  function callEnquiry(item: Record<string, any>) {
    setCallDestination(item.phone);
    setCallMode(callForwardTo ? 'bridge' : 'browser');
    setShowCallModal(true);
  }

  const emptyText = mine
    ? 'No enquiries are assigned to you yet.'
    : 'No enquiries yet. Click "Add enquiry", import a CSV, or convert a call from the Calls page.';

  return (
    <div className="space-y-5 max-w-7xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            {mine ? <UserCheck className="w-5 h-5 text-emerald-400 shrink-0" /> : <BookUser className="w-5 h-5 text-emerald-400 shrink-0" />}
            {mine ? 'Assigned to me' : 'Enquiries'}
          </h2>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1">
            {mine
              ? 'Enquiries assigned to you. Call customers and update their status from here.'
              : 'Every customer enquiry with its owner, status and tags. Staff can only place calls to saved enquiries.'}
          </p>
        </div>
        {canEdit && (
          <div className="flex items-center gap-2 self-start sm:self-auto">
            {isAdmin && !mine && (
              <button type="button" onClick={() => setShowBulkContactsModal(true)} className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 border border-zinc-700/80 shadow-sm transition">
                <Upload className="w-3.5 h-3.5 text-emerald-400" /> Import CSV
              </button>
            )}
            <button type="button" onClick={() => setShowAdd(true)} className="bg-emerald-600 hover:bg-emerald-500 text-white px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 shadow-md transition">
              <Plus className="w-3.5 h-3.5" /> Add enquiry
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        <div className="relative col-span-2 sm:col-span-3 lg:col-span-1">
          <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input aria-label="Search enquiries" placeholder="Name, phone, email, city, source or tag" value={search} onChange={e => setSearch(e.target.value)} className={`${control} w-full pl-8 py-2`} />
        </div>
        <select aria-label="Filter by source" value={sourceFilter} onChange={e => setSourceFilter(e.target.value)} className={`${control} py-2`}>
          <option value="">All sources</option>
          {availableSources.map(src => <option key={src} value={src}>{src}</option>)}
        </select>
        <select aria-label="Filter by status" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className={`${control} py-2`}>
          <option value="">All statuses</option>
          {ENQUIRY_STATUSES.map(status => <option key={status} value={status}>{ENQUIRY_STATUS_LABELS[status]}</option>)}
        </select>
        <select aria-label="Filter by tag" value={tagFilter} onChange={e => setTagFilter(e.target.value)} className={`${control} py-2`}>
          <option value="">All tags</option>
          {ENQUIRY_TAGS.map(tag => <option key={tag} value={tag}>{ENQUIRY_TAG_LABELS[tag]}</option>)}
        </select>
        {!mine && (
          <select aria-label="Filter by owner" value={ownerFilter} onChange={e => setOwnerFilter(e.target.value)} className={`${control} py-2`}>
            <option value="">All owners</option>
            <option value="me">Assigned to me</option>
            <option value="unassigned">Unassigned</option>
            {staff.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}
          </select>
        )}
      </div>

      {error && <p role="alert" className="rounded-lg bg-red-950/50 p-3 text-sm text-red-300">{error}</p>}
      <p className="text-xs text-zinc-500">{visible.length} {visible.length === 1 ? 'enquiry' : 'enquiries'}</p>

      <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1250px] text-left text-xs">
            <thead className="bg-zinc-900/80 border-b border-zinc-800 text-zinc-400 font-medium">
              <tr>
                <th className="py-3 px-4">Enquiry</th>
                <th className="py-3 px-4">Contact</th>
                <th className="py-3 px-4">Trip details</th>
                <th className="py-3 px-4">Source</th>
                <th className="py-3 px-4">Assigned to</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Tag</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-zinc-500">
                    <BookUser className="w-8 h-8 mx-auto mb-2 text-zinc-600 opacity-50" />
                    {emptyText}
                  </td>
                </tr>
              ) : visible.map(item => {
                const busy = busyId === item.id;
                const ownerName = item.assignedTo?.name || staffName(item.assignedToId);
                const nonSourceTags = (item.tags || []).filter((tag: string) => !tag.toLowerCase().startsWith('source:'));
                const contactSource = getContactSource(item);
                return (
                  <tr key={item.id} className="hover:bg-zinc-800/30 transition align-top">
                    <td className="py-3.5 px-4">
                      <p className="font-semibold text-zinc-100">{item.name}</p>
                      {item.city && <p className="text-[11px] text-zinc-500">{item.city}</p>}
                      {nonSourceTags.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {nonSourceTags.map((tag: string) => <span key={tag} className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-300">{tag}</span>)}
                        </div>
                      )}
                      {(item.company || item.notes) && (
                        <details className="mt-1 text-[11px] font-normal text-zinc-400">
                          <summary className="cursor-pointer">Other details</summary>
                          {item.company && <p>{item.company}</p>}
                          {item.notes && <p className="whitespace-pre-wrap">{item.notes}</p>}
                        </details>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <p className="font-mono text-emerald-400 font-medium">{item.phone || '—'}</p>
                      <p className="text-zinc-400">{item.email || '—'}</p>
                    </td>
                    <td className="py-3.5 px-4 text-zinc-400 max-w-xs">
                      <p>{formatTravelMonth(item.preferredTravelMonth)}{item.tourType ? ` · ${item.tourType}` : ''}{item.numberOfChildren != null ? ` · ${item.numberOfChildren} children` : ''}</p>
                      {item.specialRequirements && (
                        <details>
                          <summary className="cursor-pointer">{item.specialRequirements.length > 45 ? `${item.specialRequirements.slice(0, 45)}…` : item.specialRequirements}</summary>
                          <p className="whitespace-pre-wrap mt-1">{item.specialRequirements}</p>
                        </details>
                      )}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <span className={`inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium border ${getSourceBadgeClass(contactSource)}`}>
                        {contactSource}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      {isAdmin ? (
                        <select aria-label={`Assign ${item.name}`} disabled={busy} value={item.assignedToId || ''} onChange={e => quickUpdate(item, { assignedToId: e.target.value || null })} className={control}>
                          <option value="">Unassigned</option>
                          {staff.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}
                          {item.assignedToId && !staff.some(member => member.id === item.assignedToId) && <option value={item.assignedToId}>{ownerName || 'Former staff member'}</option>}
                        </select>
                      ) : item.assignedToId ? (
                        <span className="text-zinc-200">{item.assignedToId === currentUser?.id ? 'Me' : ownerName}</span>
                      ) : canEdit ? (
                        <button type="button" disabled={busy} onClick={() => quickUpdate(item, { assignedToId: currentUser?.id })} className="rounded border border-emerald-500/30 bg-emerald-600/20 px-2 py-1 text-emerald-300 disabled:opacity-50">Assign to me</button>
                      ) : '—'}
                    </td>
                    <td className="py-3.5 px-4">
                      <select aria-label={`Status of ${item.name}`} disabled={busy || !canEdit} value={item.enquiryStatus} onChange={e => quickUpdate(item, { enquiryStatus: e.target.value })} className={control}>
                        {ENQUIRY_STATUSES.map(status => <option key={status} value={status}>{ENQUIRY_STATUS_LABELS[status]}</option>)}
                      </select>
                    </td>
                    <td className="py-3.5 px-4">
                      <select aria-label={`Tag of ${item.name}`} disabled={busy || !canEdit} value={item.enquiryTag} onChange={e => quickUpdate(item, { enquiryTag: e.target.value })} className={`${control} border ${tagStyle[item.enquiryTag as EnquiryTag] || ''}`}>
                        {ENQUIRY_TAGS.map(tag => <option key={tag} value={tag}>{ENQUIRY_TAG_LABELS[tag]}</option>)}
                      </select>
                    </td>
                    <td className="py-3.5 px-4 text-right space-x-2 whitespace-nowrap">
                      {busy && <Loader2 className="inline w-3.5 h-3.5 animate-spin text-zinc-400" />}
                      {canEdit && (
                        <button type="button" onClick={() => setEditing(item)} className="inline-flex items-center gap-1 rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-indigo-300">
                          <Edit3 className="w-3 h-3" /> Edit
                        </button>
                      )}
                      <button type="button" disabled={!item.phone} title={item.phone ? 'Call enquiry' : 'No phone number supplied'} onClick={() => callEnquiry(item)} className="text-xs bg-emerald-600/20 hover:bg-emerald-600/30 disabled:opacity-50 text-emerald-300 px-2.5 py-1 rounded border border-emerald-500/30 inline-flex items-center gap-1.5 transition">
                        <PhoneCall className="w-3 h-3 text-emerald-400" /> <span>Call</span>
                      </button>
                      {isAdmin && !mine && (
                        <button type="button" disabled={deletingContactId === item.id} onClick={() => handleDeleteContact(item.id)} title="Delete enquiry" className="text-xs bg-zinc-800 hover:bg-rose-950 disabled:opacity-50 text-zinc-400 hover:text-rose-400 px-2 py-1 rounded border border-zinc-700 transition inline-flex items-center gap-1">
                          {deletingContactId === item.id ? <Loader2 className="w-3 h-3 animate-spin text-rose-400" /> : <Trash2 className="w-3 h-3" />}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showAdd && <EnquiryFormModal onClose={() => setShowAdd(false)} />}
      {editing && <EnquiryFormModal key={editing.id} contact={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
