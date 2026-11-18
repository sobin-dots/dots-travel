'use client';

import { useRef, useState } from 'react';
import { useConsole } from '@/context/ConsoleContext';
import { contactValuesFromForm } from '@/lib/contact-fields';
import { ContactDetailsFields } from './ContactDetailsFields';

export function EditContactModal({ contact, onClose }: { contact: Record<string, any>; onClose: () => void }) {
  const { authFetch, setContactsList, fetchData } = useConsole();
  const [saving, setSaving] = useState(false); const [error, setError] = useState(''); const inFlight = useRef(false);
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-3"><section role="dialog" aria-modal="true" aria-labelledby="edit-contact-title" className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-4">
    <h2 id="edit-contact-title" className="font-semibold text-white">Edit contact</h2>
    {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
    <form className="space-y-4" onSubmit={async event => {
      event.preventDefault(); if (inFlight.current) return;
      const values = contactValuesFromForm(new FormData(event.currentTarget)); inFlight.current = true; setSaving(true); setError('');
      try {
        const res = await authFetch(`/api/v1/contacts/${contact.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...values, expectedUpdatedAt: contact.updatedAt }) });
        const data = await res.json(); if (!res.ok || !data.contact) throw new Error(data.error || 'Contact update was not confirmed');
        setContactsList(previous => previous.map(item => item.id === contact.id ? data.contact : item).sort((a, b) => a.name.localeCompare(b.name)));
        fetchData(); onClose();
      } catch (e) { setError(e instanceof Error ? e.message : 'Could not update contact'); }
      finally { inFlight.current = false; setSaving(false); }
    }}><ContactDetailsFields contact={contact} disabled={saving} /><div className="flex justify-end gap-3 border-t border-zinc-800 pt-4"><button type="button" disabled={saving} onClick={onClose} className="rounded-lg bg-zinc-800 px-4 py-2 text-sm">Cancel</button><button disabled={saving} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm disabled:opacity-50">{saving ? 'Saving…' : 'Save changes'}</button></div></form>
  </section></div>;
}
