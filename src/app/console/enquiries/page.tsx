'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useConsole } from '@/context/ConsoleContext';

const inputClass = 'rounded-lg border border-zinc-700 bg-zinc-900 p-2 text-sm text-zinc-100 w-full';
const enquiryTags = [
  { value: 'hot', label: 'Hot' },
  { value: 'warm', label: 'Warm' },
  { value: 'cold', label: 'Cold' },
];

export default function EnquiriesPage() {
  const { leadsList, authFetch, bearerToken, currentOrg, staffList, fetchData, handleSelectLead } = useConsole();
  const admin = ['owner', 'admin'].includes(currentOrg?.role);
  const [error, setError] = useState(''); const [busy, setBusy] = useState<string | null>(null);
  const [search, setSearch] = useState(''); const [tagFilter, setTagFilter] = useState('');
  const [source, setSource] = useState(''); const [assignee, setAssignee] = useState('');
  const [showNew, setShowNew] = useState(false); const [failed, setFailed] = useState(0);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    if (!bearerToken || !admin) { setFailed(0); return; }
    let cancelled = false;
    authFetch('/api/v1/lead-intake').then(async r => { if (r.ok && !cancelled) setFailed((await r.json()).failedCount); }).catch(() => {});
    return () => { cancelled = true; };
    // Refresh alongside console data; avoid an effect loop on authFetch's changing identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bearerToken, admin, currentOrg?.id, leadsList]);

  async function update(id: string, body: Record<string, unknown>) {
    setBusy(id); setError('');
    try {
      const res = await authFetch(`/api/v1/leads/${id}/qualification`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json(); if (!res.ok) throw new Error(data.error || 'Update failed');
      await fetchData();
    } catch (e) { setError(e instanceof Error ? e.message : 'Update failed'); }
    finally { setBusy(null); }
  }
  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); setBusy('new'); setError('');
    try {
      const res = await authFetch('/api/v1/leads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        submissionId: crypto.randomUUID(), name: form.get('name'), phone: form.get('phone') || undefined, email: form.get('email') || undefined,
        destination: form.get('destination') || undefined, notes: form.get('notes') || undefined, formId: 'manual', formName: 'Staff entry',
      }) });
      const data = await res.json(); if (!res.ok) throw new Error(data.error || 'Could not create enquiry');
      setShowNew(false); await fetchData();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not create enquiry'); }
    finally { setBusy(null); }
  }
  const visible = leadsList.filter(l => (!tagFilter || l.temperature === tagFilter) && (!source || l.source === source)
    && (!assignee || (assignee === 'unassigned' ? !l.assignedToId : l.assignedToId === assignee))
    && (!search || [l.title, l.contact?.name, l.customerEmail, l.formName, l.contact?.phone, l.temperature, ...(l.tags || [])].join(' ').toLowerCase().includes(search.toLowerCase())));
  const unassigned = leadsList.filter(l => !l.assignedToId).length;
  return <div className="space-y-6 max-w-7xl">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="text-2xl font-semibold">Enquiry inbox</h1><p className="text-sm text-zinc-400 mt-1">{admin ? 'All agency enquiries and assignments.' : 'Your assigned enquiries.'} First-contact deadlines begin when enquiries arrive.</p></div>
      <div className="flex gap-2"><button className={inputClass} disabled={!!busy} onClick={() => fetchData()}>Refresh</button>{admin && <button className="rounded-lg bg-indigo-600 px-4 py-2 text-sm whitespace-nowrap" onClick={() => setShowNew(!showNew)}>New enquiry</button>}</div>
    </div>
    {error && <p role="alert" className="rounded-lg bg-red-950/50 p-3 text-red-300">{error}</p>}
    {admin && (unassigned > 0 || failed > 0) && <div role="status" className="rounded-xl border border-amber-800 bg-amber-950/30 p-4 text-sm text-amber-200">{unassigned} unassigned enquiries · {failed} failed imports. <Link className="underline" href="/console/settings/lead-intake">Review availability and imports</Link></div>}
    {showNew && admin && <form onSubmit={create} className="grid sm:grid-cols-2 gap-3 rounded-xl border border-zinc-800 p-4">
      <label className="text-sm">Customer name<input required name="name" maxLength={150} className={inputClass} /></label>
      <label className="text-sm">Phone with country code<input name="phone" placeholder="+919876543210" className={inputClass} /></label>
      <label className="text-sm">Email<input type="email" name="email" className={inputClass} /></label>
      <label className="text-sm">Destination<input name="destination" className={inputClass} /></label>
      <label className="text-sm sm:col-span-2">Notes<textarea name="notes" className={inputClass} /></label>
      <p className="text-xs text-zinc-400">Provide a phone number or email. Available salespeople receive enquiries in rotation.</p>
      <button disabled={!!busy} className="rounded-lg bg-indigo-600 px-4 py-2 disabled:opacity-50">{busy === 'new' ? 'Saving…' : 'Save enquiry'}</button>
    </form>}
    <div className="grid sm:grid-cols-4 gap-3">
      <input aria-label="Search enquiries" placeholder="Name, form, phone, email or tag" value={search} onChange={e => setSearch(e.target.value)} className={inputClass} />
      <select aria-label="Filter by enquiry tag" value={tagFilter} onChange={e => setTagFilter(e.target.value)} className={inputClass}><option value="">All enquiry tags</option>{enquiryTags.map(tag => <option key={tag.value} value={tag.value}>{tag.label}</option>)}</select>
      <select aria-label="Filter by source" value={source} onChange={e => setSource(e.target.value)} className={inputClass}><option value="">All sources</option>{Array.from(new Set(leadsList.map(l => l.source || 'manual'))).map(s => <option key={s}>{s}</option>)}</select>
      <select aria-label="Filter by assignee" value={assignee} onChange={e => setAssignee(e.target.value)} className={inputClass}><option value="">All assignees</option>{admin && <option value="unassigned">Unassigned</option>}{staffList.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
    </div>
    <p className="text-xs text-zinc-400">{visible.length} enquiries</p>
    <div className="space-y-3">{visible.map(lead => {
      const overdue = !lead.firstContactAt && lead.firstContactDueAt && Date.parse(lead.firstContactDueAt) < now;
      return <article key={lead.id} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 space-y-3">
        <div className="flex flex-wrap justify-between gap-3"><div><h2 className="font-medium">{lead.title}</h2><p className="text-sm text-zinc-400">{lead.contact?.phone || lead.metadata?.customerPhone} {lead.customerEmail}</p></div><span className={`text-xs ${overdue ? 'text-red-300' : 'text-zinc-400'}`}>{lead.firstContactAt ? `Contacted ${new Date(lead.firstContactAt).toLocaleString()}` : lead.firstContactDueAt ? `${overdue ? 'Overdue' : 'Contact due'} ${new Date(lead.firstContactDueAt).toLocaleString()}` : 'No contact deadline'}</span></div>
        <p className="text-xs text-zinc-400">{lead.source} · {lead.formName || 'No form recorded'} {lead.formId && `(${lead.formId})`} · {lead.stage}{lead.duplicateContactFlag && <span className="text-amber-300"> · Repeat enquiry or contact match needs review</span>}</p>
        {(lead.campaignId || lead.adId || lead.utmCampaign) && <p className="text-xs text-zinc-400">Campaign: {lead.campaignName || lead.campaignId || lead.utmCampaign} {lead.adId && `· Ad: ${lead.adName || lead.adId}`}</p>}
        {lead.metadata?.enquiryNotes && <p className="text-sm whitespace-pre-wrap">{lead.metadata.enquiryNotes}</p>}
        {Object.keys(lead.metadata?.formAnswers || {}).length > 0 && <details className="text-sm text-zinc-400"><summary className="cursor-pointer">Original form answers</summary><dl className="mt-2 grid sm:grid-cols-2 gap-2">{Object.entries(lead.metadata.formAnswers).map(([question, answer]) => <div key={question}><dt className="text-xs text-zinc-500">{question}</dt><dd className="whitespace-pre-wrap text-zinc-200">{String(answer)}</dd></div>)}</dl></details>}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <label className="text-xs text-zinc-400">Enquiry tag<select disabled={!!busy} value={lead.temperature || 'warm'} onChange={e => update(lead.id, { temperature: e.target.value })} className={inputClass}>{enquiryTags.map(tag => <option key={tag.value} value={tag.value}>{tag.label}</option>)}</select></label>
          <label className="text-xs text-zinc-400">Assigned to{admin ? <select disabled={!!busy} value={lead.assignedToId || ''} onChange={e => update(lead.id, { assignedToId: e.target.value || null })} className={inputClass}><option value="">Unassigned</option>{staffList.filter(m => m.status === 'active' && m.role !== 'viewer').map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select> : <p className="p-2 text-sm">{lead.assignedTo?.name || 'You'}</p>}</label>
          <label className="text-xs text-zinc-400">Other tags, separated by commas<input key={`${lead.id}:${(lead.tags || []).join()}`} disabled={!!busy} className={inputClass} defaultValue={(lead.tags || []).join(', ')} onBlur={e => { const tags = e.target.value.split(',').map(t => t.trim()).filter(Boolean); if (JSON.stringify(tags) !== JSON.stringify(lead.tags || [])) update(lead.id, { tags }); }} /></label>
          <div className="flex items-end gap-2">{!lead.firstContactAt && <button disabled={!!busy} className={`${inputClass} disabled:opacity-50`} onClick={() => update(lead.id, { contacted: true })}>Mark contacted</button>}{admin && !lead.assignedToId && <button disabled={!!busy} className={inputClass} onClick={() => update(lead.id, { autoAssign: true })}>Assign next</button>}</div>
        </div>
        <button className="text-xs text-indigo-300 underline" onClick={() => handleSelectLead(lead.id)}>{lead.itinerary ? 'Open itinerary' : 'Open lead and prepare itinerary'}</button>
      </article>;
    })}{!visible.length && <div className="p-10 text-center rounded-xl border border-zinc-800 text-zinc-400">No enquiries match this view.{admin && <p className="mt-2 text-sm"><Link href="/console/settings/lead-intake" className="underline text-indigo-300">Connect a lead form</Link> or add an enquiry above.</p>}</div>}</div>
  </div>;
}
