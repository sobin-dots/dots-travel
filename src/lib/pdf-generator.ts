import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import fs from 'node:fs';
import path from 'node:path';
import { assertItineraryReady, parseItineraryDays, declaredItineraryDuration } from './itinerary-content';

export interface PDFHeaderThemeOptions {
  organizationName?: string;
  organizationAddress?: string;
  organizationPhone?: string;
  organizationWebsite?: string;
  organizationLogo?: string;
  organizationLetterhead?: string;
  organizationLetterheadText?: string;
  brandColor?: string;
}

export interface PDFOptions extends PDFHeaderThemeOptions {
  title: string;
  recipientName: string;
  recipientEmail?: string;
  recipientType: 'customer' | 'supplier';
  itineraryText: string;
  destination?: string;
  duration?: string;
  durationDays?: number;
  travelDates?: string;
  departureDate?: string | Date | null;
  returnDate?: string | Date | null;
  headcountAdults?: number;
  headcountChildren?: number;
  hotelTier?: string;
  mealPlan?: string;
  specialRequests?: string;
  targetBudget?: string | number | null;
  currency?: string;
  consultantName?: string;
  consultantPhone?: string;
  consultantEmail?: string;
  consultantRole?: string;
  bookingReference?: string;
  preparedDate?: string | Date;
  validUntilDate?: string | Date;
  companyCin?: string;
  companyGstin?: string;
  companyPan?: string;
}

