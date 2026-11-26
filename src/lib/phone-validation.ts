/**
 * Comprehensive Country-Specific Phone Validation & Normalization
 * Strictly validates ITU E.164 phone formats and national significant number (NSN) lengths.
 */

export interface CountryPhoneRule {
  code: string;
  name: string;
  minLength: number;
  maxLength: number;
  pattern?: RegExp;
  example: string;
  customError?: string;
}

// Ordered by country calling code length descending (3 digits -> 2 digits -> 1 digit)
export const COUNTRY_PHONE_RULES: Record<string, CountryPhoneRule> = {
  // 3-digit country codes
  '971': {
    code: '971',
    name: 'United Arab Emirates',
    minLength: 9,
    maxLength: 9,
    pattern: /^[2-9]\d{8}$/,
    example: '+971501234567',
    customError: 'UAE phone numbers must be exactly 9 digits (e.g. +971501234567)',
  },
  '974': {
    code: '974',
    name: 'Qatar',
    minLength: 8,
    maxLength: 8,
    pattern: /^[3-7]\d{7}$/,
    example: '+97433123456',
    customError: 'Qatar phone numbers must be exactly 8 digits (e.g. +97433123456)',
  },
  '968': {
    code: '968',
    name: 'Oman',
    minLength: 8,
    maxLength: 8,
    pattern: /^[79]\d{7}$/,
    example: '+96891234567',
    customError: 'Oman phone numbers must be exactly 8 digits (e.g. +96891234567)',
  },
  '973': {
    code: '973',
    name: 'Bahrain',
    minLength: 8,
    maxLength: 8,
    pattern: /^[36]\d{7}$/,
    example: '+97336123456',
    customError: 'Bahrain phone numbers must be exactly 8 digits (e.g. +97336123456)',
  },
  '965': {
    code: '965',
    name: 'Kuwait',
    minLength: 8,
    maxLength: 8,
    pattern: /^[569]\d{7}$/,
    example: '+96591234567',
    customError: 'Kuwait phone numbers must be exactly 8 digits (e.g. +96591234567)',
  },
  '852': {
    code: '852',
    name: 'Hong Kong',
    minLength: 8,
    maxLength: 8,
    pattern: /^[4-9]\d{7}$/,
    example: '+85291234567',
    customError: 'Hong Kong phone numbers must be exactly 8 digits (e.g. +85291234567)',
  },
  '880': {
    code: '880',
    name: 'Bangladesh',
    minLength: 10,
    maxLength: 10,
    pattern: /^1[3-9]\d{8}$/,
    example: '+8801712345678',
    customError: 'Bangladesh mobile numbers must be exactly 10 digits starting with 1 (e.g. +8801712345678)',
  },
  '977': {
    code: '977',
    name: 'Nepal',
    minLength: 10,
    maxLength: 10,
    pattern: /^9\d{9}$/,
    example: '+9779812345678',
    customError: 'Nepal mobile numbers must be exactly 10 digits starting with 9 (e.g. +9779812345678)',
  },
  '358': {
    code: '358',
    name: 'Finland',
    minLength: 9,
    maxLength: 10,
    pattern: /^[45]\d{8,9}$/,
    example: '+358401234567',
  },
  '353': {
    code: '353',
    name: 'Ireland',
    minLength: 9,
    maxLength: 9,
    pattern: /^8\d{8}$/,
    example: '+353871234567',
  },

  // 2-digit country codes
  '91': {
    code: '91',
    name: 'India',
    minLength: 10,
    maxLength: 10,
    pattern: /^[6-9]\d{9}$/,
    example: '+919876543210',
    customError: 'Indian mobile numbers must be exactly 10 digits starting with 6, 7, 8, or 9 (e.g. +919876543210)',
  },
  '44': {
    code: '44',
    name: 'United Kingdom',
    minLength: 10,
    maxLength: 10,
    pattern: /^[1-9]\d{9}$/,
    example: '+447911123456',
    customError: 'UK phone numbers must be exactly 10 digits without leading 0 (e.g. +447911123456)',
  },
  '61': {
    code: '61',
    name: 'Australia',
    minLength: 9,
    maxLength: 9,
    pattern: /^[1-9]\d{8}$/,
    example: '+61412345678',
    customError: 'Australian phone numbers must be exactly 9 digits without leading 0 (e.g. +61412345678)',
  },
  '65': {
    code: '65',
    name: 'Singapore',
    minLength: 8,
    maxLength: 8,
    pattern: /^[3689]\d{7}$/,
    example: '+6581234567',
    customError: 'Singapore phone numbers must be exactly 8 digits (e.g. +6581234567)',
  },
  '60': {
    code: '60',
    name: 'Malaysia',
    minLength: 9,
    maxLength: 10,
    pattern: /^[1-9]\d{8,9}$/,
    example: '+60123456789',
    customError: 'Malaysia phone numbers must be 9 or 10 digits (e.g. +60123456789)',
  },
  '966': {
    code: '966',
    name: 'Saudi Arabia',
    minLength: 9,
    maxLength: 9,
    pattern: /^[1-9]\d{8}$/,
    example: '+966501234567',
    customError: 'Saudi Arabia phone numbers must be exactly 9 digits (e.g. +966501234567)',
  },
  '33': {
    code: '33',
    name: 'France',
    minLength: 9,
    maxLength: 9,
    pattern: /^[1-9]\d{8}$/,
    example: '+33612345678',
    customError: 'French phone numbers must be exactly 9 digits without leading 0 (e.g. +33612345678)',
  },
  '49': {
    code: '49',
    name: 'Germany',
    minLength: 10,
    maxLength: 11,
    pattern: /^[1-9]\d{9,10}$/,
    example: '+4915123456789',
    customError: 'German phone numbers must be 10 or 11 digits (e.g. +4915123456789)',
  },
  '39': {
    code: '39',
    name: 'Italy',
    minLength: 9,
    maxLength: 10,
    pattern: /^[0-9]\d{8,9}$/,
    example: '+393123456789',
    customError: 'Italian phone numbers must be 9 or 10 digits (e.g. +393123456789)',
  },
  '34': {
    code: '34',
    name: 'Spain',
    minLength: 9,
    maxLength: 9,
    pattern: /^[6-9]\d{8}$/,
    example: '+34612345678',
    customError: 'Spanish phone numbers must be exactly 9 digits (e.g. +34612345678)',
  },
  '81': {
    code: '81',
    name: 'Japan',
    minLength: 10,
    maxLength: 10,
    pattern: /^[1-9]\d{9}$/,
    example: '+819012345678',
    customError: 'Japanese phone numbers must be exactly 10 digits (e.g. +819012345678)',
  },
  '86': {
    code: '86',
    name: 'China',
    minLength: 11,
    maxLength: 11,
    pattern: /^1[3-9]\d{9}$/,
    example: '+8613800138000',
    customError: 'Chinese mobile numbers must be exactly 11 digits (e.g. +8613800138000)',
  },
  '82': {
    code: '82',
    name: 'South Korea',
    minLength: 9,
    maxLength: 10,
    pattern: /^[1-9]\d{8,9}$/,
    example: '+821012345678',
  },
  '66': {
    code: '66',
    name: 'Thailand',
    minLength: 9,
    maxLength: 9,
    pattern: /^[689]\d{8}$/,
    example: '+66812345678',
    customError: 'Thai phone numbers must be exactly 9 digits (e.g. +66812345678)',
  },
  '62': {
    code: '62',
    name: 'Indonesia',
    minLength: 9,
    maxLength: 12,
    pattern: /^8\d{8,11}$/,
    example: '+6281234567890',
  },
  '63': {
    code: '63',
    name: 'Philippines',
    minLength: 10,
    maxLength: 10,
    pattern: /^9\d{9}$/,
    example: '+639171234567',
    customError: 'Philippine mobile numbers must be exactly 10 digits (e.g. +639171234567)',
  },
  '84': {
    code: '84',
    name: 'Vietnam',
    minLength: 9,
    maxLength: 9,
    pattern: /^[35789]\d{8}$/,
    example: '+84901234567',
  },
  '94': {
    code: '94',
    name: 'Sri Lanka',
    minLength: 9,
    maxLength: 9,
    pattern: /^7\d{8}$/,
    example: '+94712345678',
    customError: 'Sri Lankan mobile numbers must be exactly 9 digits (e.g. +94712345678)',
  },
  '92': {
    code: '92',
    name: 'Pakistan',
    minLength: 10,
    maxLength: 10,
    pattern: /^3\d{9}$/,
    example: '+923001234567',
    customError: 'Pakistani mobile numbers must be exactly 10 digits (e.g. +923001234567)',
  },
  '27': {
    code: '27',
    name: 'South Africa',
    minLength: 9,
    maxLength: 9,
    pattern: /^[6-8]\d{8}$/,
    example: '+27821234567',
  },
  '55': {
    code: '55',
    name: 'Brazil',
    minLength: 10,
    maxLength: 11,
    pattern: /^[1-9]{2}[9]?\d{8}$/,
    example: '+5511987654321',
  },
  '52': {
    code: '52',
    name: 'Mexico',
    minLength: 10,
    maxLength: 10,
    pattern: /^[1-9]\d{9}$/,
    example: '+525512345678',
  },
  '64': {
    code: '64',
    name: 'New Zealand',
    minLength: 8,
    maxLength: 10,
    pattern: /^[2-9]\d{7,9}$/,
    example: '+64211234567',
  },
  '41': {
    code: '41',
    name: 'Switzerland',
    minLength: 9,
    maxLength: 9,
    pattern: /^[1-9]\d{8}$/,
    example: '+41791234567',
  },
  '31': {
    code: '31',
    name: 'Netherlands',
    minLength: 9,
    maxLength: 9,
    pattern: /^[1-9]\d{8}$/,
    example: '+31612345678',
  },
  '46': {
    code: '46',
    name: 'Sweden',
    minLength: 9,
    maxLength: 9,
    pattern: /^[1-9]\d{8}$/,
    example: '+46701234567',
  },
  '47': {
    code: '47',
    name: 'Norway',
    minLength: 8,
    maxLength: 8,
    pattern: /^[49]\d{7}$/,
    example: '+4791234567',
  },
  '45': {
    code: '45',
    name: 'Denmark',
    minLength: 8,
    maxLength: 8,
    pattern: /^[2-9]\d{7}$/,
    example: '+4520123456',
  },
  '32': {
    code: '32',
    name: 'Belgium',
    minLength: 9,
    maxLength: 9,
    pattern: /^4\d{8}$/,
    example: '+32470123456',
  },
  '43': {
    code: '43',
    name: 'Austria',
    minLength: 10,
    maxLength: 11,
    pattern: /^6\d{9,10}$/,
    example: '+436641234567',
  },
  '48': {
    code: '48',
    name: 'Poland',
    minLength: 9,
    maxLength: 9,
    pattern: /^[4-9]\d{8}$/,
    example: '+48501234567',
  },
  '90': {
    code: '90',
    name: 'Turkey',
    minLength: 10,
    maxLength: 10,
    pattern: /^5\d{9}$/,
    example: '+905321234567',
  },
  '20': {
    code: '20',
    name: 'Egypt',
    minLength: 10,
    maxLength: 10,
    pattern: /^1[0-25]\d{8}$/,
    example: '+201012345678',
  },

  // 1-digit country codes
  '1': {
    code: '1',
    name: 'USA / Canada',
    minLength: 10,
    maxLength: 10,
    pattern: /^[2-9]\d{2}[2-9]\d{6}$/,
    example: '+14155550199',
    customError: 'US/Canada phone numbers must be exactly 10 digits (e.g. +14155550199)',
  },
  '7': {
    code: '7',
    name: 'Russia / Kazakhstan',
    minLength: 10,
    maxLength: 10,
    pattern: /^[0-9]\d{9}$/,
    example: '+79123456789',
    customError: 'Russian/Kazakh phone numbers must be exactly 10 digits (e.g. +79123456789)',
  },
};

