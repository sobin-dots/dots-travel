import { afterEach, describe, expect, it, vi } from 'vitest';
import { createNoiseSuppressionShim, createSpeechRecognitionShim, patchPlivoSDK } from '@/lib/telephony/plivo-shim';

import { classifyPlivoCallFailure, ensureDefaultSpeakerDevice } from '@/lib/telephony/plivo-shim';

describe('Plivo Browser SDK shim helpers', () => {
  it('treats user-initiated outgoing Canceled hangups as clean ended calls with no error', () => {
    expect(classifyPlivoCallFailure('Canceled', true)).toEqual({
      isUserCancel: true,
      nextStatus: 'ended',
      errorMessage: null,
      causeText: 'Canceled',
    });
    expect(classifyPlivoCallFailure({ message: 'Cancelled' }, false)).toEqual({
      isUserCancel: true,
      nextStatus: 'ended',
      errorMessage: null,
      causeText: 'Cancelled',
    });
  });

  it('keeps a registered WebPhone ready (ended, not error) on normal remote call failures', () => {
    expect(classifyPlivoCallFailure('Busy', true)).toEqual({
      isUserCancel: false,
      nextStatus: 'ended',
      errorMessage: 'The recipient line is busy.',
      causeText: 'Busy',
    });
    expect(classifyPlivoCallFailure('No Answer', true)).toEqual({
      isUserCancel: false,
      nextStatus: 'ended',
      errorMessage: 'No answer from recipient.',
      causeText: 'No Answer',
    });
    expect(classifyPlivoCallFailure('Rejected', true)).toEqual({
      isUserCancel: false,
      nextStatus: 'ended',
      errorMessage: 'Call was declined.',
      causeText: 'Rejected',
    });
  });

  it('transitions to error status when SIP registration is lost on failure', () => {
    expect(classifyPlivoCallFailure('Connection Error', false)).toEqual({
      isUserCancel: false,
      nextStatus: 'error',
      errorMessage: 'Connection Error',
      causeText: 'Connection Error',
    });
  });

  it('sets default speaker device safely when audio element sinkId is empty', () => {
    const set = vi.fn().mockResolvedValue(true);
    const originalDoc = globalThis.document;
    try {
      (globalThis as { document?: unknown }).document = {
        querySelector: vi.fn().mockReturnValue({ sinkId: '' }),
      };
      ensureDefaultSpeakerDevice({ audio: { speakerDevices: { set } } });
      expect(set).toHaveBeenCalledWith('default');

      set.mockClear();
      (globalThis as { document?: unknown }).document = {
        querySelector: vi.fn().mockReturnValue({ sinkId: 'default' }),
      };
      ensureDefaultSpeakerDevice({ audio: { speakerDevices: { set } } });
      expect(set).not.toHaveBeenCalled();
    } finally {
      (globalThis as { document?: unknown }).document = originalDoc;
    }
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
