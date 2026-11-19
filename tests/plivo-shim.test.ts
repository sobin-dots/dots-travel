import { afterEach, describe, expect, it, vi } from 'vitest';
import { createNoiseSuppressionShim, createSpeechRecognitionShim, patchPlivoSDK } from '@/lib/telephony/plivo-shim';

describe('Plivo Browser SDK compatibility shim', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('replaces Plivo speechRecognition on prototype and instances with a silent no-op shim', () => {
    const abortReal = vi.fn();
    const startReal = vi.fn();
    const realSr = { abort: abortReal, start: startReal, stop: vi.fn() };

    class FakeClient {
      speechRecognition: unknown;
      constructor() {
        this.speechRecognition = realSr;
      }
    }
    const FakePlivo = { Client: FakeClient };

    vi.stubGlobal('window', { Plivo: FakePlivo });

    // Pre-patch prototype before instantiation (matches layout.tsx / initWebPhone)
    patchPlivoSDK(FakePlivo);
    const client = new FakeClient() as FakeClient & { speechRecognition: ReturnType<typeof createSpeechRecognitionShim> };

    expect(abortReal).toHaveBeenCalledTimes(1);
    expect(client.speechRecognition.__isPlivoShim).toBe(true);

    // Simulates Plivo's speechListeners() assigning handlers and calling stop()/start() on mute
    const onError = vi.fn();
    client.speechRecognition.stop();
    client.speechRecognition.continuous = true;
    client.speechRecognition.interimResults = true;
    client.speechRecognition.onerror = onError;
    client.speechRecognition.start();

    expect(startReal).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it('aborts and replaces an existing real speechRecognition on an already-created client instance', () => {
    const abortExisting = vi.fn();
    const existingInstance = {
      speechRecognition: { abort: abortExisting, start: vi.fn(), stop: vi.fn() },
    };

    vi.stubGlobal('window', {});
    patchPlivoSDK(undefined, existingInstance);

    expect(abortExisting).toHaveBeenCalledTimes(1);
    expect((existingInstance.speechRecognition as { __isPlivoShim?: boolean }).__isPlivoShim).toBe(true);

    // Re-patching the same instance stays idempotent
    patchPlivoSDK(undefined, existingInstance);
    expect((existingInstance.speechRecognition as { __isPlivoShim?: boolean }).__isPlivoShim).toBe(true);
  });

  it('prevents Plivo onLogin from overwriting noiseSuppresion and never blocks onIncomingCall on getUserMedia', async () => {
    const getUserMedia = vi.fn();
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });

    class FakeClient {
      noiseSuppresion: unknown;
      noiseSuppression: unknown;
      simulateLogin() {
        // Mirrors plivo.min.js onLogin handler: this.cs.noiseSuppresion = new v.NoiseSuppression(this.cs)
        this.noiseSuppresion = {
          setLocalMediaStream: () => Promise.reject(new Error('native NoiseSuppression called getUserMedia')),
        };
      }
    }
    const FakePlivo = { Client: FakeClient };
    const win: Record<string, any> = { Plivo: FakePlivo };
    vi.stubGlobal('window', win);

    patchPlivoSDK(FakePlivo);
    const client = new FakeClient() as FakeClient & {
      noiseSuppresion: ReturnType<typeof createNoiseSuppressionShim>;
    };
    client.simulateLogin();

    expect((client.noiseSuppresion as { __isPlivoNoiseShim?: boolean }).__isPlivoNoiseShim).toBe(true);

    // Incoming SIP INVITE calls setLocalMediaStream() before emitting onIncomingCall:
    // with window.localStream absent, it must resolve null immediately without invoking getUserMedia.
    const incomingStream = await client.noiseSuppresion.setLocalMediaStream();
    expect(incomingStream).toBeNull();
    expect(getUserMedia).not.toHaveBeenCalled();

    // When answering/calling inside a user gesture, startNoiseSuppression requests a live mic stream.
    const mockTrack = { readyState: 'live', enabled: true };
    const liveStream = { getAudioTracks: () => [mockTrack] };
    getUserMedia.mockResolvedValueOnce(liveStream);

    const answerStream = await client.noiseSuppresion.startNoiseSuppression(null);
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(answerStream).toBe(liveStream);
    expect(win.localStream).toBe(liveStream);

    // Subsequent incoming call with an active live stream returns it without re-prompting getUserMedia.
    expect(await client.noiseSuppresion.setLocalMediaStream()).toBe(liveStream);
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });
});