// Sorted list of country codes by length descending for greedy prefix matching
const SORTED_COUNTRY_CODES = Object.keys(COUNTRY_PHONE_RULES).sort((a, b) => b.length - a.length);

export interface PhoneValidationResult {
  valid: boolean;
  phone: string; // Cleaned E.164 string
  countryCode?: string;
  countryName?: string;
  error?: string;
}

/**
 * Normalizes and strictly validates any phone number string according to country-specific rules.
 * Accepts:
 * - Full E.164 strings (+919876543210, +14155550199)
 * - 00 prefixed international numbers (00919876543210)
 * - Domestic format numbers (10 digits in India e.g. 9876543210, 09876543210)
 */
export function normalizeAndValidatePhone(
  rawInput: string | null | undefined,
  defaultCountryCode = '91'
): PhoneValidationResult {
  if (!rawInput || typeof rawInput !== 'string') {
    return { valid: false, phone: '', error: 'Phone number is required' };
  }

  // 1. Strip all formatting noise: spaces, brackets, hyphens, periods, tabs
  let cleaned = rawInput.trim().replace(/[\s\-\(\)\.\t]/g, '');
  if (!cleaned) {
    return { valid: false, phone: '', error: 'Phone number is empty' };
  }

  // 2. Convert leading '00' to '+'
  if (cleaned.startsWith('00')) {
    cleaned = '+' + cleaned.slice(2);
  }

  // 3. Handle numbers without '+'
  if (!cleaned.startsWith('+')) {
    // If user provided a 10-digit number without code, assume defaultCountryCode (e.g. India +91)
    if (/^\d{10}$/.test(cleaned)) {
      cleaned = `+${defaultCountryCode.replace('+', '')}${cleaned}`;
    }
    // If user provided an 11-digit number starting with 0 in India, strip trunk 0
    else if (/^0\d{10}$/.test(cleaned) && defaultCountryCode.replace('+', '') === '91') {
      cleaned = `+91${cleaned.slice(1)}`;
    }
    // If user provided 11-digit number starting with 1 (US / Canada)
    else if (/^1\d{10}$/.test(cleaned)) {
      cleaned = `+${cleaned}`;
    }
    // If user provided 12-digit number starting with 91 (India)
    else if (/^91\d{10}$/.test(cleaned)) {
      cleaned = `+${cleaned}`;
    }
    // If user provided an invalid 11-digit Indian number (not starting with 0):
    // e.g. "98765432101" (11 digits)
    else if (/^\d{11}$/.test(cleaned) && defaultCountryCode.replace('+', '') === '91') {
      return {
        valid: false,
        phone: cleaned,
        countryCode: '91',
        countryName: 'India',
        error: 'Invalid Indian mobile number: must be exactly 10 digits starting with 6, 7, 8, or 9 (got 11 digits).',
      };
    } else {
      // Treat as plus-prefixed candidate for international matching
      cleaned = `+${cleaned}`;
    }
  }

  // 4. At this stage, cleaned must start with '+' and contain only digits
  if (!/^\+\d{7,15}$/.test(cleaned)) {
    return {
      valid: false,
      phone: cleaned,
      error: 'Invalid phone format: must be in international format (e.g. +919876543210) with 7 to 15 digits.',
    };
  }

  const digitsWithoutPlus = cleaned.slice(1);

  // 5. Match country calling code by longest prefix
  let matchedRule: CountryPhoneRule | null = null;
  let countryCode = '';
  let nationalNumber = '';

  for (const code of SORTED_COUNTRY_CODES) {
    if (digitsWithoutPlus.startsWith(code)) {
      matchedRule = COUNTRY_PHONE_RULES[code];
      countryCode = code;
      nationalNumber = digitsWithoutPlus.slice(code.length);
      break;
    }
  }

  // 6. Country-specific validation
  if (matchedRule) {
    // Some countries use a domestic trunk 0 which is dropped in international format
    // (e.g. UK +44 07911... -> +44 7911..., France +33 06... -> +33 6...)
    if (nationalNumber.startsWith('0') && ['44', '33', '61', '49', '39', '60'].includes(countryCode)) {
      nationalNumber = nationalNumber.slice(1);
      cleaned = `+${countryCode}${nationalNumber}`;
    }

    const len = nationalNumber.length;

    // Check exact length constraints
    if (len < matchedRule.minLength || len > matchedRule.maxLength) {
      const lengthDesc =
        matchedRule.minLength === matchedRule.maxLength
          ? `exactly ${matchedRule.minLength} digits`
          : `between ${matchedRule.minLength} and ${matchedRule.maxLength} digits`;

      const errorMsg =
        matchedRule.customError ||
        `Invalid phone number for ${matchedRule.name}: must be ${lengthDesc} (got ${len} digits). Example: ${matchedRule.example}`;

      return {
        valid: false,
        phone: cleaned,
        countryCode,
        countryName: matchedRule.name,
        error: errorMsg,
      };
    }

    // Check pattern (e.g. Indian mobile starting with 6, 7, 8, or 9)
    if (matchedRule.pattern && !matchedRule.pattern.test(nationalNumber)) {
      return {
        valid: false,
        phone: cleaned,
        countryCode,
        countryName: matchedRule.name,
        error:
          matchedRule.customError ||
          `Invalid phone number format for ${matchedRule.name}. Expected format: ${matchedRule.example}`,
      };
    }

    return {
      valid: true,
      phone: cleaned,
      countryCode,
      countryName: matchedRule.name,
    };
  }

  // 7. General ITU-T E.164 fallback for countries not in our curated table:
  // Must be between 7 and 15 total digits, and national number between 6 and 12 digits.
  const generalNational = digitsWithoutPlus.slice(3); // approximate
  if (digitsWithoutPlus.length < 8 || digitsWithoutPlus.length > 15 || generalNational.length < 5) {
    return {
      valid: false,
      phone: cleaned,
      error: 'Invalid international phone number: length does not conform to ITU-T E.164 standards.',
    };
  }

  return {
    valid: true,
    phone: cleaned,
  };
}

/**
 * Quick boolean checker for schemas
 */
export function isValidInternationalPhone(phone: string): boolean {
  return normalizeAndValidatePhone(phone).valid;
}
