/**
 * CSV Parser and Contact Normalizer
 * RFC 4180 compliant parsing supporting quotes, escaped quotes, newlines inside cells,
 * flexible header matching, and E.164 phone normalization.
 */

export interface ParsedContactRow {
  rowIndex: number;
  rawName: string;
  rawPhone: string;
  rawEmail: string;
  rawCompany: string;
  rawNotes: string;
  name: string;
  phone: string; // Normalized E.164
  email?: string;
  company?: string;
  notes?: string;
  isValid: boolean;
  error?: string;
}

export interface CSVParseResult {
  rows: ParsedContactRow[];
  totalRows: number;
  validRows: ParsedContactRow[];
  invalidRows: ParsedContactRow[];
  headers: string[];
}

/**
 * Normalizes a phone string into E.164 format (+[countryCode][digits]).
 * Supports India local 10-digit numbers (+91 default), 0-prefixed 11-digit numbers,
 * 91-prefixed 12-digit numbers, and general E.164 international numbers.
 */
export function normalizePhoneNumber(raw: string, defaultCountryCode = '+91'): string | null {
  if (!raw) return null;

  // Clean spaces, hyphens, dots, parentheses, and tabs
  let cleaned = raw.trim().replace(/[\s\-\(\)\.\t]/g, '');
  if (!cleaned) return null;

  // Replace international access code 00 with +
  if (cleaned.startsWith('00')) {
    cleaned = '+' + cleaned.slice(2);
  }

  // If already starts with +
  if (cleaned.startsWith('+')) {
    const digits = cleaned.slice(1);
    if (/^[1-9]\d{6,14}$/.test(digits)) {
      return cleaned;
    }
    return null;
  }

  // 10 digits without + (e.g. 9876543210)
  if (/^\d{10}$/.test(cleaned)) {
    const prefix = defaultCountryCode.startsWith('+') ? defaultCountryCode : `+${defaultCountryCode}`;
    return `${prefix}${cleaned}`;
  }

  // 11 digits starting with 0 (e.g. 09876543210)
  if (/^0\d{10}$/.test(cleaned)) {
    const prefix = defaultCountryCode.startsWith('+') ? defaultCountryCode : `+${defaultCountryCode}`;
    return `${prefix}${cleaned.slice(1)}`;
  }

  // 12 digits starting with 91 (e.g. 919876543210)
  if (/^91\d{10}$/.test(cleaned)) {
    return `+${cleaned}`;
  }

  // 11 digits starting with 1 (US / Canada without +, e.g. 14155550199)
  if (/^1\d{10}$/.test(cleaned)) {
    return `+${cleaned}`;
  }

  // Fallback: If 7 to 15 digits without +, test prefixing default country code
  if (/^\d{7,14}$/.test(cleaned)) {
    const prefix = defaultCountryCode.startsWith('+') ? defaultCountryCode : `+${defaultCountryCode}`;
    const candidate = `${prefix}${cleaned}`;
    if (/^\+[1-9]\d{6,14}$/.test(candidate)) {
      return candidate;
    }
  }

  return null;
}

/**
 * Parses raw CSV text into a 2D array of string cells according to RFC 4180.
 * Handles quoted fields with commas, newlines, and escaped quotes ("").
 */
