/**
 * Plivo Browser SDK v2 Compatibility Shim
 * 
 * In Plivo Browser SDK (v2.x), Plivo's internal `answerIncomingCall()` and `makeCall()`
 * invoke `this.noiseSuppresion.startNoiseSuppression(...)` unconditionally.
 * If noise reduction hasn't initialized yet, or on re-login/permOnClick states,
 * `this.noiseSuppresion` is undefined, throwing:
 * "TypeError: Cannot read properties of undefined (reading 'startNoiseSuppression')".
 * 
 * Furthermore, Plivo depends on `startNoiseSuppression()` and `setLocalMediaStream()`
 * to return an active MediaStream containing live audio tracks. If null is returned,
 * Plivo connects the call with NO audio track (silent agent channel).
 */

export async function getLiveMicrophoneStream(): Promise<MediaStream | null> {
  if (typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia) return null;

  try {
    const existing = (window as any).localStream as MediaStream | undefined;
    if (
      existing &&
      typeof existing.getAudioTracks === 'function' &&
      existing.getAudioTracks().some((t) => t.readyState === 'live' && t.enabled)
    ) {
      return existing;
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    // Ensure all audio tracks are enabled and active
    stream.getAudioTracks().forEach((track) => {
      track.enabled = true;
    });

    (window as any).localStream = stream;
    return stream;
  } catch (err) {
    console.warn('[PlivoShim] getUserMedia audio request notice:', err);
    return null;
  }
}

export function createNoiseSuppressionShim(clientInstance?: any) {
  return {
    __isPlivoNoiseShim: true as const,
    noiseSupressionRunning: false,
    started: false,
    startNoiseSuppression: async (stream?: any) => {
      let activeStream =
        stream || (typeof window !== 'undefined' ? (window as any).localStream : null);
      if (
        !activeStream ||
        typeof activeStream.getAudioTracks !== 'function' ||
        !activeStream.getAudioTracks().some((t: any) => t.readyState === 'live')
      ) {
        activeStream = await getLiveMicrophoneStream();
      }
      if (typeof window !== 'undefined' && activeStream) {
        (window as any).localStream = activeStream;
      }
      return activeStream;
    },
    stopNoiseSuppresion: () => {},
    stopNoiseSuppression: () => {},
    setLocalMediaStream: async () => {
      // Never block or prompt on getUserMedia() during incoming SIP INVITE ringing (outside a user gesture).
      // Return an already-live local stream if present; otherwise resolve null immediately so Plivo emits onIncomingCall at 0ms.
      if (typeof window === 'undefined') return null;
      const existing = (window as any).localStream as MediaStream | undefined;
      if (
        existing &&
        typeof existing.getAudioTracks === 'function' &&
        existing.getAudioTracks().some((t) => t.readyState === 'live' && t.enabled)
      ) {
        return existing;
      }
      return null;
    },
    updateProcessingStream: async (stream: any) => stream,
    clearNoiseSupression: () => {},
    clearNoiseSuppression: () => {},
    muteStream: () => {},
    unmuteStream: () => {},
    startNoiseSuppresionManual: async () => false,
    stopNoiseSuppressionManual: async () => false,
    client: clientInstance,
  };
}

export interface SpeechRecognitionShim {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: ((event?: unknown) => void) | null;
  onend: ((event?: unknown) => void) | null;
  onerror: ((event?: unknown) => void) | null;
  onresult: ((event?: unknown) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
  __isPlivoShim: true;
}

/**
 * Provides a silent no-op Web Speech API stand-in so Plivo Browser SDK's
 * mute-speaking detector does not activate Chrome's webkitSpeechRecognition
 * or flood the console with "Error in Recognizing speech : no-speech".
 */
export function createSpeechRecognitionShim(): SpeechRecognitionShim {
  return {
    continuous: true,
    interimResults: true,
    lang: 'en-US',
    onstart: null,
    onend: null,
    onerror: null,
    onresult: null,
    start: () => {},
    stop: () => {},
    abort: () => {},
    __isPlivoShim: true,
  };
}

export function patchPlivoSDK(PlivoClass?: any, instance?: any) {
  if (typeof window === 'undefined') return;

  const targetClass = PlivoClass || (window as any).Plivo;
  const targets: any[] = [];

  if (targetClass?.Client?.prototype) targets.push(targetClass.Client.prototype);
  if (targetClass?.prototype) targets.push(targetClass.prototype);
  if (instance) targets.push(instance);
  if ((window as any)._PlivoInstance) targets.push((window as any)._PlivoInstance);
  if ((window as any).plivoClient) targets.push((window as any).plivoClient);

  const props = ['noiseSuppresion', 'noiseSuppression'];

  targets.forEach((target) => {
    if (!target) return;
    props.forEach((prop) => {
      try {
        const desc = Object.getOwnPropertyDescriptor(target, prop);
        if (!desc || desc.configurable) {
          Object.defineProperty(target, prop, {
            get() {
              const store = this as Record<string, any>;
              if (!store[`_${prop}_shim`]) {
                store[`_${prop}_shim`] = createNoiseSuppressionShim(this);
              }
              return store[`_${prop}_shim`];
            },
            set(val: unknown) {
              const candidate = val as { __isPlivoNoiseShim?: boolean } | null | undefined;
              const store = this as Record<string, any>;
              store[`_${prop}_shim`] = candidate?.__isPlivoNoiseShim
                ? candidate
                : createNoiseSuppressionShim(this);
            },
            configurable: true,
            enumerable: true,
          });
        } else {
          target[prop] = createNoiseSuppressionShim(target);
        }
      } catch {
        try {
          target[prop] = createNoiseSuppressionShim(target);
        } catch {}
      }
    });

    try {
      const srDesc = Object.getOwnPropertyDescriptor(target, 'speechRecognition');
      const existingSr =
        srDesc && 'value' in srDesc
          ? (srDesc.value as { abort?: () => void; __isPlivoShim?: boolean } | undefined)
          : undefined;
      if (existingSr && !existingSr.__isPlivoShim && typeof existingSr.abort === 'function') {
        try {
          existingSr.abort();
        } catch {}
      }
      if (!srDesc || srDesc.configurable) {
        Object.defineProperty(target, 'speechRecognition', {
          get() {
            const store = this as Record<string, unknown>;
            if (!store._speechRecognition_shim) {
              store._speechRecognition_shim = createSpeechRecognitionShim();
            }
            return store._speechRecognition_shim;
          },
          set(val: unknown) {
            const candidate = val as { abort?: () => void; __isPlivoShim?: boolean } | null | undefined;
            if (candidate && !candidate.__isPlivoShim && typeof candidate.abort === 'function') {
              try {
                candidate.abort();
              } catch {}
            }
            const store = this as Record<string, unknown>;
            store._speechRecognition_shim = candidate?.__isPlivoShim
              ? candidate
              : createSpeechRecognitionShim();
          },
          configurable: true,
          enumerable: true,
        });
      } else {
        target.speechRecognition = createSpeechRecognitionShim();
      }
    } catch {}
  });
}

export interface PlivoCallFailureResult {
  isUserCancel: boolean;
  nextStatus: 'ended' | 'error';
  errorMessage: string | null;
  causeText: string;
}

/**
 * Normalizes Plivo Browser SDK `onCallFailed` causes.
 * Canceling an unanswered outgoing call (`Canceled`) is a normal user hangup, and
 * remote call outcomes (`Busy`, `No Answer`, `Rejected`) should not mark a
 * registered WebPhone as `error` / unavailable for inbound calls.
 */
export function classifyPlivoCallFailure(
  cause: unknown,
  isSipLoggedIn = true
): PlivoCallFailureResult {
  const raw =
    typeof cause === 'string'
      ? cause.trim()
      : cause && typeof cause === 'object' && 'message' in cause && typeof (cause as { message?: unknown }).message === 'string'
        ? String((cause as { message: string }).message).trim()
        : '';

  const normalized = raw.toLowerCase();
  if (normalized === 'canceled' || normalized === 'cancelled' || normalized === 'originator cancel') {
    return {
      isUserCancel: true,
      nextStatus: 'ended',
      errorMessage: null,
      causeText: raw || 'Canceled',
    };
  }

  let errorMessage = raw || 'Call failed';
  if (normalized === 'busy') errorMessage = 'The recipient line is busy.';
  else if (normalized === 'no answer' || normalized === 'request timeout') errorMessage = 'No answer from recipient.';
  else if (normalized === 'rejected') errorMessage = 'Call was declined.';
  else if (normalized === 'unavailable' || normalized === 'not found') errorMessage = 'Recipient is currently unavailable.';

  return {
    isUserCancel: false,
    nextStatus: isSipLoggedIn ? 'ended' : 'error',
    errorMessage,
    causeText: raw || 'Call failed',
  };
}

/**
 * Ensures Plivo's hidden `[data-devicetype="speakerDevice"]` audio elements have
 * an explicit default `sinkId` so `audio.speakerDevices.get()` does not fail or
 * warn "No speaker element found" when `permOnClick: true` is used.
 */
export function ensureDefaultSpeakerDevice(clientInstance: {
  audio?: { speakerDevices?: { set?: (deviceId: string) => unknown } };
} | null | undefined): void {
  if (typeof document === 'undefined') return;
  try {
    const speakerEl = document.querySelector('[data-devicetype="speakerDevice"]') as
      | (HTMLMediaElement & { sinkId?: string })
      | null;
    if (speakerEl && speakerEl.sinkId) return;
    const setSpeaker = clientInstance?.audio?.speakerDevices?.set;
    if (typeof setSpeaker === 'function') {
      const result = setSpeaker('default') as { catch?: (fn: () => void) => void } | undefined;
      if (result && typeof result.catch === 'function') {
        result.catch(() => {});
      }
    }
  } catch {}
}
