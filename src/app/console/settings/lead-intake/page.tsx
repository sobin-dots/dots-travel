'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useConsole } from '@/context/ConsoleContext';

type Connection = { id: string; name: string; provider: string; enabled: boolean; formNames: Record<string, string>; lastReceivedAt: string | null };
type Member = { id: string; role: string; receivesLeads: boolean; availableForLeads: boolean; user: { name: string; status: string }; phoneReadiness?: { canReceiveAssignedCalls: boolean; canReceiveNewCalls: boolean; reason: string } };
type Submission = { id: string; connectionId: string; externalId: string; status: string; attempts: number; error: string | null; createdAt: string };
type Intake = { connections: Connection[]; members: Member[]; submissions: Submission[]; failedCount: number; firstContactMinutes: number; workerConfigured: boolean; emailAlertsConfigured: boolean };
const field = 'w-full rounded-lg border border-zinc-700 bg-zinc-950 p-2 text-sm';
const button = 'rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm disabled:opacity-50';

export default function LeadIntakeSettings() {
  const { authFetch, bearerToken, currentOrg } = useConsole();
  const [data, setData] = useState<Intake | null>(null); const [error, setError] = useState(''); const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false); const [provider, setProvider] = useState('google_ads');
  const [secret, setSecret] = useState(''); const [origin, setOrigin] = useState(''); const [editing, setEditing] = useState<Connection | null>(null);
  const admin = ['admin', 'owner'].includes(currentOrg?.role);
  async function load() {
    const res = await authFetch('/api/v1/lead-intake'); const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Could not load settings'); setData(json);
  }
  useEffect(() => {
    setData(null); setEditing(null); setSecret(''); setError('');
    setOrigin(window.location.origin);
    if (bearerToken && admin) load().catch(e => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bearerToken, admin, currentOrg?.id]);
  async function mutate(body: unknown, method = 'PATCH', path = '/api/v1/lead-intake') {
    setBusy(true); setError(''); setMessage('');
    try {
      const res = await authFetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const json = await res.json(); if (!res.ok) throw new Error(json.error || 'Request failed');
      await load(); setMessage(path.endsWith('/process') ? `Processed ${json.processed} submissions. Review their status below.` : 'Saved.'); return true;
    } catch (e) { setError(e instanceof Error ? e.message : 'Request failed'); return false; }
    finally { setBusy(false); }
  }
  async function saveConnection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    let formNames;
    try { formNames = JSON.parse(String(form.get('formNames') || '{}')); } catch { setError('Enter form mappings as a JSON object.'); return; }
    const ok = await mutate({ id: editing?.id, name: form.get('name'), provider, webhookSecret: secret, formNames,
      ...(provider === 'meta' ? { appSecret: form.get('appSecret'), pageAccessToken: form.get('pageAccessToken'), pageId: form.get('pageId'), graphVersion: form.get('graphVersion') } : {}),
      enabled: editing?.enabled ?? true,
    }, 'POST');
    if (ok) { setSecret(''); setEditing(null); }
  }
  if (!admin) return <p className="text-zinc-400">Lead intake settings are available to owners and admins.</p>;
  return <div className="max-w-6xl space-y-6">
    <div><h1 className="text-2xl font-semibold">Lead intake</h1><p className="mt-1 text-sm text-zinc-400">Connect forms, choose the sales rotation, and recover failed imports. <Link className="text-indigo-300 underline" href="/console/enquiries">Open enquiry inbox</Link></p></div>
    {error && <p role="alert" className="p-3 rounded-lg bg-red-950/40 text-red-300">{error}</p>}{message && <p role="status" className="text-emerald-300">{message}</p>}
    {!data ? <p>Loading settings…</p> : <>
      <section className="rounded-xl border border-zinc-800 p-4 space-y-3">
        <h2 className="font-semibold">Import processing and alerts</h2>
        <p className="text-sm text-zinc-400">Worker credentials: {data.workerConfigured ? 'configured' : 'not configured'} · Email delivery: {data.emailAlertsConfigured ? 'configured' : 'not configured'} · Failed imports: {data.failedCount}</p>
        <p className="text-sm text-zinc-400">Schedule the import worker every minute on your hosting platform. Set the agency notification email in Platform settings to receive failure alerts. Failed imports remain visible here.</p>
        <button disabled={busy} className={button} onClick={() => mutate({}, 'POST', '/api/v1/lead-intake/process')}>Process pending imports now</button>
      </section>
      <section className="rounded-xl border border-zinc-800 p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Sales rotation</h2><button type="button" className={button} disabled={busy} onClick={() => load().catch(e => setError(e.message))}>Refresh phone status</button></div><p className="text-sm text-zinc-400">New Sales and Operator accounts start with Receives leads and Available enabled. You can switch either off here. Only active, enabled and available members receive new leads. When nobody is available, leads stay unassigned in the owner's inbox. Incoming calls also need an online browser phone. Receives leads enables calls from new numbers and backup calls.</p>
        <form className="flex flex-wrap items-end gap-3" onSubmit={e => { e.preventDefault(); const form = new FormData(e.currentTarget); mutate({ action: 'deadline', minutes: Number(form.get('minutes')) }); }}><label className="text-sm">First-contact deadline (minutes)<input key={data.firstContactMinutes} defaultValue={data.firstContactMinutes} name="minutes" type="number" min={1} max={10080} required className={field} /></label><button disabled={busy} className={button}>Save deadline</button></form>
        <div className="space-y-3">{data.members.filter(m => m.role !== 'viewer').map(m => <div key={m.id} className="flex flex-wrap justify-between gap-3 border-t border-zinc-800 pt-3 text-sm"><div><span>{m.user.name} <span className="text-zinc-500">({m.role}, {m.user.status})</span></span>{m.phoneReadiness && <p className={`mt-1 text-xs ${m.phoneReadiness.canReceiveNewCalls ? 'text-emerald-300' : 'text-amber-300'}`}>{m.phoneReadiness.reason}</p>}</div><div className="flex gap-4"><label className="flex gap-2"><input type="checkbox" disabled={busy || m.user.status !== 'active'} checked={m.receivesLeads} onChange={e => mutate({ action: 'member', membershipId: m.id, receivesLeads: e.target.checked, availableForLeads: m.availableForLeads })} />Receives leads</label><label className="flex gap-2"><input type="checkbox" disabled={busy || m.user.status !== 'active'} checked={m.availableForLeads} onChange={e => mutate({ action: 'member', membershipId: m.id, receivesLeads: m.receivesLeads, availableForLeads: e.target.checked })} />Available</label></div></div>)}</div>
      </section>
      <section className="rounded-xl border border-zinc-800 p-4 space-y-4">
        <h2 className="font-semibold">Connected forms</h2>
        {!data.connections.length && <p className="text-sm text-zinc-400">No forms connected yet. Add a connection below.</p>}
        {data.connections.map(c => <div key={c.id} className="border-t border-zinc-800 pt-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2"><span>{c.name} <span className="text-xs text-zinc-400">{c.provider} · {c.enabled ? 'Enabled' : 'Paused'}</span></span><div className="flex gap-2"><button disabled={busy} className={button} onClick={() => { setEditing(c); setProvider(c.provider); setSecret(''); }}>Edit / rotate credentials</button><button disabled={busy} className={button} onClick={() => mutate({ action: 'connection', id: c.id, enabled: !c.enabled })}>{c.enabled ? 'Pause' : 'Enable'}</button></div></div>
          <label className="block text-xs text-zinc-400">Webhook URL<input readOnly value={`${origin}/api/v1/webhooks/leads/${c.id}`} onFocus={e => e.target.select()} className={`${field} mt-1 font-mono`} /></label>
          <p className="text-xs text-zinc-500">Last received: {c.lastReceivedAt ? new Date(c.lastReceivedAt).toLocaleString() : 'No submissions yet'}</p>
        </div>)}
        <form key={editing?.id || 'new'} onSubmit={saveConnection} className="grid sm:grid-cols-2 gap-3 border-t border-zinc-800 pt-4">
          <h3 className="sm:col-span-2 font-medium">{editing ? `Edit ${editing.name}` : 'Add a connection'}</h3>
          <label className="text-sm">Connection name<input name="name" defaultValue={editing?.name} required maxLength={100} className={field} /></label>
          <label className="text-sm">Platform<select disabled={!!editing} className={field} value={provider} onChange={e => setProvider(e.target.value)}><option value="google_ads">Google Ads</option><option value="google_forms">Google Forms</option><option value="meta">Meta</option><option value="website">Website</option><option value="generic">Other connected form</option></select></label>
          <label className="text-sm sm:col-span-2">{provider === 'meta' ? 'Webhook verification token' : 'Webhook secret'}<div className="flex gap-2"><input type="password" autoComplete="new-password" required minLength={24} maxLength={256} value={secret} onChange={e => setSecret(e.target.value)} className={field} /><button type="button" className={button} onClick={() => setSecret(Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join(''))}>Generate</button><button type="button" disabled={!secret} className={button} onClick={() => navigator.clipboard.writeText(secret).then(() => setMessage('Secret copied. Store it in the sending form before saving.')).catch(() => setError('Clipboard unavailable. Enter your own secret.'))}>Copy</button></div></label>
          {provider === 'meta' && <><label className="text-sm">Meta app secret<input type="password" name="appSecret" autoComplete="new-password" required className={field} /></label><label className="text-sm">Page access token<input type="password" name="pageAccessToken" autoComplete="new-password" required className={field} /></label><label className="text-sm">Page ID<input name="pageId" required className={field} /></label><label className="text-sm">Graph API version<input name="graphVersion" placeholder="Version enabled for your Meta app" required pattern="v[0-9]+\.[0-9]+" className={field} /></label></>}
          <label className="text-sm sm:col-span-2">Form ID → exact form name (JSON)<textarea name="formNames" className={`${field} font-mono`} defaultValue={JSON.stringify(editing?.formNames || {}, null, 2)} placeholder={'{"123456": "Summer holiday enquiry"}'} /></label>
          <p className="text-xs text-zinc-400 sm:col-span-2">{provider === 'google_ads' ? 'Google Ads does not send form names. Map every connected form ID above. Unmapped forms remain in failed imports until corrected.' : provider === 'meta' ? 'Subscribe your Meta app to the Page leadgen webhook. Form names are retrieved from Meta unless mapped above.' : provider === 'google_forms' ? 'Use the Google Forms submission script supplied with this release. Configure its URL and secret in Apps Script properties.' : 'Send submissions from your website server or form service, with the secret in the X-Lead-Secret header. Include a stable submission ID and the exact form name.'} Credentials are encrypted and never displayed after saving. Copy the secret before saving.</p>
          <div className="flex gap-2"><button disabled={busy} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm disabled:opacity-50">Save connection</button>{editing && <button type="button" className={button} onClick={() => { setEditing(null); setSecret(''); }}>Cancel</button>}</div>
        </form>
      </section>
      <section className="rounded-xl border border-zinc-800 p-4 space-y-3"><h2 className="font-semibold">Recent submissions</h2><p className="text-xs text-zinc-400">The latest 50 submissions. Imports retry automatically up to eight times. Google Ads test submissions are marked ignored and do not create leads.</p>{data.submissions.map(s => <div key={s.id} className="border-t border-zinc-800 pt-3 flex flex-wrap justify-between gap-3 text-sm"><div><p>{data.connections.find(c => c.id === s.connectionId)?.name} · <strong>{s.status}</strong> · {s.attempts} attempts</p><p className="text-xs text-zinc-500">{s.externalId} · {new Date(s.createdAt).toLocaleString()}</p>{s.error && <p className="text-amber-300 text-xs mt-1 whitespace-pre-wrap">{s.error}</p>}</div>{s.status === 'failed' && <button disabled={busy} className={button} onClick={() => mutate({ action: 'retry', id: s.id })}>Queue retry</button>}</div>)}{!data.submissions.length && <p className="text-sm text-zinc-500">No submissions received yet.</p>}</section>
    </>}
  </div>;
}
