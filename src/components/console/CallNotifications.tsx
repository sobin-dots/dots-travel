'use client';

import { useEffect, useState, useRef } from 'react';
import { useConsole } from '@/context/ConsoleContext';

export function CallNotifications() {
  const { incomingCall, webPhoneStatus, webPhoneError, initWebPhone, authFetch, bearerToken, currentOrg, leadsList, currentUser } = useConsole();
  const [permission, setPermission] = useState<string>('default');
  const [error, setError] = useState('');
  const [readiness, setReadiness] = useState<{ canReceiveAssignedCalls: boolean; canReceiveNewCalls: boolean; reason: string; busy: boolean } | null>(null);
  const [presenceError, setPresenceError] = useState('');
  const lastNotifiedTaskIdRef = useRef<string | null>(null);
  const knownAssignedLeadIdsRef = useRef<Set<string>>(new Set());
  const initialSyncDoneRef = useRef(false);

  // Monitor newly assigned tasks/leads and follow-ups due now
  useEffect(() => {
    if (!currentUser?.id || !leadsList?.length) return;
    const now = Date.now();

    const currentAssigned = new Set<string>();
    const newlyAssignedLeads: any[] = [];

    for (const lead of leadsList) {
      if (lead.assignedToId === currentUser.id) {
        currentAssigned.add(lead.id);
        if (initialSyncDoneRef.current && !knownAssignedLeadIdsRef.current.has(lead.id)) {
          newlyAssignedLeads.push(lead);
        }

        // 1. Check if scheduled follow-up is due now
        if (lead.nextFollowUpAt) {
          const dueTime = new Date(lead.nextFollowUpAt).getTime();
          const taskKey = `${lead.id}-${lead.nextFollowUpAt}`;
          // If due within the last 5 minutes or right now, and not notified yet
          if (Math.abs(now - dueTime) < 5 * 60 * 1000 && lastNotifiedTaskIdRef.current !== taskKey) {
            lastNotifiedTaskIdRef.current = taskKey;
            if ('Notification' in window && Notification.permission === 'granted') {
              new Notification('Sales Follow-up Due', {
                body: `Follow-up commitment for ${lead.contact?.name || lead.title} is due now!`,
                tag: `followup-${lead.id}`,
              });
            }
          }
        }
      }
    }

    // 2. Alert for newly assigned task / lead
    if (initialSyncDoneRef.current && newlyAssignedLeads.length > 0) {
      for (const lead of newlyAssignedLeads) {
        if ('Notification' in window && Notification.permission === 'granted') {
          const followUpTime = lead.nextFollowUpAt
            ? ` (Follow-up scheduled: ${new Date(lead.nextFollowUpAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`
            : '';
          new Notification('New Task Assigned to You', {
            body: `${lead.title || 'Client Enquiry'} has been assigned to you by Admin${followUpTime}.`,
            tag: `new-task-${lead.id}`,
          });
        }
      }
    }

    knownAssignedLeadIdsRef.current = currentAssigned;
    if (!initialSyncDoneRef.current) {
      initialSyncDoneRef.current = true;
    }
  }, [leadsList, currentUser?.id]);
  useEffect(() => { setPermission('Notification' in window ? Notification.permission : 'unsupported'); }, []);
  useEffect(() => {
    if (!bearerToken || currentOrg?.role === 'viewer') return;
    let cancelled = false;
    setReadiness(null);
    const post = async () => {
      try {
        const response = await authFetch('/api/v1/telephony/presence', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
          ready: !['idle', 'logging_in', 'error'].includes(webPhoneStatus), busy: ['calling', 'ringing', 'connected'].includes(webPhoneStatus),
        }) });
        if (!response.ok) throw new Error('Could not confirm incoming call availability. Sync or sign in again.');
        const data = await response.json();
        if (!cancelled) { setReadiness(data.readiness || null); setPresenceError(''); }
      } catch {
        if (!cancelled) { setReadiness(null); setPresenceError('Could not confirm incoming call availability. Sync or sign in again.'); }
      }
    };
    const onVisible = () => { if (document.visibilityState === 'visible') void post(); };
    void post(); const timer = setInterval(post, 20_000);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);
    return () => { cancelled = true; clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); window.removeEventListener('online', onVisible); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bearerToken, currentOrg?.id, currentOrg?.role, webPhoneStatus]);
  useEffect(() => {
    if (!incomingCall) return;
    const previous = document.title;
    document.title = `Incoming call · ${incomingCall.callerId}`;
    let notification: Notification | undefined;
    if ('Notification' in window && Notification.permission === 'granted' && document.visibilityState !== 'visible') {
      try {
        notification = new Notification('Incoming travel enquiry call', { body: `${incomingCall.callerId} is calling. Open the app to answer.`, tag: `incoming-${incomingCall.callUUID || incomingCall.callerId}`, requireInteraction: true });
        notification.onclick = () => { window.focus(); notification?.close(); };
      } catch { setError('Desktop alerts are unavailable in this browser. Incoming calls still appear in the app.'); }
    }
    return () => { document.title = previous; notification?.close(); };
  }, [incomingCall]);
  if (!currentOrg || currentOrg.role === 'viewer') return null;
  const phoneReady = ['ready', 'ended'].includes(webPhoneStatus);
  const incomingBlocked = phoneReady && (presenceError || (readiness && !readiness.canReceiveAssignedCalls));
  const statusText = webPhoneStatus === 'connected' ? 'On a call' : webPhoneStatus === 'ringing' ? 'Incoming call' : webPhoneStatus === 'calling' ? 'Calling'
    : webPhoneStatus === 'error' ? 'Phone unavailable' : !phoneReady ? 'Connecting phone…'
    : presenceError ? 'Incoming calls not confirmed' : !readiness ? 'Checking incoming calls…'
    : readiness.busy ? 'Incoming call reserved' : !readiness.canReceiveAssignedCalls ? 'Unavailable for incoming calls'
    : readiness.canReceiveNewCalls ? 'Ready for incoming calls' : 'Ready for assigned enquiries only';
  return <div className="flex items-center gap-2 text-[11px] text-zinc-400"><span title={webPhoneError || presenceError || readiness?.reason} role="status" className={`hidden lg:inline ${incomingBlocked || webPhoneStatus === 'error' ? 'text-amber-300' : ''}`}>{statusText}</span>
    {webPhoneStatus === 'error' && (
      <button
        type="button"
        onClick={() => void initWebPhone(true)}
        title={webPhoneError || 'Reconnect browser phone'}
        className="rounded border border-amber-500/40 bg-amber-950/40 px-2 py-0.5 text-amber-300 hover:bg-amber-900/50 cursor-pointer"
      >
        Retry phone
      </button>
    )}
    {phoneReady && presenceError && <span className="max-w-64 text-amber-300 lg:hidden" role="alert">{presenceError}</span>}
    {phoneReady && readiness && !readiness.canReceiveAssignedCalls && !readiness.busy && <span className="max-w-64 text-amber-300">{readiness.reason}</span>}
    {permission !== 'granted' && permission !== 'unsupported' && <button type="button" className="rounded border border-zinc-700 px-2 py-1 text-indigo-300" title="Allow desktop call alerts while the application is open in the background" onClick={async () => {
      try { const result = await Notification.requestPermission(); setPermission(result); setError(result === 'denied' ? 'Call alerts are blocked. Allow notifications in your browser site settings.' : ''); }
      catch { setError('Notifications require HTTPS or localhost and a supported browser.'); }
    }}>Enable call alerts</button>}{error && <span role="alert" className="max-w-60 text-amber-300">{error}</span>}
  </div>;
}
