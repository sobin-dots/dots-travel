// GSM 7-bit default alphabet character set regex
const GSM7_BASIC =
  "@£$¥èéùìòÇ\\nØø\\rÅåΔ_ΦΓΛΩΠΨΣΘΞ\\x1bÆæßÉ !\\\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM7_EXTENDED = "^{}\\\\[~]|€";

export interface MessageEncodingAnalysis {
  encoding: 'GSM-7' | 'UCS-2';
  charCount: number;
  units: number;
  charsPerUnit: number;
  remainingInUnit: number;
}

/**
 * Checks whether text contains exclusively GSM-7 characters.
 */
export function isGsm7String(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (!GSM7_BASIC.includes(char) && !GSM7_EXTENDED.includes(char)) {
      return false; // Found non-GSM character (e.g. emoji, Cyrillic, Hindi, smart quotes)
    }
  }
  return true;
}

/**
 * Computes exact message encoding, billing units, and character counts.
 */
export function analyzeMessageEncoding(text: string): MessageEncodingAnalysis {
  const isGsm = isGsm7String(text);
  const charCount = text.length;

  if (isGsm) {
    if (charCount <= 160) {
      return {
        encoding: 'GSM-7',
        charCount,
        units: charCount === 0 ? 0 : 1,
        charsPerUnit: 160,
        remainingInUnit: 160 - charCount,
      };
    }
    const units = Math.ceil(charCount / 153);
    const remainingInUnit = units * 153 - charCount;
    return {
      encoding: 'GSM-7',
      charCount,
      units,
      charsPerUnit: 153,
      remainingInUnit,
    };
  } else {
    // UCS-2 (Unicode)
    if (charCount <= 70) {
      return {
        encoding: 'UCS-2',
        charCount,
        units: charCount === 0 ? 0 : 1,
        charsPerUnit: 70,
        remainingInUnit: 70 - charCount,
      };
    }
    const units = Math.ceil(charCount / 67);
    const remainingInUnit = units * 67 - charCount;
    return {
      encoding: 'UCS-2',
      charCount,
      units,
      charsPerUnit: 67,
      remainingInUnit,
    };
  }
}