export function parseCSVText(csvContent: string): string[][] {
  if (!csvContent) return [];

  // Remove UTF-8 Byte Order Mark (BOM) if present
  let text = csvContent.replace(/^\uFEFF/, '');

  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let insideQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        // Escaped double quote
        currentCell += '"';
        i++; // skip escaped quote
      } else {
        // Toggle quote state
        insideQuotes = !insideQuotes;
      }
    } else if (char === ',' && !insideQuotes) {
      // Cell delimiter
      currentRow.push(currentCell.trim());
      currentCell = '';
    } else if ((char === '\r' || char === '\n') && !insideQuotes) {
      // Line delimiter
      if (char === '\r' && nextChar === '\n') {
        i++; // skip \n of \r\n
      }
      currentRow.push(currentCell.trim());
      currentCell = '';
      // Only push non-empty rows
      if (currentRow.some((cell) => cell.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
    } else {
      currentCell += char;
    }
  }

  // Push final cell and row
  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.some((cell) => cell.length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

/**
 * Finds column index by evaluating aliases case-insensitively.
 */
function findColumnIndex(headers: string[], aliases: string[]): number {
  const normalizedHeaders = headers.map((h) => h.toLowerCase().trim().replace(/[^a-z0-9]/g, ''));
  for (const alias of aliases) {
    const normAlias = alias.toLowerCase().replace(/[^a-z0-9]/g, '');
    const idx = normalizedHeaders.findIndex((h) => h === normAlias || h.includes(normAlias));
    if (idx !== -1) return idx;
  }
  return -1;
}

/**
 * Maps parsed CSV rows into typed and validated Contact rows.
 */
export function parseContactsCSV(csvText: string, defaultCountryCode = '+91'): CSVParseResult {
  const matrix = parseCSVText(csvText);

  if (matrix.length === 0) {
    return { rows: [], totalRows: 0, validRows: [], invalidRows: [], headers: [] };
  }

  const rawHeaders = matrix[0];
  const dataRows = matrix.slice(1);

  // Identify column indices using flexible aliases
  const phoneIdx = findColumnIndex(rawHeaders, [
    'phone',
    'phonenumber',
    'mobile',
    'mobilenumber',
    'cell',
    'contactnumber',
    'tel',
    'telephone',
  ]);

  const nameIdx = findColumnIndex(rawHeaders, [
    'fullname',
    'contactname',
    'customername',
    'clientname',
    'leadname',
    'person',
    'name',
  ]);

  const emailIdx = findColumnIndex(rawHeaders, ['email', 'emailaddress', 'mail']);
  const companyIdx = findColumnIndex(rawHeaders, ['company', 'organization', 'agency', 'business', 'corp']);
  const notesIdx = findColumnIndex(rawHeaders, ['notes', 'remarks', 'comment', 'comments', 'description']);

  const rows: ParsedContactRow[] = [];

  dataRows.forEach((row, index) => {
    // If entire row is blank, skip it
    if (!row.some((cell) => cell && cell.trim().length > 0)) {
      return;
    }

    const rawName = nameIdx !== -1 && row[nameIdx] ? row[nameIdx].trim() : '';
    const rawPhone = phoneIdx !== -1 && row[phoneIdx] ? row[phoneIdx].trim() : '';
    const rawEmail = emailIdx !== -1 && row[emailIdx] ? row[emailIdx].trim() : '';
    const rawCompany = companyIdx !== -1 && row[companyIdx] ? row[companyIdx].trim() : '';
    const rawNotes = notesIdx !== -1 && row[notesIdx] ? row[notesIdx].trim() : '';

    const normalizedPhone = normalizePhoneNumber(rawPhone, defaultCountryCode);

    let isValid = true;
    let error: string | undefined = undefined;

    if (!rawName || rawName.length < 2) {
      isValid = false;
      error = 'Name must be at least 2 characters';
    } else if (!rawPhone) {
      isValid = false;
      error = 'Phone number is required';
    } else if (!normalizedPhone) {
      isValid = false;
      error = `Invalid phone number format: "${rawPhone}"`;
    } else if (rawEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
      isValid = false;
      error = `Invalid email address: "${rawEmail}"`;
    }

    rows.push({
      rowIndex: index + 2, // 1-indexed including header row
      rawName,
      rawPhone,
      rawEmail,
      rawCompany,
      rawNotes,
      name: rawName,
      phone: normalizedPhone || rawPhone,
      email: rawEmail || undefined,
      company: rawCompany || undefined,
      notes: rawNotes || undefined,
      isValid,
      error,
    });
  });

  const validRows = rows.filter((r) => r.isValid);
  const invalidRows = rows.filter((r) => !r.isValid);

  return {
    rows,
    totalRows: rows.length,
    validRows,
    invalidRows,
    headers: rawHeaders,
  };
}

/**
 * Returns a downloadable sample CSV content template.
 */
export function getSampleContactsCSV(): string {
  return [
    'Name,Phone,Email,Company,Notes',
    'Aarav Sharma,+919876543210,aarav.sharma@example.com,Sharma Tours,VIP Customer - Enquired for Maldives package',
    'Priya Patel,9823456789,priya.patel@outlook.com,Patel & Co,Interested in Singapore & Malaysia 5-day tour',
    'Vikram Malhotra,+919123456780,,Malhotra Enterprises,Family holiday enquiry for Pongal vacation',
    'Sneha Menon,09447123456,sneha.menon@gmail.com,,Wants 4-star boutique hotel quotes',
  ].join('\r\n');
}