export function hexToRgb(hex?: string | null): { r: number; g: number; b: number } {
  if (!hex || typeof hex !== 'string') {
    return { r: 0.929, g: 0.106, b: 0.141 }; // Default #ed1b24 (LGT Holidays brand red)
  }
  let clean = hex.trim().replace(/^#/, '');
  if (clean.length === 3) {
    clean = clean.split('').map((c) => c + c).join('');
  }
  if (clean.length !== 6) {
    return { r: 0.929, g: 0.106, b: 0.141 };
  }
  const r = parseInt(clean.substring(0, 2), 16) / 255;
  const g = parseInt(clean.substring(2, 4), 16) / 255;
  const b = parseInt(clean.substring(4, 6), 16) / 255;
  if (isNaN(r) || isNaN(g) || isNaN(b)) {
    return { r: 0.929, g: 0.106, b: 0.141 };
  }
  return { r, g, b };
}

function sanitizePdfText(text: string): string {
  if (!text) return '';
  return text
    .replace(/\*\*/g, '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2014/g, ' - ')
    .replace(/\u2013/g, '-')
    .replace(/\u2026/g, '...')
    .trim();
}

export function wrapText(text: string, maxWidth: number, font: any, fontSize: number): string[] {
  if (!text) return [];
  const paragraphs = text.split(/\r?\n/);
  const allLines: string[] = [];

  for (const rawPara of paragraphs) {
    const clean = sanitizePdfText(rawPara);
    if (!clean) continue;

    const words = clean.split(/\s+/);
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      let width = 0;
      try {
        width = font.widthOfTextAtSize(testLine.replace(/₹/g, 'Rs'), fontSize);
      } catch {
        width = testLine.length * (fontSize * 0.55);
      }
      if (width > maxWidth && currentLine) {
        allLines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) allLines.push(currentLine);
  }

  return allLines.length > 0 ? allLines : [sanitizePdfText(text)];
}

async function tryEmbedImage(pdfDoc: PDFDocument, imageInput?: string | null): Promise<any | null> {
  if (!imageInput || typeof imageInput !== 'string') return null;
  const trimmed = imageInput.trim();
  if (!trimmed) return null;

  try {
    let bytes: Uint8Array | null = null;
    if (trimmed.startsWith('data:image/')) {
      const parts = trimmed.split(',');
      if (parts[1]) {
        bytes = Uint8Array.from(Buffer.from(parts[1], 'base64'));
      }
    } else if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      const res = await fetch(trimmed, { signal: AbortSignal.timeout(4000) });
      if (res.ok) {
        const buf = await res.arrayBuffer();
        bytes = new Uint8Array(buf);
      }
    }

    if (!bytes || bytes.length === 0) return null;

    const isPng = bytes[0] === 0x89 && bytes[1] === 0x50;
    const isJpg = bytes[0] === 0xff && bytes[1] === 0xd8;

    if (isPng) {
      return await pdfDoc.embedPng(bytes);
    }
    if (isJpg) {
      return await pdfDoc.embedJpg(bytes);
    }

    try {
      return await pdfDoc.embedPng(bytes);
    } catch {
      return await pdfDoc.embedJpg(bytes);
    }
  } catch (err) {
    console.warn('[PDF] Image embedding skipped:', err);
    return null;
  }
}

async function getGeistFont(pdfDoc: PDFDocument) {
  try {
    pdfDoc.registerFontkit(fontkit);
    const bytes = fs.readFileSync(path.join(process.cwd(), 'public', 'fonts', 'Geist-Regular.ttf'));
    return await pdfDoc.embedFont(bytes);
  } catch (e) {
    console.warn('[PDF] Geist font embedding warning:', e);
  }
  return null;
}

function drawSafeText(
  page: any,
  text: string,
  options: {
    x: number;
    y: number;
    size: number;
    fontRegular: any;
    fontBold: any;
    fontGeist: any;
    color: any;
    isBold?: boolean;
  }
) {
  const { x, y, size, fontRegular, fontBold, fontGeist, color, isBold } = options;
  const cleaned = sanitizePdfText(text);
  if (!cleaned) return;

  if (cleaned.includes('₹') && fontGeist) {
    page.drawText(cleaned, { x, y, size, font: fontGeist, color });
  } else {
    const safeText = fontGeist ? cleaned : cleaned.replace(/₹/g, 'INR ');
    try {
      page.drawText(safeText, { x, y, size, font: isBold ? fontBold : fontRegular, color });
    } catch {
      const asciiSafe = safeText.replace(/[^\x20-\x7E]/g, '');
      page.drawText(asciiSafe, { x, y, size, font: isBold ? fontBold : fontRegular, color });
    }
  }
}

/**
 * Shared PDF Header & Theme Renderer matching the exact "Real-Time Itinerary PDF Header & Theme Preview"
 * configured in `/console/settings` -> `Organization & Letterhead`.
 * Renders:
 * 1. Optional Letterhead Header Banner (`organizationLetterhead`) across the top of the page.
 * 2. Left: Organization Logo (`organizationLogo`) or Brand-colored Initials Badge + Organization Name +
 *    Contact Info (`Tel • Address • Website`) + Regulatory Tagline (`organizationLetterheadText`).
 * 3. Right: Brand-colored Document Badge (`badgeText`) + Date / Page subtitle (`subRightText`).
 * 4. Full-width Brand Accent Bar (`brandColor`) below the header.
 * Returns the safe Y coordinate below the header bar where page content begins without overlap.
 */
function drawSettingsConfiguredHeader(params: {
  page: any;
  pageWidth: number;
  pageHeight: number;
  margin: number;
  options: PDFHeaderThemeOptions;
  logoImg: any | null;
  letterheadImg: any | null;
  fontRegular: any;
  fontBold: any;
  fontGeist: any;
  badgeText: string;
  subRightText?: string;
}): number {
  const {
    page,
    pageWidth,
    pageHeight,
    margin,
    options,
    logoImg,
    letterheadImg,
    fontRegular,
    fontBold,
    fontGeist,
    badgeText,
    subRightText,
  } = params;

  const contentWidth = pageWidth - margin * 2;
  const brand = hexToRgb(options.brandColor);
  const brandColor = rgb(brand.r, brand.g, brand.b);
  const brandLightBg = rgb(
    Math.min(1, brand.r * 0.12 + 0.88),
    Math.min(1, brand.g * 0.12 + 0.88),
    Math.min(1, brand.b * 0.12 + 0.88)
  );
  const charcoal = rgb(0.118, 0.125, 0.133);
  const muted = rgb(0.36, 0.38, 0.41);
  const white = rgb(1, 1, 1);

  let y = pageHeight - 32;

  // 1. Optional Letterhead Banner across top
  if (letterheadImg) {
    const rawRatio = letterheadImg.height / Math.max(1, letterheadImg.width);
    const bannerHeight = Math.min(46, Math.max(28, contentWidth * rawRatio));
    page.drawImage(letterheadImg, {
      x: margin,
      y: y - bannerHeight + 8,
      width: contentWidth,
      height: bannerHeight,
    });
    y -= bannerHeight + 8;
  }

  // 2. Left side: Logo or Brand Initials Badge
  const orgName = options.organizationName || '';
  const logoBoxSize = 32;
  const logoTopY = y;

  if (logoImg) {
    page.drawImage(logoImg, {
      x: margin,
      y: logoTopY - logoBoxSize + 6,
      width: logoBoxSize,
      height: logoBoxSize,
    });
  } else {
    page.drawRectangle({
      x: margin,
      y: logoTopY - logoBoxSize + 6,
      width: logoBoxSize,
      height: logoBoxSize,
      color: brandColor,
    });
    const initials = (orgName.replace(/[^A-Za-z0-9]/g, '') || 'LG').slice(0, 2).toUpperCase();
    const initW = fontBold.widthOfTextAtSize(initials, 12);
    drawSafeText(page, initials, {
      x: margin + (logoBoxSize - initW) / 2,
      y: logoTopY - 14,
      size: 12,
      fontRegular,
      fontBold,
      fontGeist,
      color: white,
      isBold: true,
    });
  }

  // 3. Right side: Brand-colored Tag Pill + Subtitle
  const cleanBadge = sanitizePdfText(badgeText).toUpperCase();
  const badgeFontSize = 7.5;
  const badgeTextW = fontBold.widthOfTextAtSize(cleanBadge, badgeFontSize);
  const badgePadX = 8;
  const badgeW = badgeTextW + badgePadX * 2;
  const badgeH = 15;
  const badgeX = pageWidth - margin - badgeW;
  const badgeY = logoTopY - 7;

  page.drawRectangle({
    x: badgeX,
    y: badgeY,
    width: badgeW,
    height: badgeH,
    color: brandLightBg,
    borderColor: brandColor,
    borderWidth: 0.8,
  });

  drawSafeText(page, cleanBadge, {
    x: badgeX + badgePadX,
    y: badgeY + 4.5,
    size: badgeFontSize,
    fontRegular,
    fontBold,
    fontGeist,
    color: brandColor,
    isBold: true,
  });

  if (subRightText) {
    const cleanSub = sanitizePdfText(subRightText);
    const subW = fontRegular.widthOfTextAtSize(cleanSub, 7.5);
    drawSafeText(page, cleanSub, {
      x: pageWidth - margin - subW,
      y: badgeY - 11,
      size: 7.5,
      fontRegular,
      fontBold,
      fontGeist,
      color: muted,
    });
  }

  // 4. Organization Name, Contact Info & Letterhead Tagline next to Logo
  const textStartX = margin + logoBoxSize + 10;
  const maxHeaderTextWidth = Math.max(180, badgeX - textStartX - 12);

  drawSafeText(page, orgName.slice(0, 60), {
    x: textStartX,
    y: logoTopY - 4,
    size: 10.5,
    fontRegular,
    fontBold,
    fontGeist,
    color: charcoal,
    isBold: true,
  });

  let textCursorY = logoTopY - 15;

  const contactParts = [
    options.organizationPhone ? `Tel: ${options.organizationPhone}` : null,
    options.organizationAddress ? options.organizationAddress.replace(/\r?\n/g, ', ') : null,
    options.organizationWebsite ? options.organizationWebsite : null,
  ].filter(Boolean);

  if (contactParts.length > 0) {
    const contactStr = contactParts.join('  •  ');
    const contactLines = wrapText(contactStr, maxHeaderTextWidth, fontRegular, 7.2).slice(0, 2);
    for (const cLine of contactLines) {
      drawSafeText(page, cLine, {
        x: textStartX,
        y: textCursorY,
        size: 7.2,
        fontRegular,
        fontBold,
        fontGeist,
        color: muted,
      });
      textCursorY -= 9.5;
    }
  } else {
    textCursorY -= 4;
  }

  if (options.organizationLetterheadText) {
    const tagLines = wrapText(options.organizationLetterheadText, maxHeaderTextWidth, fontRegular, 7).slice(0, 1);
    for (const tLine of tagLines) {
      drawSafeText(page, tLine, {
        x: textStartX,
        y: textCursorY,
        size: 7,
        fontRegular,
        fontBold,
        fontGeist,
        color: muted,
      });
      textCursorY -= 9;
    }
  }

  // 5. Full-Width Brand Accent Bar
  const barY = Math.min(logoTopY - logoBoxSize - 2, textCursorY - 3);
  page.drawRectangle({
    x: margin,
    y: barY,
    width: contentWidth,
    height: 2.5,
    color: brandColor,
  });

  return barY - 22;
}

/**
 * Shared Bottom Footer with Brand Accent
 */
function drawSettingsConfiguredFooter(params: {
  page: any;
  pageWidth: number;
  margin: number;
  footerLeftText: string;
  pageNum: number;
  totalPages?: number;
  fontRegular: any;
  fontBold: any;
  fontGeist: any;
  brandColor: any;
  muted: any;
}) {
  const {
    page,
    pageWidth,
    margin,
    footerLeftText,
    pageNum,
    fontRegular,
    fontBold,
    fontGeist,
    brandColor,
    muted,
  } = params;

  drawSafeText(page, footerLeftText, {
    x: margin,
    y: 24,
    size: 8.5,
    fontRegular,
    fontBold,
    fontGeist,
    color: muted,
  });

  const pNumStr = String(pageNum).padStart(2, '0');
  const pNumW = fontBold.widthOfTextAtSize(pNumStr, 9);
  drawSafeText(page, pNumStr, {
    x: pageWidth - margin - pNumW,
    y: 24,
    size: 9,
    fontRegular,
    fontBold,
    fontGeist,
    color: brandColor,
    isBold: true,
  });
}

export interface ParsedItineraryDay {
  dayNumber: number;
  dateLabel?: string;
  title: string;
  paragraphs: string[];
  overnight: string;
  meals: string;
  transfers: string;
  experience: string;
  notes: string;
}

export interface ParsedItineraryResult {
  destination: string;
  durationDays: number;
  durationNights: number;
  travelDates: string;
  overviewParagraph: string;
  overviewTableRows: Array<[string, string]>;
  recordedRequirements: string[];
  toConfirmItems: string[];
  days: ParsedItineraryDay[];
  accommodationRows: Array<[string, string]>;
  alternativeAccommodationText: string;
  inclusions: string[];
  exclusions: string[];
  importantInfo: string[];
  paymentScheduleText: string;
  cancellationTermsText: string;
  quoteValidityText: string;
  beforeTravelItems: string[];
  preparedDateStr: string;
  validUntilDateStr: string;
}

const MONTHS_FULL = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const WEEKDAYS_FULL = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

function formatCalendarDate(d: Date): string {
  return `${d.getDate()} ${MONTHS_FULL[d.getMonth()]} ${d.getFullYear()}`;
}

function formatDayDateLabel(startDate: Date | null, dayOffset: number): string {
  if (!startDate || isNaN(startDate.getTime())) {
    return `Day ${dayOffset + 1}`;
  }
  const dt = new Date(startDate.getTime());
  dt.setDate(dt.getDate() + dayOffset);
  return `${WEEKDAYS_FULL[dt.getDay()]}, ${dt.getDate()} ${MONTHS_FULL[dt.getMonth()]}`;
}

function parseStartDateFromTravelDates(
  departureDate?: string | Date | null,
  travelDates?: string
): Date | null {
  if (departureDate) {
    const dt = new Date(departureDate);
    if (!isNaN(dt.getTime())) return dt;
  }
  if (!travelDates) return null;

  const explicitDateLineMatch = travelDates.match(
    /(?:Travel\s+Dates|Departure\s+Date|Stay)\**\s*:\s*\**([^\n\r]+)/i
  );
  const targetStr = explicitDateLineMatch ? explicitDateLineMatch[1] : travelDates;

  const rangeSameMonth = targetStr.match(/(\d{1,2})\s*[-–—]\s*\d{1,2}\s+([A-Za-z]+)\s+(\d{4})/);
  if (rangeSameMonth) {
    const parsed = new Date(`${rangeSameMonth[2]} ${rangeSameMonth[1]}, ${rangeSameMonth[3]}`);
    if (!isNaN(parsed.getTime())) return parsed;
  }

  const singleOrFirstDate = targetStr.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (singleOrFirstDate) {
    const parsed = new Date(`${singleOrFirstDate[2]} ${singleOrFirstDate[1]}, ${singleOrFirstDate[3]}`);
    if (!isNaN(parsed.getTime())) return parsed;
  }

  const isoMatch = targetStr.match(/(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) {
    const parsed = new Date(isoMatch[1]);
    if (!isNaN(parsed.getTime())) return parsed;
  }

  return null;
}

function humanizeHotelTier(hotelTier?: string, destination?: string): string {
  const destLabel = destination || 'the destination';
  if (!hotelTier) return '';
  const lower = hotelTier.toLowerCase();
  if (lower === 'luxury_5star') return '5-star luxury hotel';
  if (lower === 'boutique_4star') return '4-star hotel';
  if (lower === 'chalet_villa') return `Private chalet or luxury villa in ${destLabel}`;
  if (lower === 'standard_3star') return '3-star hotel';
  return hotelTier.replace(/_/g, ' ');
}

function numberToWords(n: number): string {
  const words: Record<number, string> = {
    1: 'One',
    2: 'Two',
    3: 'Three',
    4: 'Four',
    5: 'Five',
    6: 'Six',
    7: 'Seven',
    8: 'Eight',
    9: 'Nine',
    10: 'Ten',
    11: 'Eleven',
    12: 'Twelve',
    14: 'Fourteen',
  };
  return words[n] || String(n);
}

const GENERIC_GUEST_PLACEHOLDERS = new Set([
  'guest',
  'customer',
  'valued client',
  'valued guest',
  'valued traveler',
  'valued traveller',
  'client',
  'n/a',
  'na',
  'none',
  'unknown',
  'inquiry',
  'lead',
  'partner supplier',
]);

export function resolveCustomerNameForPdf(options: PDFOptions, itineraryText?: string): string {
  if (options.recipientType === 'supplier') {
    const sup = options.recipientName?.trim();
    return sup && sup.toLowerCase() !== 'guest' ? sanitizePdfText(sup) : 'Partner Supplier';
  }

  const candidate = options.recipientName?.trim();
  if (candidate && !GENERIC_GUEST_PLACEHOLDERS.has(candidate.toLowerCase())) {
    return sanitizePdfText(candidate);
  }

  const text = itineraryText || options.itineraryText || '';
  if (text) {
    // 1. Check explicit Guest / Client / Prepared for key-value lines in itinerary
    const kvMatches = text.matchAll(
      /(?:^|\n)\s*(?:[-*•]\s*)?(?:\*\*|__)?(?:Guest(?:\s+name)?|Client(?:\s+name)?|Customer(?:\s+name)?|Prepared\s+for)(?:\*\*|__)?\s*:\s*([^\n\r|]+)/gi
    );
    for (const m of kvMatches) {
      const val = sanitizePdfText(m[1]).replace(/^_+|_+$/g, '').trim();
      if (val && val.length >= 2 && val.length <= 60 && !GENERIC_GUEST_PLACEHOLDERS.has(val.toLowerCase())) {
        return val;
      }
    }

    // 2. Check narrative "prepared for <Name>" in overview text
    const narrativeMatch = text.match(
      /\bprepared\s+for\s+([A-Z][a-zA-Z.\s&-]{1,40}?)(?:\s+as\s+a\b|\s+seeking\b|\s+travelling\b|\s+traveling\b|\s+visiting\b|\s+from\b|\s+on\b|[.,;\n\r|]|$)/
    );
    if (narrativeMatch && narrativeMatch[1]) {
      const val = sanitizePdfText(narrativeMatch[1]).trim();
      if (val && val.length >= 2 && val.length <= 50 && !GENERIC_GUEST_PLACEHOLDERS.has(val.toLowerCase())) {
        return val;
      }
    }
  }

  return 'Guest';
}

function parsePipeTableRow(line: string): {
  isTableLine: boolean;
  isHeaderOrDivider: boolean;
  cells: string[];
} {
  const trimmed = line.trim();
  const pipeCount = (trimmed.match(/\|/g) || []).length;
  if (!trimmed.startsWith('|') && pipeCount < 2) {
    return { isTableLine: false, isHeaderOrDivider: false, cells: [] };
  }

  const rawCells = trimmed.split('|').map((c) => c.trim());
  if (trimmed.startsWith('|')) rawCells.shift();
  if (trimmed.endsWith('|')) rawCells.pop();

  const cells = rawCells.map((c) => c.replace(/^\**|\**$/g, '').trim()).filter((c) => c.length > 0);
  if (cells.length === 0) {
    return { isTableLine: true, isHeaderOrDivider: true, cells: [] };
  }

  // Divider row like |---|---| or | :--- | ---: |
  const isDivider = cells.every((c) => /^[:\-—–\s]+$/.test(c));
  if (isDivider) {
    return { isTableLine: true, isHeaderOrDivider: true, cells };
  }

  // Table header row like | Item | Details | or | Item | Status |
  const c0 = cells[0].toLowerCase();
  const c1 = (cells[1] || '').toLowerCase();
  const headerCol0 = new Set([
    'item',
    'items',
    'field',
    'category',
    'parameter',
    'stay details',
    'component',
    'service',
    'checklist',
    'requirement',
    'acceptance',
    'section',
    'particulars',
  ]);
  const headerCol1 = new Set([
    'details',
    'status',
    'value',
    'proposed arrangement',
    'description',
    'notes',
    'estimated range (usd)',
    'estimated range (inr)',
    'estimated range',
    'arrangement',
    'included',
    'remarks',
  ]);
  if (headerCol0.has(c0) && (!c1 || headerCol1.has(c1))) {
    return { isTableLine: true, isHeaderOrDivider: true, cells };
  }

  return { isTableLine: true, isHeaderOrDivider: false, cells };
}

function isInappropriateBudgetOrMetaLine(text: string): boolean {
  const lower = text.toLowerCase();
  if (
    lower.includes('revised budget') ||
    lower.includes('planning target of usd') ||
    lower.includes('estimated package to usd') ||
    lower.includes('conflict is flagged') ||
    lower.includes('single approved source record') ||
    lower.includes('powerpoint') ||
    /\busd\s*[\d,]+/i.test(text)
  ) {
    return true;
  }
  return false;
}

function extractCleanListItemFromLine(line: string): string | null {
  const pipeInfo = parsePipeTableRow(line);
  if (pipeInfo.isTableLine) {
    if (pipeInfo.isHeaderOrDivider || pipeInfo.cells.length === 0) return null;
    const col1 = sanitizePdfText(pipeInfo.cells[0]);
    const col2 = pipeInfo.cells[1] ? sanitizePdfText(pipeInfo.cells[1]) : '';
    if (!col1 || /^_+$/.test(col1)) return null;
    if (isInappropriateBudgetOrMetaLine(col1) || isInappropriateBudgetOrMetaLine(col2)) return null;

    const genericStatuses = new Set([
      'pending',
      'tbd',
      'required',
      'yes',
      'included',
      'excluded',
      'mandatory',
      'open',
      'to be confirmed',
      'confirmed',
    ]);
    if (!col2 || genericStatuses.has(col2.toLowerCase()) || /^_+$/.test(col2)) {
      return col1;
    }
    return `${col1} (${col2.charAt(0).toLowerCase() + col2.slice(1)})`;
  }

  const stripped = line
    .replace(/^(?:\d+[\.\)]|[-*•])\s*/, '')
    .replace(/^\|+|\|+$/g, '')
    .trim();
  if (!stripped) return null;

  // Ignore standalone sub-header labels
  const lower = stripped.replace(/\*+/g, '').replace(/:$/, '').trim().toLowerCase();
  if (
    lower === 'recorded requirements' ||
    lower === 'to confirm before booking' ||
    lower === 'awaiting confirmation' ||
    lower === 'please provide or confirm' ||
    lower === 'outstanding items'
  ) {
    return null;
  }

  const cleaned = sanitizePdfText(stripped);
  if (!cleaned || isInappropriateBudgetOrMetaLine(cleaned)) return null;
  return cleaned;
}

export function parseItineraryContent(text: string, options: PDFOptions): ParsedItineraryResult {
  const content = text || '';
  // Pre-split inline section rules and inline pipe tables so every table row is parsed on its own line
  const normalizedContent = content
    .replace(/\s+---\s+(?=#{1,4}\s)/g, '\n---\n')
    .replace(/([.!?])\s+(\|[^|\n]+\|)/g, '$1\n$2')
    .replace(/\|\s+\|(?=\s*(?:[-:]+|[A-Za-z0-9*]))/g, '|\n|');
  const rawLines = normalizedContent.split(/\r?\n/);

  // 1. Destination
  let destination = options.destination?.trim();
  if (!destination) {
    const destMatch =
      content.match(/\*\*Destination:\*\*\s*([^\n\r]+)/i) ||
      content.match(/^Destination:\s*([^\n\r]+)/im) ||
      content.match(/(?:Journey|Escape|Voyage|Trip|Holiday)\s+to\s+([A-Z][a-zA-Z\s,&]+?)(?:\s*\(|\n|\r|$)/i);
    destination = destMatch ? sanitizePdfText(destMatch[1]) : 'Destination to be confirmed';
  }

  // 2. Duration
  let durationDays = options.durationDays;
  if (!durationDays) {
    const durMatch =
      content.match(/(\d+)\s*[- ]\s*Day/i) ||
      content.match(/Duration:\s*(\d+)\s*Days?/i) ||
      content.match(/\((\d+)\s*Days?\)/i);
    durationDays = durMatch ? parseInt(durMatch[1], 10) : undefined;
  }

  // 3. Parse Start Date & Travel Dates
  const startDate = parseStartDateFromTravelDates(options.departureDate, options.travelDates || content);
  let travelDates = options.travelDates?.trim();
  if (!travelDates) {
    if (options.departureDate) {
      const dep = new Date(options.departureDate);
      if (!isNaN(dep.getTime())) {
        if (options.returnDate) {
          const ret = new Date(options.returnDate);
          if (!isNaN(ret.getTime())) {
            if (dep.getMonth() === ret.getMonth() && dep.getFullYear() === ret.getFullYear()) {
              travelDates = `${dep.getDate()}–${ret.getDate()} ${MONTHS_FULL[dep.getMonth()]} ${dep.getFullYear()}`;
            } else {
              travelDates = `${dep.getDate()} ${MONTHS_FULL[dep.getMonth()].slice(0, 3)} – ${ret.getDate()} ${MONTHS_FULL[ret.getMonth()].slice(0, 3)} ${ret.getFullYear()}`;
            }
          }
        }
        if (!travelDates) {
          travelDates = formatCalendarDate(dep);
        }
      }
    }
    if (!travelDates) {
      const dateMatch =
        content.match(/\*\*Departure Date:\*\*\s*([^\n\r(]+)/i) ||
        content.match(/\*\*Travel Dates:\*\*\s*([^\n\r]+)/i) ||
        content.match(/Travel Dates:\s*([^\n\r]+)/i);
      travelDates = dateMatch ? sanitizePdfText(dateMatch[1]) : 'Dates to be confirmed';
    }
  }

  // 4. Parse Sections & Daily Breakdown from Markdown
  const days: ParsedItineraryDay[] = [];
  const recordedRequirements: string[] = [];
  const toConfirmItems: string[] = [];
  const inclusions: string[] = [];
  const exclusions: string[] = [];
  const importantInfo: string[] = [];
  const beforeTravelItems: string[] = [];
  const overviewParagraphs: string[] = [];
  const overviewKeyVal: Record<string, string> = {};
  const accommodationKeyVal: Record<string, string> = {};

  const dayHeaderRegex = /^(?:#{1,4}\s*)?\**(?:Day\s*(\d+)|DAY\s*(\d+))\**\s*[:–—\-]\s*(.*)$/i;
  let currentSection:
    | 'none'
    | 'overview'
    | 'preferences_recorded'
    | 'preferences_confirm'
    | 'day'
    | 'accommodation'
    | 'includes'
    | 'excludes'
    | 'important_info'
    | 'before_travel'
    | 'other' = 'none';

  let currentDay: ParsedItineraryDay | null = null;

  for (const rawLine of rawLines) {
    const line = rawLine.trim();
    if (!line || line === '---') continue;

    // Check if it's a Day heading first
    const dayMatch = line.match(dayHeaderRegex);
    if (dayMatch) {
      if (currentDay) days.push(currentDay);
      const dNum = parseInt(dayMatch[1] || dayMatch[2], 10);
      let rawDayRest = dayMatch[3].trim();
      let extractedDateLabel: string | undefined;

      // Strip leading date from Day heading like "Friday, 20 November 2026: Arrival and Island Settling"
      const leadingDateMatch = rawDayRest.match(
        /^((?:(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s*,?\s*)?\d{1,2}\s+[A-Za-z]+(?:\s+\d{4})?)\s*[:–—\-]\s*(.+)$/i
      );
      if (leadingDateMatch) {
        extractedDateLabel = sanitizePdfText(leadingDateMatch[1].replace(/\s+\d{4}$/, ''));
        rawDayRest = leadingDateMatch[2].trim();
      }

      const cleanTitle = sanitizePdfText(rawDayRest) || `Day ${dNum} in ${destination}`;
      currentDay = {
        dayNumber: dNum,
        dateLabel: startDate ? formatDayDateLabel(startDate, dNum - 1) : extractedDateLabel || `Day ${dNum}`,
        title: cleanTitle,
        paragraphs: [],
        overnight: '',
        meals: '',
        transfers: '',
        experience: '',
        notes: '',
      };
      currentSection = 'day';
      continue;
    }

    // Check standalone bold sub-headings (e.g. **Recorded requirements**, **Awaiting confirmation**, **To confirm before booking**)
    const boldHeadingMatch = line.match(/^(?:\*\*|__)([^*_]+)(?:\*\*|__)\s*:?\s*$/);
    if (boldHeadingMatch) {
      const subText = boldHeadingMatch[1].trim().toLowerCase();
      if (subText.includes('recorded requirements')) {
        currentSection = 'preferences_recorded';
        continue;
      } else if (
        subText.includes('to confirm before booking') ||
        subText.includes('awaiting confirmation') ||
        subText === 'to confirm'
      ) {
        currentSection = 'preferences_confirm';
        continue;
      } else if (subText.includes('please provide or confirm') || subText.includes('before travel')) {
        currentSection = 'before_travel';
        continue;
      }
    }

    // Check section headings (# ...)
    if (line.startsWith('#')) {
      const headingText = line.replace(/^#+\s*/, '').toLowerCase();
      if (currentDay && !headingText.startsWith('day ')) {
        days.push(currentDay);
        currentDay = null;
      }

      if (headingText.includes('executive summary') || headingText.includes('trip overview')) {
        currentSection = 'overview';
      } else if (headingText.includes('recorded requirements')) {
        currentSection = 'preferences_recorded';
      } else if (headingText.includes('to confirm before booking') || headingText.includes('awaiting confirmation')) {
        currentSection = 'preferences_confirm';
      } else if (headingText.includes('guest preferences')) {
        currentSection = 'preferences_recorded';
      } else if (headingText.includes('accommodation')) {
        currentSection = 'accommodation';
      } else if (headingText.includes('package includes') || headingText.includes('inclusions')) {
        currentSection = 'includes';
      } else if (headingText.includes('package excludes') || headingText.includes('exclusions')) {
        currentSection = 'excludes';
      } else if (headingText.includes('important travel information')) {
        currentSection = 'important_info';
      } else if (headingText.includes('before travel') || headingText.includes('outstanding items')) {
        currentSection = 'before_travel';
      } else if (headingText.includes('day-by-day') || headingText.includes('daily itinerary')) {
        currentSection = 'none';
      } else {
        currentSection = 'other';
      }
      continue;
    }

    // Handle content within active section
    if (currentSection === 'day' && currentDay) {
      const cleanLine = line.replace(/^[-*•]\s*/, '').trim();
      const lower = cleanLine.toLowerCase();
      const normalizedKeyLine = lower.replace(/^\*+|\*+$/g, '');

      if (lower.startsWith('overnight:') || lower.startsWith('**overnight:**') || normalizedKeyLine.startsWith('overnight:')) {
        const val = sanitizePdfText(cleanLine.substring(cleanLine.indexOf(':') + 1));
        currentDay.overnight = val.toLowerCase().includes('not applicable') || val.toLowerCase() === 'none' ? '' : val;
      } else if (lower.startsWith('meals:') || lower.startsWith('**meals:**') || normalizedKeyLine.startsWith('meals:')) {
        currentDay.meals = sanitizePdfText(cleanLine.substring(cleanLine.indexOf(':') + 1));
      } else if (
        lower.startsWith('transfers:') ||
        lower.startsWith('transfer:') ||
        lower.startsWith('**transfers:**') ||
        normalizedKeyLine.startsWith('transfers:') ||
        normalizedKeyLine.startsWith('transfer:')
      ) {
        currentDay.transfers = sanitizePdfText(cleanLine.substring(cleanLine.indexOf(':') + 1));
      } else if (
        lower.startsWith('included experience:') ||
        lower.startsWith('included experiences:') ||
        lower.startsWith('experience:') ||
        lower.startsWith('experiences:') ||
        lower.startsWith('**included experience:**') ||
        lower.startsWith('**included experiences:**') ||
        normalizedKeyLine.startsWith('included experience')
      ) {
        const expVal = sanitizePdfText(cleanLine.substring(cleanLine.indexOf(':') + 1));
        const expLower = expVal.toLowerCase();
        currentDay.experience =
          expLower === 'none' ||
          expLower === 'none.' ||
          expLower.startsWith('none on day') ||
          expLower.includes('not applicable')
            ? ''
            : expVal;
      } else if (
        lower.startsWith('notes:') ||
        lower.startsWith('note:') ||
        lower.startsWith('**notes:**') ||
        lower.startsWith('**note:**') ||
        normalizedKeyLine.startsWith('notes:') ||
        normalizedKeyLine.startsWith('note:')
      ) {
        currentDay.notes = sanitizePdfText(cleanLine.substring(cleanLine.indexOf(':') + 1));
      } else if (lower.startsWith('date:') || normalizedKeyLine.startsWith('date:')) {
        currentDay.dateLabel = sanitizePdfText(cleanLine.substring(cleanLine.indexOf(':') + 1));
      } else if (
        lower.startsWith('main programme:') ||
        lower.startsWith('**main programme:**') ||
        lower.startsWith('programme:') ||
        lower.startsWith('**programme:**') ||
        normalizedKeyLine.startsWith('main programme:') ||
        normalizedKeyLine.startsWith('programme:')
      ) {
        const para = sanitizePdfText(cleanLine.substring(cleanLine.indexOf(':') + 1));
        if (para) {
          currentDay.paragraphs.push(para);
        }
      } else if (!cleanLine.startsWith('>')) {
        const pipeRow = parsePipeTableRow(cleanLine);
        if (!pipeRow.isTableLine) {
          const para = sanitizePdfText(cleanLine);
          if (para && !isInappropriateBudgetOrMetaLine(para)) {
            currentDay.paragraphs.push(para);
          }
        }
      }
      continue;
    }

    if (currentSection === 'overview') {
      if (line.startsWith('>')) continue;
      // 1. Check if it's a Markdown pipe table row (e.g. | Accommodation | 1 Overwater Pool Villa... |)
      const pipeInfo = parsePipeTableRow(line);
      if (pipeInfo.isTableLine) {
        if (!pipeInfo.isHeaderOrDivider && pipeInfo.cells.length >= 2) {
          const k = pipeInfo.cells[0].toLowerCase().trim();
          const v = sanitizePdfText(pipeInfo.cells[1]);
          if (k && v) {
            overviewKeyVal[k] = v;
          }
        }
        continue;
      }

      // 2. Check if it's a Key: Value line
      const kvMatch = line.match(/^[-*•]?\s*\**([A-Za-z\s\/]+?)\**\s*:\s*(.+)$/);
      if (kvMatch) {
        const keyLower = kvMatch[1].trim().toLowerCase();
        overviewKeyVal[keyLower] = sanitizePdfText(kvMatch[2]);
      } else {
        const cleanP = sanitizePdfText(line);
        if (cleanP && !isInappropriateBudgetOrMetaLine(cleanP)) {
          overviewParagraphs.push(cleanP);
        }
      }
      continue;
    }

    if (currentSection === 'preferences_recorded') {
      const cleaned = extractCleanListItemFromLine(line);
      if (cleaned) recordedRequirements.push(cleaned);
      continue;
    }

    if (currentSection === 'preferences_confirm') {
      const cleaned = extractCleanListItemFromLine(line);
      if (cleaned) toConfirmItems.push(cleaned);
      continue;
    }

    if (currentSection === 'accommodation') {
      const pipeInfo = parsePipeTableRow(line);
      if (pipeInfo.isTableLine) {
        if (!pipeInfo.isHeaderOrDivider && pipeInfo.cells.length >= 2) {
          const k = pipeInfo.cells[0].toLowerCase().trim();
          const v = sanitizePdfText(pipeInfo.cells[1]);
          if (k && v) {
            accommodationKeyVal[k] = v;
          }
        }
        continue;
      }

      const kvMatch = line.match(/^[-*•]?\s*\**([A-Za-z\s\-]+?)\**\s*:\s*(.+)$/);
      if (kvMatch) {
        accommodationKeyVal[kvMatch[1].trim().toLowerCase()] = sanitizePdfText(kvMatch[2]);
      }
      continue;
    }

    if (currentSection === 'includes') {
      const cleaned = extractCleanListItemFromLine(line);
      if (cleaned) inclusions.push(cleaned);
      continue;
    }

    if (currentSection === 'excludes') {
      const cleaned = extractCleanListItemFromLine(line);
      if (cleaned) exclusions.push(cleaned);
      continue;
    }

    if (currentSection === 'important_info') {
      const cleaned = extractCleanListItemFromLine(line);
      if (cleaned) importantInfo.push(cleaned);
      continue;
    }

    if (currentSection === 'before_travel') {
      const cleaned = extractCleanListItemFromLine(line);
      if (cleaned) beforeTravelItems.push(cleaned);
      continue;
    }
  }

  if (currentDay) days.push(currentDay);

  // Daily content comes from the same parser used by the dashboard. Missing content stays missing.
  days.splice(0, days.length, ...parseItineraryDays(content).map(day => ({
    ...day,
    title: sanitizePdfText(day.title),
    paragraphs: day.paragraphs.map(sanitizePdfText),
    dateLabel: startDate ? formatDayDateLabel(startDate, day.dayNumber - 1) : undefined,
  })));
  const finalDurationDays = durationDays ?? days.length;
  const finalDurationNights = Math.max(0, finalDurationDays - 1);
  const hotelCategoryDesc = options.hotelTier ? humanizeHotelTier(options.hotelTier, destination) : '';
  const overviewParagraph = overviewParagraphs.join(' ');
  const overviewTableRows: Array<[string, string]> = [
    ['Destination', overviewKeyVal['destination'] || destination],
    ['Duration', finalDurationDays ? `${finalDurationDays} days / ${finalDurationNights} nights` : ''],
    ['Hotel plan', overviewKeyVal['hotel plan'] || overviewKeyVal['accommodation'] || overviewKeyVal['hotel'] || hotelCategoryDesc],
    ['Meal plan', options.mealPlan || overviewKeyVal['meal plan'] || overviewKeyVal['meals'] || accommodationKeyVal['meal plan'] || ''],
    ['Transfers', overviewKeyVal['transfers'] || overviewKeyVal['transport'] || overviewKeyVal['ground transport'] || ''],
    ['Flights', overviewKeyVal['flights'] || overviewKeyVal['flight scope'] || overviewKeyVal['airfare'] || ''],
    ['Pace', overviewKeyVal['pace'] || ''],
  ];
  const accommodationRows: Array<[string, string]> = [
    ['Hotel category', accommodationKeyVal['hotel category'] || accommodationKeyVal['category'] || hotelCategoryDesc],
    ['Stay', accommodationKeyVal['stay'] || travelDates],
    ['Room', accommodationKeyVal['room'] || accommodationKeyVal['room category'] || ''],
    ['Meal plan', accommodationKeyVal['meal plan'] || overviewKeyVal['meal plan'] || ''],
    ['Hotel name', accommodationKeyVal['hotel name'] || accommodationKeyVal['proposed hotel'] || accommodationKeyVal['hotel'] || ''],
  ];
  const alternativeAccommodationText = accommodationKeyVal['alternative options'] || '';

  // Dynamic Prepared & Valid Until Dates
  const prepDateObj = options.preparedDate ? new Date(options.preparedDate) : new Date();
  const safePrepDate = isNaN(prepDateObj.getTime()) ? new Date() : prepDateObj;
  const preparedDateStr = formatCalendarDate(safePrepDate);

  const validUntil = options.validUntilDate ? new Date(options.validUntilDate) : null;
  const validUntilDateStr = validUntil && !isNaN(validUntil.getTime()) ? formatCalendarDate(validUntil) : 'Not specified';
  const paymentScheduleText = 'Payment terms have not been provided.';
  const cancellationTermsText = 'Cancellation terms have not been provided.';
  const quoteValidityText = validUntil ? `Valid until ${validUntilDateStr}.` : 'Proposal validity has not been specified.';

  return {
    destination,
    durationDays: finalDurationDays,
    durationNights: finalDurationNights,
    travelDates,
    overviewParagraph,
    overviewTableRows,
    recordedRequirements,
    toConfirmItems,
    days,
    accommodationRows,
    alternativeAccommodationText,
    inclusions,
    exclusions,
    importantInfo,
    paymentScheduleText,
    cancellationTermsText,
    quoteValidityText,
    beforeTravelItems,
    preparedDateStr,
    validUntilDateStr,
  };
}

/**
 * Renders the saved proposal with the configured agency header and theme.
 * Programme text and supplied sections flow onto continuation pages without truncation.
 */
export async function generateItineraryPDF(options: PDFOptions): Promise<Uint8Array> {
  assertItineraryReady(options.itineraryText, options.durationDays ?? declaredItineraryDuration(`# ${options.title}`));
  const pdfDoc = await PDFDocument.create();
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontGeist = await getGeistFont(pdfDoc);
  const brand = hexToRgb(options.brandColor);
  const brandColor = rgb(brand.r, brand.g, brand.b);
  const charcoal = rgb(0.118, 0.125, 0.133);
  const muted = rgb(0.36, 0.38, 0.41);
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 42;
  const contentWidth = pageWidth - margin * 2;
  const parsed = parseItineraryContent(options.itineraryText, options);
  const [logoImg, letterheadImg] = await Promise.all([
    tryEmbedImage(pdfDoc, options.organizationLogo),
    tryEmbedImage(pdfDoc, options.organizationLetterhead),
  ]);
  let page: any;
  let y = 0;
  let pageNum = 0;
  let section = '';
  const newPage = (heading: string, continued = false) => {
    page = pdfDoc.addPage([pageWidth, pageHeight]);
    pageNum++;
    section = heading;
    y = drawSettingsConfiguredHeader({
      page, pageWidth, pageHeight, margin, options, logoImg, letterheadImg,
      fontRegular, fontBold, fontGeist,
      badgeText: options.recipientType === 'supplier' ? 'SUPPLIER RFQ' : 'ITINERARY PROPOSAL',
      subRightText: `Page ${pageNum}`,
    }) - 8;
    drawSettingsConfiguredFooter({
      page, pageWidth, margin, footerLeftText: options.organizationName || '', pageNum,
      fontRegular, fontBold, fontGeist, brandColor, muted,
    });
    write(continued ? `${heading} (continued)` : heading, 21, true, brandColor);
    y -= 10;
  };
  const write = (text: string, size = 12, bold = false, color = charcoal) => {
    if (!text?.trim()) return;
    // Each line is retained, even if one programme, note or list item spans multiple pages.
    for (const line of wrapText(text, contentWidth, bold ? fontBold : fontRegular, size)) {
      if (y < 65) newPage(section, true);
      drawSafeText(page, line, { x: margin, y, size, fontRegular, fontBold, fontGeist, color, isBold: bold });
      y -= size * 1.5;
    }
    y -= 10;
  };
  const rows = (values: Array<[string, string]>) => {
    for (const [label, value] of values) if (value?.trim()) write(`${label}: ${value}`);
  };
  const list = (heading: string, items: string[]) => {
    if (!items.length) return;
    newPage(heading);
    items.forEach((item, index) => write(`${index + 1}. ${item}`));
  };
  newPage(options.title);
  rows([
    ['Prepared for', resolveCustomerNameForPdf(options, options.itineraryText)],
    ['Destination', parsed.destination], ['Duration', `${parsed.durationDays} days / ${parsed.durationNights} nights`],
    ['Travel dates', parsed.travelDates],
    ['Adults', options.headcountAdults != null ? String(options.headcountAdults) : ''],
    ['Children', options.headcountChildren != null ? String(options.headcountChildren) : ''],
    ['Prepared', parsed.preparedDateStr], ['Reference', options.bookingReference || ''],
  ]);
  if (parsed.overviewParagraph) write(parsed.overviewParagraph);
  rows(parsed.overviewTableRows.filter(([label]) => !['Destination', 'Duration'].includes(label)));
  list('Recorded requirements', parsed.recordedRequirements);
  list('To confirm before booking', parsed.toConfirmItems);
  for (const day of parsed.days) {
    newPage(`Day ${day.dayNumber}: ${day.title}`);
    if (day.dateLabel) write(day.dateLabel, 11, false, muted);
    day.paragraphs.forEach(paragraph => write(paragraph, 12.5));
    rows([['Overnight', day.overnight], ['Meals', day.meals], ['Transfers', day.transfers],
      ['Included experience', day.experience], ['Notes', day.notes]]);
  }
  if (parsed.accommodationRows.some(([, value]) => value)) {
    newPage('Curated accommodations');
    rows(parsed.accommodationRows);
    write(parsed.alternativeAccommodationText);
  }
  list('Package includes', parsed.inclusions);
  list('Package excludes', parsed.exclusions);
  list('Important travel information', parsed.importantInfo);
  list('Before travel', parsed.beforeTravelItems);
  // Render configured contact details only; never infer addresses, registration IDs or service hours.
  if (options.consultantName || options.organizationPhone || options.consultantEmail || options.organizationAddress) {
    newPage('Contact details');
    rows([
      ['Agency', options.organizationName || ''], ['Address', options.organizationAddress || ''],
      ['Phone', options.organizationPhone || options.consultantPhone || ''],
      ['Website', options.organizationWebsite || ''], ['Consultant', options.consultantName || ''],
      ['Email', options.consultantEmail || ''], ['CIN', options.companyCin || ''],
      ['GSTIN', options.companyGstin || ''], ['PAN', options.companyPan || ''],
    ]);
  }
  return pdfDoc.save();
}

export interface CustomerQuotePDFOptions extends PDFHeaderThemeOptions {
  title: string;
  recipientName: string;
  recipientEmail?: string;
  destination: string;
  version: number;
  finalSellingPrice: number;
  currency?: string;
  taxAmount?: number;
  marginAmount?: number;
  itineraryText: string;
  flights?: Array<{
    airline: string;
    flightNumber: string;
    origin: string;
    destination: string;
    departureTime: string | Date;
    arrivalTime: string | Date;
    cabinClass?: string;
    baggageAllowance?: string;
    pnr?: string;
  }>;
  validUntil?: string | Date;
  headcountAdults?: number;
  headcountChildren?: number;
  hotelTier?: string;
  mealPlan?: string;
  consultantName?: string;
  consultantPhone?: string;
  consultantEmail?: string;
  bookingReference?: string;
}

export async function generateCustomerQuotationPDF(options: CustomerQuotePDFOptions): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontGeist = await getGeistFont(pdfDoc);

  const brand = hexToRgb(options.brandColor);
  const brandColor = rgb(brand.r, brand.g, brand.b);
  const charcoal = rgb(0.118, 0.125, 0.133);
  const muted = rgb(0.36, 0.38, 0.41);
  const lightBg = rgb(0.965, 0.969, 0.976);
  const borderCol = rgb(0.886, 0.898, 0.914);

  const margin = 42;
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const contentWidth = pageWidth - margin * 2;

  const [logoImg, letterheadImg] = await Promise.all([
    tryEmbedImage(pdfDoc, options.organizationLogo),
    tryEmbedImage(pdfDoc, options.organizationLetterhead),
  ]);

  let currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
  let y = drawSettingsConfiguredHeader({
    page: currentPage,
    pageWidth,
    pageHeight,
    margin,
    options,
    logoImg,
    letterheadImg,
    fontRegular,
    fontBold,
    fontGeist,
    badgeText: `QUOTATION PROPOSAL v${options.version}`,
    subRightText: `Date: ${formatCalendarDate(new Date())}`,
  });

  const checkPageBreak = (neededHeight: number) => {
    if (y - neededHeight < margin + 35) {
      currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
      y = drawSettingsConfiguredHeader({
        page: currentPage,
        pageWidth,
        pageHeight,
        margin,
        options,
        logoImg,
        letterheadImg,
        fontRegular,
        fontBold,
        fontGeist,
        badgeText: `QUOTATION PROPOSAL v${options.version}`,
        subRightText: `Date: ${formatCalendarDate(new Date())}`,
      });
    }
  };

  drawSafeText(currentPage, `TRAVEL PROPOSAL & QUOTATION (v${options.version})`, {
    x: margin,
    y,
    size: 16,
    fontRegular,
    fontBold,
    fontGeist,
    color: charcoal,
    isBold: true,
  });
  y -= 22;

  const cardHeight = 65;
  currentPage.drawRectangle({
    x: margin,
    y: y - cardHeight + 10,
    width: contentWidth,
    height: cardHeight,
    color: lightBg,
    borderColor: brandColor,
    borderWidth: 1.5,
  });

  drawSafeText(currentPage, `Customer: ${options.recipientName}`, {
    x: margin + 14,
    y: y - 5,
    size: 10,
    fontRegular,
    fontBold,
    fontGeist,
    color: charcoal,
    isBold: true,
  });

  drawSafeText(currentPage, `Destination: ${options.destination}`, {
    x: margin + 14,
    y: y - 20,
    size: 9,
    fontRegular,
    fontBold,
    fontGeist,
    color: muted,
  });

  const validDate = options.validUntil ? new Date(options.validUntil).toLocaleDateString() : '14 days';
  drawSafeText(currentPage, `Quote Validity: Until ${validDate}`, {
    x: margin + 14,
    y: y - 35,
    size: 8.5,
    fontRegular,
    fontBold,
    fontGeist,
    color: muted,
  });

  const curr = options.currency || 'INR';
  const isINR = curr === 'INR';
  const priceFormatted = isINR
    ? `₹${Number(options.finalSellingPrice).toLocaleString('en-IN')}`
    : `${curr} $${Number(options.finalSellingPrice).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

  drawSafeText(currentPage, priceFormatted, {
    x: pageWidth - margin - 170,
    y: y - 10,
    size: 18,
    fontRegular,
    fontBold,
    fontGeist,
    color: brandColor,
    isBold: true,
  });

  drawSafeText(currentPage, 'All Inclusive Selling Price', {
    x: pageWidth - margin - 150,
    y: y - 26,
    size: 8.5,
    fontRegular,
    fontBold,
    fontGeist,
    color: muted,
  });

  y -= cardHeight + 20;

  if (options.flights && options.flights.length > 0) {
    checkPageBreak(80);
    drawSafeText(currentPage, 'CONFIRMED FLIGHT SCHEDULES', {
      x: margin,
      y,
      size: 11,
      fontRegular,
      fontBold,
      fontGeist,
      color: brandColor,
      isBold: true,
    });
    y -= 15;

    for (const f of options.flights) {
      checkPageBreak(45);
      currentPage.drawRectangle({
        x: margin,
        y: y - 32,
        width: contentWidth,
        height: 38,
        color: lightBg,
        borderColor: borderCol,
        borderWidth: 1,
      });

      drawSafeText(currentPage, `${f.airline} • Flight ${f.flightNumber} (${f.cabinClass?.toUpperCase() || 'ECONOMY'})`, {
        x: margin + 10,
        y: y - 10,
        size: 9,
        fontRegular,
        fontBold,
        fontGeist,
        color: charcoal,
        isBold: true,
      });

      const depDate = new Date(f.departureTime).toLocaleString();
      const arrDate = new Date(f.arrivalTime).toLocaleString();
      drawSafeText(currentPage, `${f.origin} -> ${f.destination} | Dep: ${depDate} | Arr: ${arrDate}`, {
        x: margin + 10,
        y: y - 24,
        size: 8,
        fontRegular,
        fontBold,
        fontGeist,
        color: muted,
      });

      if (f.pnr) {
        const pnrText = `PNR: ${f.pnr}`;
        const pnrW = fontBold.widthOfTextAtSize(pnrText, 9);
        drawSafeText(currentPage, pnrText, {
          x: pageWidth - margin - pnrW - 10,
          y: y - 10,
          size: 9,
          fontRegular,
          fontBold,
          fontGeist,
          color: brandColor,
          isBold: true,
        });
      }

      y -= 45;
    }
    y -= 10;
  }

  checkPageBreak(40);
  drawSafeText(currentPage, 'CURATED DAY-WISE JOURNEY ITINERARY', {
    x: margin,
    y,
    size: 11,
    fontRegular,
    fontBold,
    fontGeist,
    color: brandColor,
    isBold: true,
  });
  y -= 15;

  const rawLines = (options.itineraryText || '').split('\n');
  for (const rawLine of rawLines) {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      y -= 7;
      continue;
    }
    if (trimmed.startsWith('# ')) continue;

    if (trimmed.startsWith('## ') || trimmed.startsWith('### ')) {
      checkPageBreak(30);
      const heading = trimmed.replace(/^#+\s*/, '');
      y -= 6;
      drawSafeText(currentPage, heading, {
        x: margin,
        y,
        size: 10.5,
        fontRegular,
        fontBold,
        fontGeist,
        color: brandColor,
        isBold: true,
      });
      y -= 15;
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      const bulletText = trimmed.replace(/^[-*]\s*/, '');
      const wrapped = wrapText(bulletText, contentWidth - 20, fontRegular, 8.5);
      for (let i = 0; i < wrapped.length; i++) {
        checkPageBreak(12);
        if (i === 0) {
          drawSafeText(currentPage, '•', {
            x: margin + 4,
            y,
            size: 8.5,
            fontRegular,
            fontBold,
            fontGeist,
            color: brandColor,
            isBold: true,
          });
        }
        drawSafeText(currentPage, wrapped[i], {
          x: margin + 14,
          y,
          size: 8.5,
          fontRegular,
          fontBold,
          fontGeist,
          color: charcoal,
        });
        y -= 12;
      }
    } else {
      const wrapped = wrapText(trimmed, contentWidth, fontRegular, 8.5);
      for (const line of wrapped) {
        checkPageBreak(12);
        drawSafeText(currentPage, line, {
          x: margin,
          y,
          size: 8.5,
          fontRegular,
          fontBold,
          fontGeist,
          color: charcoal,
        });
        y -= 12;
      }
    }
  }

  const totalPagesCount = pdfDoc.getPageCount();
  const quoteFooterOrg = options.organizationName || '';
  for (let i = 0; i < totalPagesCount; i++) {
    const page = pdfDoc.getPage(i);
    drawSettingsConfiguredFooter({
      page,
      pageWidth,
      margin,
      footerLeftText: `${quoteFooterOrg} • Proposal v${options.version}`,
      pageNum: i + 1,
      totalPages: totalPagesCount,
      fontRegular,
      fontBold,
      fontGeist,
      brandColor,
      muted,
    });
  }

  return await pdfDoc.save();
}

export interface BookingVoucherPDFOptions extends PDFHeaderThemeOptions {
  bookingReference: string;
  leadTitle: string;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  destination: string;
  departureDate?: string | Date;
  returnDate?: string | Date;
  headcountAdults?: number;
  headcountChildren?: number;
  hotelTier?: string;
  flights?: Array<{
    airline: string;
    flightNumber: string;
    origin: string;
    destination: string;
    departureTime: string | Date;
    pnr?: string;
  }>;
  totalSellingPrice?: number;
  currency?: string;
}

export async function generateBookingVoucherPDF(options: BookingVoucherPDFOptions): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontGeist = await getGeistFont(pdfDoc);

  const brand = hexToRgb(options.brandColor);
  const brandColor = rgb(brand.r, brand.g, brand.b);
  const brandLightBg = rgb(
    Math.min(1, brand.r * 0.08 + 0.92),
    Math.min(1, brand.g * 0.08 + 0.92),
    Math.min(1, brand.b * 0.08 + 0.92)
  );
  const charcoal = rgb(0.118, 0.125, 0.133);
  const muted = rgb(0.36, 0.38, 0.41);

  const margin = 42;
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const contentWidth = pageWidth - margin * 2;

  const [logoImg, letterheadImg] = await Promise.all([
    tryEmbedImage(pdfDoc, options.organizationLogo),
    tryEmbedImage(pdfDoc, options.organizationLetterhead),
  ]);

  const page = pdfDoc.addPage([pageWidth, pageHeight]);
  let y = drawSettingsConfiguredHeader({
    page,
    pageWidth,
    pageHeight,
    margin,
    options,
    logoImg,
    letterheadImg,
    fontRegular,
    fontBold,
    fontGeist,
    badgeText: 'OFFICIAL BOOKING VOUCHER',
    subRightText: `Ref: ${options.bookingReference}`,
  });

  drawSafeText(page, options.leadTitle.slice(0, 60), {
    x: margin,
    y,
    size: 18,
    fontRegular,
    fontBold,
    fontGeist,
    color: charcoal,
    isBold: true,
  });
  y -= 25;

  const vBoxHeight = 110;
  page.drawRectangle({
    x: margin,
    y: y - vBoxHeight + 10,
    width: contentWidth,
    height: vBoxHeight,
    color: brandLightBg,
    borderColor: brandColor,
    borderWidth: 1.5,
  });

  drawSafeText(page, `BOOKING REFERENCE: ${options.bookingReference}`, {
    x: margin + 15,
    y: y - 8,
    size: 13,
    fontRegular,
    fontBold,
    fontGeist,
    color: brandColor,
    isBold: true,
  });

  drawSafeText(page, `Lead Passenger: ${options.customerName}`, {
    x: margin + 15,
    y: y - 28,
    size: 10,
    fontRegular,
    fontBold,
    fontGeist,
    color: charcoal,
    isBold: true,
  });

  drawSafeText(page, `Destination: ${options.destination}`, {
    x: margin + 15,
    y: y - 45,
    size: 9.5,
    fontRegular,
    fontBold,
    fontGeist,
    color: charcoal,
  });

  const depStr = options.departureDate ? new Date(options.departureDate).toLocaleDateString() : 'Confirmed';
  const retStr = options.returnDate ? new Date(options.returnDate).toLocaleDateString() : 'Confirmed';
  drawSafeText(page, `Travel Window: ${depStr} to ${retStr}`, {
    x: margin + 15,
    y: y - 62,
    size: 9,
    fontRegular,
    fontBold,
    fontGeist,
    color: muted,
  });

  const partyStr = `${options.headcountAdults ?? 0} Adults, ${options.headcountChildren || 0} Children • Tier: ${(options.hotelTier || 'luxury_5star').replace('_', ' ').toUpperCase()}`;
  drawSafeText(page, `Party & Tier: ${partyStr}`, {
    x: margin + 15,
    y: y - 79,
    size: 9,
    fontRegular,
    fontBold,
    fontGeist,
    color: muted,
  });

  if (options.totalSellingPrice) {
    const curr = options.currency || 'INR';
    const isINR = curr === 'INR';
    const priceStr = isINR
      ? `PAID: ₹${Number(options.totalSellingPrice).toLocaleString('en-IN')}`
      : `PAID: ${curr} $${Number(options.totalSellingPrice).toLocaleString()}`;
    drawSafeText(page, priceStr, {
      x: pageWidth - margin - 165,
      y: y - 8,
      size: 12,
      fontRegular,
      fontBold,
      fontGeist,
      color: brandColor,
      isBold: true,
    });
  }

  y -= vBoxHeight + 25;

  if (options.flights && options.flights.length > 0) {
    drawSafeText(page, 'CONFIRMED FLIGHT & PNR MANIFEST', {
      x: margin,
      y,
      size: 11,
      fontRegular,
      fontBold,
      fontGeist,
      color: brandColor,
      isBold: true,
    });
    y -= 18;

    for (const f of options.flights) {
      drawSafeText(page, `• ${f.airline} (${f.flightNumber}): ${f.origin} -> ${f.destination} | PNR: ${f.pnr || 'CONFIRMED'}`, {
        x: margin + 8,
        y,
        size: 9,
        fontRegular,
        fontBold,
        fontGeist,
        color: charcoal,
      });
      y -= 15;
    }
    y -= 15;
  }

  drawSafeText(page, 'VOUCHER INSTRUCTIONS & ON-GROUND ASSISTANCE', {
    x: margin,
    y,
    size: 10,
    fontRegular,
    fontBold,
    fontGeist,
    color: brandColor,
    isBold: true,
  });
  y -= 15;

  const instructions = [
    '1. Present this voucher along with valid government-issued photo identification / passport at hotel check-in.',
    '2. Private chauffeur airport transfers include 60 minutes complimentary waiting time after flight landing.',
    '3. For 24/7 on-ground concierge changes or emergency assistance, contact our 24/7 Concierge Support Desk.',
  ];

  for (const inst of instructions) {
    drawSafeText(page, inst, {
      x: margin + 5,
      y,
      size: 8.5,
      fontRegular,
      fontBold,
      fontGeist,
      color: muted,
    });
    y -= 14;
  }

  drawSettingsConfiguredFooter({
    page,
    pageWidth,
    margin,
    footerLeftText: `${options.organizationName || ''} • Issued on ${formatCalendarDate(new Date())} • CONFIRMED`,
    pageNum: 1,
    totalPages: 1,
    fontRegular,
    fontBold,
    fontGeist,
    brandColor,
    muted,
  });

  return await pdfDoc.save();
}
