'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Edit3, RefreshCw } from 'lucide-react';
import { VisualItinerary } from '@/components/VisualItinerary';
import { validateItinerary } from '@/lib/itinerary-content';
import { readItineraryResponse } from '@/lib/itinerary-response';
import { useConsole } from '@/context/ConsoleContext';

export interface ItineraryEditorState {
  dirty: boolean;
  saving: boolean;
}

interface Props {
  lead: {
    id: string;
    itinerary: string | null;
    durationDays?: number | null;
    destination: string;
    title: string;
    updatedAt: string;
  };
  disabled?: boolean;
  initialEditing?: boolean;
  onStateChange?: (state: ItineraryEditorState) => void;
  onCancel?: () => void;
  onSaved: (lead: Props['lead']) => void;
}

export function EditableItinerary({ lead, disabled, initialEditing = false, onStateChange, onCancel, onSaved }: Props) {
  const { authFetch } = useConsole();
  const [editing, setEditing] = useState(initialEditing);
  const [draft, setDraft] = useState(initialEditing ? lead.itinerary || '' : '');
  const [version, setVersion] = useState(initialEditing ? lead.updatedAt : '');
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const savingRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dirty = editing && draft !== (lead.itinerary || '');
  const validation = editing ? validateItinerary(draft, lead.durationDays) : null;

  useEffect(() => { onStateChange?.({ dirty, saving }); }, [dirty, saving, onStateChange]);
  useEffect(() => { if (initialEditing) textareaRef.current?.focus(); }, [initialEditing]);

  const save = async () => {
    if (savingRef.current || disabled) return;
    if (validation) { setError(validation); return; }
    savingRef.current = true;
    setSaving(true);
    setError('');
    try {
      const response = await authFetch(`/api/v1/leads/${lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itinerary: draft, expectedUpdatedAt: version }),
      });
      const data = await readItineraryResponse<{ lead?: Props['lead'] }>(response);
      if (!data.lead) throw new Error('The save was not confirmed. Your draft is still here; please retry.');
      onSaved(data.lead);
      setEditing(false);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your itinerary. Your draft is still here.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <div className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-zinc-400">Edit the itinerary here, then save to update the proposal PDF.</p>
        {!editing && (
          <button type="button" disabled={disabled} onClick={() => {
            setDraft(lead.itinerary || '');
            setVersion(lead.updatedAt);
            setEditing(true);
            setPreview(false);
            setError('');
            setSaved(false);
          }} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50">
            <Edit3 className="h-3.5 w-3.5" /> Edit itinerary
          </button>
        )}
      </div>
      {saved && <p role="status" className="text-xs text-emerald-300">Itinerary saved. The dashboard and proposal PDF use this version.</p>}
      {editing ? (
        <div className="space-y-3">
          <label htmlFor={`itinerary-draft-${lead.id}`} className="block text-xs font-semibold text-zinc-200">Itinerary content</label>
          <p id={`itinerary-help-${lead.id}`} className="text-xs text-zinc-400">Keep a heading for each day, such as “Day 1: Arrival”, followed by its programme. You can edit all descriptions and inclusions.</p>
          <textarea ref={textareaRef} id={`itinerary-draft-${lead.id}`} aria-describedby={`itinerary-help-${lead.id}`} value={draft} onChange={e => { setDraft(e.target.value); setError(''); }} disabled={saving || disabled} spellCheck rows={22} className="min-h-64 max-h-[55dvh] w-full resize-y rounded-lg border border-zinc-700 bg-zinc-900 p-3 font-mono text-sm leading-relaxed text-zinc-100 focus:border-indigo-500 focus:outline-none disabled:opacity-70" />
          {(error || validation) && <p role="alert" className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">{error || validation}</p>}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button type="button" onClick={() => setPreview(!preview)} className="text-xs text-indigo-300 underline">{preview ? 'Hide preview' : 'Preview changes'}</button>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={saving} onClick={() => { setEditing(false); setError(''); onStateChange?.({ dirty: false, saving: false }); onCancel?.(); }} className="rounded-lg bg-zinc-800 px-3 py-2 text-xs text-zinc-300 disabled:opacity-50">Cancel edits</button>
              <button type="button" disabled={saving || disabled || !!validation || draft === (lead.itinerary || '')} onClick={save} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50">
                {saving && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}{saving ? 'Saving...' : 'Save itinerary'}
              </button>
            </div>
          </div>
          <p className="text-xs text-zinc-500">PDF downloads and emails use the saved itinerary. Save your edits before sharing.</p>
          {preview && <VisualItinerary itineraryText={draft} destination={lead.destination} leadTitle={lead.title} durationDays={lead.durationDays} />}
        </div>
      ) : <VisualItinerary itineraryText={lead.itinerary} destination={lead.destination} leadTitle={lead.title} durationDays={lead.durationDays} />}
    </div>
  );
}
