'use client';

import { useEffect, useState } from 'react';
import { useConsole } from '@/context/ConsoleContext';
import { comparisonColumns, comparisonRows, formatBudget, type ComparisonOption } from '@/lib/itinerary-comparison';
import { readItineraryResponse } from '@/lib/itinerary-response';
import { leadItineraryIssue } from '@/lib/itinerary-content';

const field = 'w-full rounded-lg border border-zinc-700 bg-zinc-900 p-2 text-sm';
interface Props { lead: any; disabled?: boolean; initialInstructions?: string; onMainChanged: (lead: any) => void; }
export function ItineraryComparison({ lead, disabled, initialInstructions = '', onMainChanged }: Props) {
  const { authFetch, bearerToken } = useConsole();
  const [options, setOptions] = useState<ComparisonOption[]>([]);
  const [budgets, setBudgets] = useState(''); const [instructions, setInstructions] = useState(initialInstructions);
  const [currency, setCurrency] = useState(String(lead.metadata?.currency || 'INR'));
  const [busy, setBusy] = useState(''); const [error, setError] = useState(''); const [message, setMessage] = useState('');
  const [selectedId, setSelectedId] = useState(''); const [revision, setRevision] = useState(''); const [manual, setManual] = useState<string | null>(null);
  useEffect(() => { if (initialInstructions) setInstructions(initialInstructions); }, [initialInstructions]);
  const current: ComparisonOption = { id: 'current', label: 'Current itinerary', budget: lead.targetBudget, currency: lead.metadata?.currency || 'INR', itinerary: lead.itinerary,
    durationDays: lead.durationDays, departureDate: lead.departureDate, destination: lead.destination || '' };
  async function load() {
    const res = await authFetch(`/api/v1/leads/${lead.id}/options`); const data = await readItineraryResponse<{ options: ComparisonOption[] }>(res);
    setOptions(data.options);
  }
  useEffect(() => { load().catch(e => setError(e.message)); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [lead.id]);
  async function generate(event: React.FormEvent) {
    event.preventDefault(); if (busy || disabled) return;
    const values = budgets.split(/[,;\n]/).map(b => Number(b.trim())).filter(v => v > 0 && Number.isFinite(v));
    if (!values.length || values.length > 3) { setError('Enter one to three budget amounts, separated by commas.'); return; }
    setBusy('generate'); setError(''); setMessage('');
    try {
      const res = await authFetch(`/api/v1/leads/${lead.id}/options`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedUpdatedAt: lead.updatedAt,
        currency, instructions, options: values.map((budget, i) => ({ label: `Budget option ${i + 1} — ${currency} ${budget.toLocaleString('en-IN')}`, budget })) }) });
      const data = await readItineraryResponse<{ lead: any }>(res); onMainChanged(data.lead); await load(); setMessage('Alternatives saved. Compare the programmes below.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Generation failed'); }
    finally { setBusy(''); }
  }
  async function change(option: ComparisonOption, action: 'apply' | 'revise' | 'edit') {
    if (busy || disabled) return; setBusy(option.id); setError(''); setMessage('');
    try {
      const res = await authFetch(`/api/v1/leads/${lead.id}/options/${option.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        action, expectedUpdatedAt: option.updatedAt, ...(action === 'apply' ? { expectedLeadUpdatedAt: lead.updatedAt } : action === 'edit' ? { itinerary: manual } : { notes: revision }),
      }) });
      const data = await readItineraryResponse<{ lead?: any }>(res); if (data.lead) onMainChanged(data.lead);
      await load(); setManual(null); setRevision(''); setSelectedId(''); setMessage(action === 'apply' ? 'Selected as the main itinerary. The previous main itinerary is kept as an alternative.' : 'Alternative updated.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Update failed'); }
    finally { setBusy(''); }
  }
  const issue = leadItineraryIssue(lead);
  const rows = comparisonRows([current, ...options]);
  const exportUrl = (format: string) => `/api/v1/leads/${lead.id}/export?layout=comparison&format=${format}&token=${bearerToken}`;
  return <section className="space-y-5">
    <div className="flex flex-wrap justify-between gap-3"><div><h4 className="text-base font-semibold">Compare itineraries by budget</h4><p className="text-xs text-zinc-400 mt-1">Same enquiry, different programmes. Budget targets apply to the whole trip; quotations remain separate.</p></div><div className="flex gap-3 text-sm">{['pdf', 'docx'].map(format => <a key={format} aria-disabled={disabled || !!issue} href={disabled || issue ? undefined : exportUrl(format)} className="text-indigo-300 underline">Download {format === 'docx' ? 'Word' : 'PDF'}</a>)}</div></div>
    {issue && <p role="alert" className="text-amber-300 text-sm">{issue}</p>}
    {error && <p role="alert" className="text-red-300 text-sm">{error}</p>}{message && <p role="status" className="text-emerald-300 text-sm">{message}</p>}
    <form onSubmit={generate} className="rounded-xl border border-zinc-800 p-4 grid sm:grid-cols-3 gap-3">
      <label className="text-xs text-zinc-400 sm:col-span-2">Budget targets for the whole trip, separated by commas<input required value={budgets} onChange={e => setBudgets(e.target.value)} placeholder="50000, 75000, 100000" className={field} /></label>
      <label className="text-xs text-zinc-400">Currency<input required pattern="[A-Z]{3}" maxLength={3} value={currency} onChange={e => setCurrency(e.target.value.toUpperCase())} className={field} /></label>
      <label className="text-xs text-zinc-400 sm:col-span-3">Requirements for these alternatives<textarea value={instructions} onChange={e => setInstructions(e.target.value)} rows={3} placeholder="Keep the same area and dates; compare standard hotels with a premium hotel and private transfers…" className={field} /></label>
      <button disabled={!!busy || disabled || !!issue} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm disabled:opacity-50 sm:col-span-3">{busy === 'generate' ? 'Creating budget alternatives…' : 'Generate alternatives with AI'}</button>
    </form>
    <div className="overflow-x-auto rounded-xl border border-zinc-800"><table className="w-full min-w-[1200px] text-xs text-left"><thead className="bg-zinc-800"><tr>{comparisonColumns.map(c => <th key={c} className="p-3">{c}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={`${row.optionId}:${row.dayNumber}`} className="border-t border-zinc-800 align-top">{row.cells.map((cell, i) => <td key={i} className={`p-3 whitespace-pre-line ${i === 4 ? 'min-w-[300px]' : 'min-w-[110px]'}`}>{cell}</td>)}</tr>)}</tbody></table></div>
    {options.map(option => <article key={option.id} className="rounded-xl border border-zinc-800 p-4 space-y-3"><div className="flex flex-wrap justify-between gap-3"><p className="font-medium text-sm">{option.label} · {formatBudget(option)}</p><div className="flex flex-wrap gap-3 text-xs"><button disabled={!!busy || disabled || !!issue} onClick={() => change(option, 'apply')} className="text-emerald-300 underline disabled:opacity-50">Use as main itinerary</button><button disabled={!!busy || disabled} onClick={() => { setSelectedId(option.id); setManual(null); }} className="text-indigo-300 underline">Revise with AI</button><button disabled={!!busy || disabled} onClick={() => { setSelectedId(option.id); setManual(option.itinerary); }} className="text-indigo-300 underline">Edit text</button></div></div>
      {selectedId === option.id && <div className="space-y-2"><textarea aria-label={manual === null ? 'Alternative revision instructions' : 'Alternative itinerary text'} value={manual === null ? revision : manual} onChange={e => manual === null ? setRevision(e.target.value) : setManual(e.target.value)} rows={manual === null ? 3 : 16} className={field} /><div className="flex gap-3"><button disabled={!!busy || disabled || (manual === null && !revision.trim())} onClick={() => change(option, manual === null ? 'revise' : 'edit')} className="rounded-lg bg-indigo-600 px-3 py-2 text-sm disabled:opacity-50">{busy === option.id ? 'Saving…' : manual === null ? 'Revise alternative' : 'Save alternative'}</button><button disabled={!!busy} onClick={() => { setSelectedId(''); setManual(null); }} className="text-sm text-zinc-400">Cancel</button></div></div>}
    </article>)}
  </section>;
}
