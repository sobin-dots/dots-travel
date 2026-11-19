import { describe, expect, it, vi } from 'vitest';
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
});
