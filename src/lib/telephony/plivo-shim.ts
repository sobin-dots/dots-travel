/**
 * Plivo Browser SDK v2 Compatibility Shim
 * 
 * In Plivo Browser SDK (v2.x), Plivo's internal `answerIncomingCall()` and `makeCall()`
 * invoke `this.noiseSuppresion.startNoiseSuppression(...)` unconditionally.
 * If noise reduction hasn't initialized yet, or on re-login/permOnClick states,
 * `this.noiseSuppresion` is undefined, throwing:
 * "TypeError: Cannot read properties of undefined (reading 'startNoiseSuppression')".
 * 
 * This utility safely shims `noiseSuppresion` and `noiseSuppression` on Plivo prototype
 * and client instances so calls connect seamlessly without crashes.
 */

export function createNoiseSuppressionShim(clientInstance?: any) {
  return {
    noiseSupressionRunning: false,
    started: false,
    startNoiseSuppression: async (stream?: any) => {
      const activeStream =
        stream || (typeof window !== 'undefined' ? (window as any).localStream : null);
      if (typeof window !== 'undefined' && activeStream) {
        (window as any).localStream = activeStream;
      }
      return activeStream;
    },
    stopNoiseSuppresion: () => {},
    stopNoiseSuppression: () => {},
    setLocalMediaStream: async () => {
      if (typeof window !== 'undefined' && (window as any).localStream) {
        return (window as any).localStream;
      }
      if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
        try {
          const s = await navigator.mediaDevices.getUserMedia({ audio: true });
          if (typeof window !== 'undefined') (window as any).localStream = s;
          return s;
        } catch {
          return null;
        }
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
