'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type NetworkState = 'online' | 'slow' | 'offline' | 'restored';

const HEALTH_URL = '/api/v1/health';
const PROBE_TIMEOUT_MS = 8000; // no answer within this => treated as disconnected
const SLOW_THRESHOLD_MS = 4000; // answer slower than this => "slow connection"
const ONLINE_PROBE_INTERVAL_MS = 15000; // health check cadence while connected
const OFFLINE_RETRY_INTERVAL_MS = 3000; // reconnect attempt cadence while disconnected
const RESTORED_VISIBLE_MS = 2500;

type ProbeResult = { ok: boolean; latency: number };

async function probeConnection(): Promise<ProbeResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  const startedAt = performance.now();
  try {
    // Any HTTP response means the network path to the server works; only a thrown
    // error (offline, DNS failure, timeout) counts as a connectivity problem.
    await fetch(`${HEALTH_URL}?_=${Date.now()}`, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    });
    return { ok: true, latency: performance.now() - startedAt };
  } catch {
    return { ok: false, latency: performance.now() - startedAt };
  } finally {
    clearTimeout(timer);
  }
}

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-6 w-6 shrink-0 animate-spin rounded-full border-[3px] border-sky-200/90 border-t-blue-600"
    />
  );
}

/**
 * Global connectivity indicator. Shows a spinner message while the browser is offline,
 * the server is unreachable, or the connection is very slow, and clears itself once
 * the connection recovers.
 */
export function NetworkStatus() {
  const [state, setState] = useState<NetworkState>('online');
  const stateRef = useRef<NetworkState>('online');
  const restoredTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const probing = useRef(false);

  const applyState = useCallback((next: NetworkState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const runProbe = useCallback(async () => {
    if (probing.current) return;
    probing.current = true;
    try {
      const wasDown = stateRef.current === 'offline';
      const { ok, latency } = await probeConnection();

      if (!ok) {
        if (restoredTimer.current) clearTimeout(restoredTimer.current);
        applyState('offline');
        return;
      }

      if (wasDown) {
        applyState('restored');
        if (restoredTimer.current) clearTimeout(restoredTimer.current);
        restoredTimer.current = setTimeout(() => {
          if (stateRef.current === 'restored') applyState('online');
        }, RESTORED_VISIBLE_MS);
        return;
      }

      if (latency > SLOW_THRESHOLD_MS) {
        applyState('slow');
      } else if (stateRef.current === 'slow') {
        applyState('online');
      }
    } finally {
      probing.current = false;
    }
  }, [applyState]);

  useEffect(() => {
    // Deferred so the initial check is not a synchronous setState inside the effect body.
    const initialCheck = setTimeout(() => {
      if (!navigator.onLine) applyState('offline');
    }, 0);

    const handleOffline = () => {
      if (restoredTimer.current) clearTimeout(restoredTimer.current);
      applyState('offline');
    };
    const handleOnline = () => {
      void runProbe();
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void runProbe();
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    document.addEventListener('visibilitychange', handleVisibility);

    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const delay =
        stateRef.current === 'offline' ? OFFLINE_RETRY_INTERVAL_MS : ONLINE_PROBE_INTERVAL_MS;
      timer = setTimeout(async () => {
        if (document.visibilityState === 'visible' || stateRef.current === 'offline') {
          await runProbe();
        }
        schedule();
      }, delay);
    };
    schedule();

    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisibility);
      clearTimeout(timer);
      clearTimeout(initialCheck);
      if (restoredTimer.current) clearTimeout(restoredTimer.current);
    };
  }, [applyState, runProbe]);

  if (state === 'online') return null;

  const message =
    state === 'offline'
      ? 'You lost your network connection. Trying to reconnect.'
      : state === 'slow'
        ? 'Your connection is slow. Please wait…'
        : 'Connection restored.';

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed bottom-6 left-6 z-[9999] max-w-[calc(100vw-3rem)]"
    >
      <div className="pointer-events-auto flex items-center gap-4 rounded-xl border border-zinc-700/70 bg-zinc-900/95 px-5 py-4 text-[15px] font-medium text-white shadow-2xl backdrop-blur">
        {state === 'restored' ? (
          <span
            aria-hidden="true"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-sm leading-none text-white"
          >
            ✓
          </span>
        ) : (
          <Spinner />
        )}
        <span>{message}</span>
      </div>
    </div>
  );
}
