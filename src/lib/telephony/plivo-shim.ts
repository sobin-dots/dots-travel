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
      return await getLiveMicrophoneStream();
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
              if (!this[`_${prop}_shim`]) {
                this[`_${prop}_shim`] = createNoiseSuppressionShim(this);
              }
              return this[`_${prop}_shim`];
            },
            set(val) {
              this[`_${prop}_shim`] = val;
            },
            configurable: true,
            enumerable: true,
          });
        }
      } catch {
        try {
          target[prop] = createNoiseSuppressionShim(target);
        } catch {}
      }
    });
  });
}
