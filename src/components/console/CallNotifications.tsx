'use client';

import { useEffect, useState } from 'react';
import { useConsole } from '@/context/ConsoleContext';

export function CallNotifications() {
  const { incomingCall, webPhoneStatus, authFetch, bearerToken, currentOrg } = useConsole();
  const [permission, setPermission] = useState<string>('default');
  const [error, setError] = useState('');
  useEffect(() => { setPermission('Notification' in window ? Notification.permission : 'unsupported'); }, []);
  useEffect(() => {
    if (!bearerToken || currentOrg?.role === 'viewer') return;
    const post = () => authFetch('/api/v1/telephony/presence', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      ready: !['idle', 'logging_in', 'error'].includes(webPhoneStatus), busy: ['calling', 'ringing', 'connected'].includes(webPhoneStatus),
    }) }).catch(() => {});
    post(); const timer = setInterval(post, 20_000); return () => clearInterval(timer);
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
  return <div className="flex items-center gap-2 text-[11px] text-zinc-400"><span className="hidden lg:inline">{webPhoneStatus === 'connected' ? 'On a call' : ['ready', 'ended'].includes(webPhoneStatus) ? 'Browser phone ready' : webPhoneStatus === 'error' ? 'Phone unavailable' : 'Connecting phone…'}</span>
    {permission !== 'granted' && permission !== 'unsupported' && <button type="button" className="rounded border border-zinc-700 px-2 py-1 text-indigo-300" title="Allow desktop call alerts while the application is open in the background" onClick={async () => {
      try { const result = await Notification.requestPermission(); setPermission(result); setError(result === 'denied' ? 'Call alerts are blocked. Allow notifications in your browser site settings.' : ''); }
      catch { setError('Notifications require HTTPS or localhost and a supported browser.'); }
    }}>Enable call alerts</button>}{error && <span role="alert" className="max-w-60 text-amber-300">{error}</span>}
  </div>;
}
