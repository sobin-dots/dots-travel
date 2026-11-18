import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSpeechRecognitionShim, patchPlivoSDK } from '@/lib/telephony/plivo-shim';

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
});
