'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { useConsole } from '@/context/ConsoleContext';
import { contactValuesFromForm } from '@/lib/contact-fields';
import { ENQUIRY_STATUSES, ENQUIRY_STATUS_LABELS, ENQUIRY_TAGS, ENQUIRY_TAG_LABELS, STANDARD_LEAD_SOURCES, parseTagInput } from '@/lib/enquiry-fields';
import { ContactDetailsFields } from './ContactDetailsFields';

interface Props {
  /** Convert this call into an enquiry. The form is prefilled from the call. */
  callId?: string;
  /** Edit an existing enquiry. */
  contact?: Record<string, any>;
  onClose: () => void;
  onSaved?: (contact: Record<string, any>) => void;
}

const field = 'w-full rounded-lg border border-zinc-700 bg-zinc-950 p-2.5 text-sm text-zinc-100 focus:border-emerald-500 focus:outline-none disabled:opacity-60';

export function EnquiryFormModal({ callId, contact, onClose, onSaved }: Props) {
  const { authFetch, staffList, currentUser, currentOrg, setContactsList, fetchData } = useConsole();
  const isAdmin = ['owner', 'admin'].includes(currentOrg?.role);
  const mode: 'convert' | 'edit' | 'add' = callId ? 'convert' : contact ? 'edit' : 'add';

  const [loading, setLoading] = useState(!!callId);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [defaults, setDefaults] = useState<Record<string, any>>(contact || {});
  const [existing, setExisting] = useState<Record<string, any> | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [assignedToId, setAssignedToId] = useState<string>(contact?.assignedToId || (mode === 'add' && !isAdmin ? currentUser?.id || '' : ''));
  const inFlight = useRef(false);

  const staff = useMemo(() => staffList.filter(member => member.status === 'active' && member.role !== 'viewer'), [staffList]);

  useEffect(() => {
    if (!callId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await authFetch(`/api/v1/calls/${callId}/enquiry`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not load this call');
        if (cancelled) return;
        setDefaults(data.defaults || {});
        setExisting(data.contact || null);
        setBlocked(!!data.contactBlocked);
        setAssignedToId(data.defaults?.assignedToId || (isAdmin ? '' : currentUser?.id || ''));
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Could not load this call');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // Load once for this call; authFetch changes identity on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callId]);

  const currentItem = existing || defaults;
  const initialSource = useMemo(() => {
    if (currentItem.source && typeof currentItem.source === 'string') return currentItem.source;
    const sourceTag = (currentItem.tags || []).find((t: string) => t.toLowerCase().startsWith('source:'));
    if (sourceTag) {
      const raw = sourceTag.slice(7).trim();
      return raw.split(/[_\s-]+/).map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    }
    return '';
  }, [currentItem]);

  const sourceOptions = useMemo(() => {
    const defaults = Array.from(STANDARD_LEAD_SOURCES);
    if (initialSource && !defaults.some(d => d.toLowerCase() === initialSource.toLowerCase())) {
      return [...defaults, initialSource, 'Other'];
    }
    return [...defaults, 'Other'];
  }, [initialSource]);

  const [selectedSource, setSelectedSource] = useState(initialSource || 'Direct');
  const [customSource, setCustomSource] = useState(
    initialSource && !STANDARD_LEAD_SOURCES.some(s => s.toLowerCase() === initialSource.toLowerCase())
      ? initialSource
      : ''
  );

  useEffect(() => {
    if (initialSource) {
      const match = STANDARD_LEAD_SOURCES.find(
        s => s.toLowerCase() === initialSource.toLowerCase()
      );
      if (match) {
        setSelectedSource(match);
        setCustomSource('');
      } else {
        setSelectedSource(initialSource);
        setCustomSource(initialSource);
      }
    }
  }, [initialSource]);

  const initialOtherTags = useMemo(() => {
    const rawTags = (currentItem.tags || []).filter((t: string) => !t.toLowerCase().startsWith('source:'));
    return rawTags.join(', ');
  }, [currentItem]);

  // Staff may only claim an unowned enquiry. Admins can always reassign.
  const ownerLocked = mode === 'edit' && !isAdmin && !!contact?.assignedToId;
  const ownerOptions = mode === 'edit' && !isAdmin ? staff.filter(member => member.id === currentUser?.id) : staff;
  const readOnly = !!existing;

  const title = mode === 'convert' ? 'Convert call to enquiry' : mode === 'edit' ? 'Edit enquiry' : 'Add enquiry';
  const submitLabel = existing ? 'Link call to this enquiry' : mode === 'edit' ? 'Save changes' : mode === 'convert' ? 'Create enquiry' : 'Add enquiry';

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    const form = new FormData(event.currentTarget);
    const sourceVal = String(form.get('source') || '').trim();
    const rawTags = parseTagInput(String(form.get('tags') || ''));
    const finalTags = rawTags.filter(t => !t.toLowerCase().startsWith('source:'));
    if (sourceVal && sourceVal.toLowerCase() !== 'direct') {
      finalTags.push(`source:${sourceVal.toLowerCase()}`);
    }

    const body: Record<string, unknown> = {
      ...contactValuesFromForm(form),
      enquiryStatus: String(form.get('enquiryStatus') || 'warm'),
      enquiryTag: 'warm',
      tags: finalTags,
    };
    if (mode === 'edit') {
      body.expectedUpdatedAt = contact?.updatedAt;
      if (!ownerLocked && (assignedToId || null) !== (contact?.assignedToId || null)) body.assignedToId = assignedToId || null;
    } else if (assignedToId) {
      body.assignedToId = assignedToId;
    }

    inFlight.current = true; setSaving(true); setError('');
    try {
      const url = mode === 'convert' ? `/api/v1/calls/${callId}/enquiry` : mode === 'edit' ? `/api/v1/enquiries/${contact!.id}` : '/api/v1/enquiries';
      const res = await authFetch(url, { method: mode === 'edit' ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok || !data.contact) throw new Error(data.error || 'The enquiry save was not confirmed');
      const saved = data.contact;
      setContactsList(previous => [saved, ...previous.filter(item => item.id !== saved.id)].sort((a, b) => (a.name || '').localeCompare(b.name || '')));
      void fetchData();
      onSaved?.(saved);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the enquiry');
    } finally {
      inFlight.current = false; setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-3">
      <section role="dialog" aria-modal="true" aria-labelledby="enquiry-form-title" className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="enquiry-form-title" className="font-semibold text-white">{title}</h2>
            {mode === 'convert' && <p className="text-xs text-zinc-400 mt-1">Details are prefilled from the call. Review them before saving.</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800"><X className="w-4 h-4" /></button>
        </div>

        {loading && <p className="flex items-center gap-2 text-sm text-zinc-400"><Loader2 className="w-4 h-4 animate-spin" /> Loading call details…</p>}
        {loadError && <p role="alert" className="text-sm text-red-300">{loadError}</p>}
        {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
        {existing && <p role="status" className="rounded-lg border border-amber-700/50 bg-amber-950/30 p-3 text-xs text-amber-200">This customer is already an enquiry ({existing.name}). Saving links this call to it without changing its details.</p>}
        {blocked && <p role="alert" className="rounded-lg border border-red-800/60 bg-red-950/30 p-3 text-xs text-red-200">This customer is already an enquiry assigned to another team member, so this call cannot be converted from your account.</p>}

        {!loading && !loadError && (
          <form className="space-y-4" onSubmit={submit}>
            <ContactDetailsFields contact={existing || defaults} disabled={saving || readOnly || blocked} />
            <fieldset disabled={saving || readOnly || blocked} className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-zinc-400 disabled:opacity-60">
              <label>Assigned to
                <select value={assignedToId} onChange={e => setAssignedToId(e.target.value)} disabled={ownerLocked} className={field}>
                  {mode === 'add' || mode === 'convert'
                    ? (isAdmin ? <option value="">Auto-assign to next available salesperson</option> : null)
                    : <option value="">Unassigned</option>}
                  {ownerOptions.map(member => <option key={member.id} value={member.id}>{member.name}{member.id === currentUser?.id ? ' (me)' : ''}</option>)}
                  {assignedToId && !ownerOptions.some(member => member.id === assignedToId) && <option value={assignedToId}>{contact?.assignedTo?.name || staffList.find(member => member.id === assignedToId)?.name || 'Current owner'}</option>}
                </select>
                {ownerLocked && <span className="text-[11px] text-zinc-500">Only an admin can change the owner of an assigned enquiry.</span>}
              </label>
              <label>Status
                <select name="enquiryStatus" defaultValue={(existing || defaults).enquiryStatus || 'warm'} className={field}>
                  {ENQUIRY_STATUSES.map(status => <option key={status} value={status}>{ENQUIRY_STATUS_LABELS[status]}</option>)}
                </select>
              </label>
              <label>Source
                <input
                  type="hidden"
                  name="source"
                  value={selectedSource === 'Other' ? (customSource.trim() || 'Other') : selectedSource}
                />
                <select
                  value={selectedSource}
                  onChange={e => setSelectedSource(e.target.value)}
                  className={field}
                >
                  {sourceOptions.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
                {selectedSource === 'Other' && (
                  <input
                    type="text"
                    value={customSource}
                    onChange={e => setCustomSource(e.target.value)}
                    placeholder="Enter custom source name"
                    className={`${field} mt-2`}
                  />
                )}
              </label>
              <label className="sm:col-span-2">Other tags, separated by commas
                <input name="tags" maxLength={500} defaultValue={initialOtherTags} placeholder="VIP, Family" className={field} />
              </label>
            </fieldset>
            <div className="flex justify-end gap-3 border-t border-zinc-800 pt-4">
              <button type="button" disabled={saving} onClick={onClose} className="rounded-lg bg-zinc-800 px-4 py-2 text-sm">Cancel</button>
              <button disabled={saving || blocked} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm disabled:opacity-50">{saving ? 'Saving…' : submitLabel}</button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
