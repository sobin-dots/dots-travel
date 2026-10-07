import { describe, it, expect } from 'vitest';
import { analyzeMessageEncoding, isGsm7String } from '../src/lib/telephony/messaging/encoder';

describe('Message Encoding & Cost Unit Calculation', () => {
  it('correctly identifies GSM-7 text within 160 characters as 1 unit', () => {
    const text = 'Hello world! This is a standard GSM-7 message with 0123456789.';
    const analysis = analyzeMessageEncoding(text);

    expect(isGsm7String(text)).toBe(true);
    expect(analysis.encoding).toBe('GSM-7');
    expect(analysis.units).toBe(1);
    expect(analysis.charsPerUnit).toBe(160);
  });

  it('correctly calculates concatenated GSM-7 text at 153 chars per unit', () => {
    const text = 'a'.repeat(161);
    const analysis = analyzeMessageEncoding(text);

    expect(analysis.encoding).toBe('GSM-7');
    expect(analysis.units).toBe(2);
    expect(analysis.charsPerUnit).toBe(153);
    expect(analysis.remainingInUnit).toBe(2 * 153 - 161);
  });

  it('identifies non-GSM character (emoji) and drops into UCS-2 with 70 chars per unit', () => {
    const text = 'Hello with an emoji 🚀';
    const analysis = analyzeMessageEncoding(text);

    expect(isGsm7String(text)).toBe(false);
    expect(analysis.encoding).toBe('UCS-2');
    expect(analysis.units).toBe(1);
    expect(analysis.charsPerUnit).toBe(70);
  });

  it('correctly calculates concatenated UCS-2 text at 67 chars per unit', () => {
    // 71 characters with an emoji
    const text = '🎉' + 'b'.repeat(70);
    const analysis = analyzeMessageEncoding(text);

    expect(analysis.encoding).toBe('UCS-2');
    expect(analysis.units).toBe(2);
    expect(analysis.charsPerUnit).toBe(67);
  });
});
