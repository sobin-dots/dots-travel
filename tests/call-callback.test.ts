import { describe, expect, it } from 'vitest';
import {
  getCallbackPhone,
  isMissedOrUnansweredCall,
  normalizeDialablePhone,
  resolveCallbackDestination,
} from '@/lib/telephony/call-callback';

describe('Missed call callback helpers', () => {
  it('normalizes dialable PSTN numbers and rejects SIP/unknown values', () => {
    expect(normalizeDialablePhone('+91 98765-43210')).toBe('+919876543210');
    expect(normalizeDialablePhone('919876543210')).toBe('+919876543210');
    expect(normalizeDialablePhone('00919876543210')).toBe('+919876543210');
    expect(normalizeDialablePhone('sip:agent@phone.plivo.com')).toBe('');
    expect(normalizeDialablePhone('Unknown')).toBe('');
  });

  it('extracts caller phone for inbound missed calls and recipient phone for failed outbound calls', () => {
    expect(
      getCallbackPhone({ direction: 'inbound', from: '919876543210', to: '+918065493333' })
    ).toBe('+919876543210');
    expect(
      getCallbackPhone({ direction: 'outbound', from: '+918065493333', to: '+91 98765 00001' })
    ).toBe('+919876500001');
  });

  it('flags missed, failed, no-answer, busy, canceled, and unanswered inbound calls', () => {
    expect(isMissedOrUnansweredCall({ direction: 'inbound', status: 'missed', agentOutcome: 'missed' })).toBe(true);
    expect(isMissedOrUnansweredCall({ direction: 'inbound', status: 'ringing', agentOutcome: 'declined' })).toBe(true);
    expect(isMissedOrUnansweredCall({ direction: 'outbound', status: 'no-answer', agentOutcome: null })).toBe(true);
    expect(isMissedOrUnansweredCall({ direction: 'inbound', status: 'completed', agentOutcome: 'answered' })).toBe(false);
    expect(isMissedOrUnansweredCall({ direction: 'inbound', status: 'in-progress', agentOutcome: 'ringing' })).toBe(false);
  });

  it('matches existing contacts regardless of formatting and keeps unsaved missed caller numbers intact', () => {
    const contacts = [{ phone: '+91 (98765) 43210' }, { phone: '+447700900123' }];
    expect(resolveCallbackDestination('919876543210', contacts)).toBe('+91 (98765) 43210');
    expect(resolveCallbackDestination('+919999988888', contacts)).toBe('+919999988888');
    expect(resolveCallbackDestination('+919999988888', [])).toBe('+919999988888');
  });
});
