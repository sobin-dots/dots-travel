import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import fs from 'node:fs';
import path from 'node:path';

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
    const fontPaths = [
      path.join(process.cwd(), 'public', 'fonts', 'Geist-Regular.ttf'),
      path.join(process.cwd(), 'node_modules', 'next', 'dist', 'compiled', '@vercel', 'og', 'Geist-Regular.ttf'),
    ];
    for (const fp of fontPaths) {
      if (fs.existsSync(fp)) {
        const bytes = fs.readFileSync(fp);
        return await pdfDoc.embedFont(bytes);
      }
    }
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
  const orgName = options.organizationName || 'LGT Holidays';
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
  if (!hotelTier) return `4-star hotel in a central ${destLabel} location`;
  const lower = hotelTier.toLowerCase();
  if (lower === 'luxury_5star') return `5-star luxury hotel in a central ${destLabel} location`;
  if (lower === 'boutique_4star') return `4-star hotel in a central ${destLabel} location`;
  if (lower === 'chalet_villa') return `Private chalet or luxury villa in ${destLabel}`;
  if (lower === 'standard_3star') return `3-star hotel in a convenient ${destLabel} location`;
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

function buildDynamicDaysForDestination(
  destination: string,
  durationDays: number,
  startDate: Date | null
): ParsedItineraryDay[] {
  const lower = destination.toLowerCase();
  const days: ParsedItineraryDay[] = [];

  type DayTemplate = {
    title: string;
    paragraphs: string[];
    transfers: string;
    experience: string;
    notes: string;
  };

  let middleTemplates: DayTemplate[] = [];

  if (lower.includes('singapore')) {
    middleTemplates = [
      {
        title: 'Singapore city highlights',
        paragraphs: [
          'After breakfast, meet the driver and guide for a half-day city tour. Visit selected city landmarks, with photo stops at Merlion Park and Marina Bay. Continue through key civic and cultural districts, subject to traffic and operating conditions.',
          'Return to the hotel. Afternoon at leisure.',
        ],
        transfers: 'Hotel pick-up and drop-off for the city tour',
        experience: 'Half-day guided city tour',
        notes: '',
      },
      {
        title: 'Gardens by the Bay',
        paragraphs: [
          'After breakfast, travel to Gardens by the Bay. Visit the Flower Dome and Cloud Forest. Allow time to explore the outdoor gardens independently.',
          'Return to the hotel at a pre-arranged time or make your own way back.',
        ],
        transfers: 'Private transfer to and from Gardens by the Bay',
        experience: 'Flower Dome and Cloud Forest admission',
        notes: '',
      },
      {
        title: 'Universal Studios Singapore',
        paragraphs: [
          'After breakfast, travel to Resorts World Sentosa for a full day at Universal Studios Singapore. Explore the park at your own pace and return to the hotel by private transfer in the evening.',
        ],
        transfers: 'Private hotel-to-Sentosa and return transfer',
        experience: 'One-day standard admission ticket',
        notes: 'Ride access and operating hours are determined by the attraction.',
      },
      {
        title: 'Leisure day',
        paragraphs: [
          'Enjoy breakfast at the hotel. The day is free for shopping, dining or independent sightseeing.',
          'Optional experiences can be arranged on request, subject to availability and additional cost.',
        ],
        transfers: 'Not included',
        experience: '',
        notes: '',
      },
    ];
  } else if (lower.includes('dubai') || lower.includes('uae')) {
    middleTemplates = [
      {
        title: 'Dubai city highlights & Burj Khalifa',
        paragraphs: [
          'After breakfast, meet the driver and guide for a half-day city tour covering historic Dubai Creek, Jumeirah landmarks, and Downtown Dubai.',
          'Proceed to Burj Khalifa for observation deck views before returning to the hotel.',
        ],
        transfers: 'Hotel pick-up and drop-off for the city tour',
        experience: 'Half-day guided Dubai city tour and Burj Khalifa admission',
        notes: '',
      },
      {
        title: 'Desert Safari & Arabian Dune Experience',
        paragraphs: [
          'Enjoy breakfast and a relaxed morning at the hotel. In the afternoon, depart by 4x4 vehicle into the desert conservation dunes.',
          'Experience sunset views, cultural performances, and a barbecue dinner at the desert camp before returning to the hotel.',
        ],
        transfers: '4x4 desert safari pick-up and drop-off',
        experience: 'Evening desert safari with camp dinner',
        notes: 'Dune drive participation is subject to guest comfort and safety guidelines.',
      },
      {
        title: 'Palm Jumeirah & Marina Dhow Cruise',
        paragraphs: [
          'After breakfast, explore the Palm Jumeirah boardwalk and Marina district. In the evening, board a traditional wooden dhow for a scenic dinner cruise along Dubai Marina.',
        ],
        transfers: 'Private round-trip transfer to Dubai Marina',
        experience: 'Dubai Marina evening cruise with dinner',
        notes: '',
      },
    ];
  } else if (lower.includes('paris') || lower.includes('france')) {
    middleTemplates = [
      {
        title: 'Paris city landmarks & Seine cruise',
        paragraphs: [
          'After breakfast, meet your driver and guide for a half-day panoramic tour of Paris, including the Champs-Elysees, Arc de Triomphe, and Eiffel Tower quarter.',
          'Enjoy a scenic river cruise along the Seine before returning to the hotel.',
        ],
        transfers: 'Private vehicle for the city tour and river pier transfer',
        experience: 'Half-day guided Paris tour and Seine river cruise',
        notes: '',
      },
      {
        title: 'Louvre Museum & Montmartre',
        paragraphs: [
          'After breakfast, transfer to the Louvre Museum to view celebrated art collections with reserved timed-entry admission.',
          'Continue to Montmartre and Sacre-Coeur Basilica before returning to the hotel.',
        ],
        transfers: 'Private transfers to the Louvre and Montmartre',
        experience: 'Louvre Museum timed-entry admission',
        notes: '',
      },
      {
        title: 'Palace of Versailles excursion',
        paragraphs: [
          'After breakfast, travel by private vehicle to the Palace of Versailles. Explore the Hall of Mirrors, Royal Apartments, and landscaped gardens.',
        ],
        transfers: 'Private round-trip transfer to Versailles',
        experience: 'Palace and Gardens of Versailles admission',
        notes: '',
      },
    ];
  } else {
    middleTemplates = [
      {
        title: `${destination} city & cultural highlights`,
        paragraphs: [
          `After breakfast, meet the driver and guide for a half-day discovery tour of ${destination}. Visit signature landmarks, cultural districts, and scenic viewpoints, subject to traffic and operating conditions.`,
          'Return to the hotel. Afternoon at leisure.',
        ],
        transfers: `Hotel pick-up and drop-off for the ${destination} city tour`,
        experience: `Half-day guided ${destination} tour`,
        notes: '',
      },
      {
        title: `Signature ${destination} attractions`,
        paragraphs: [
          `After breakfast, proceed by private transfer to visit ${destination}'s celebrated heritage sites, botanical gardens, or scenic observation points.`,
          'Return to the hotel at a pre-arranged time.',
        ],
        transfers: `Private transfer to and from ${destination} attractions`,
        experience: `Featured ${destination} attraction admission`,
        notes: '',
      },
      {
        title: `Full-day ${destination} excursion`,
        paragraphs: [
          `After breakfast, embark on a full-day curated excursion exploring the premier scenic and leisure highlights of ${destination}, returning to the hotel by private vehicle in the evening.`,
        ],
        transfers: 'Private round-trip excursion transfer',
        experience: `Full-day ${destination} experience admission`,
        notes: 'Attraction operating hours are subject to local schedules.',
      },
      {
        title: 'Leisure day',
        paragraphs: [
          `Enjoy breakfast at the hotel. The day is free for shopping, dining or independent sightseeing in ${destination}.`,
          'Optional experiences can be arranged on request, subject to availability and additional cost.',
        ],
        transfers: 'Not included',
        experience: '',
        notes: '',
      },
    ];
  }

  const airportName = lower.includes('singapore') ? 'Singapore Changi Airport' : `${destination} Airport`;

  for (let d = 1; d <= durationDays; d++) {
    const dateLabel = formatDayDateLabel(startDate, d - 1);
    if (d === 1) {
      days.push({
        dayNumber: 1,
        dateLabel,
        title: `Arrive in ${destination}`,
        paragraphs: [
          `Arrive at ${airportName}. Meet the transfer representative at the designated arrival point and proceed by private vehicle to the hotel.`,
          'After check-in, the remainder of the day is at leisure.',
        ],
        overnight: destination,
        meals: 'None',
        transfers: 'Private airport-to-hotel transfer',
        experience: '',
        notes: "Hotel check-in is subject to the property's standard check-in time.",
      });
    } else if (d === durationDays) {
      days.push({
        dayNumber: d,
        dateLabel,
        title: 'Departure',
        paragraphs: [
          `After breakfast, check out and meet the driver for a private transfer to ${airportName} for your onward flight.`,
        ],
        overnight: '',
        meals: 'Breakfast',
        transfers: 'Private hotel-to-airport transfer',
        experience: '',
        notes: 'Departure transfer timing will be confirmed against the flight schedule.',
      });
    } else {
      const tpl = middleTemplates[(d - 2) % middleTemplates.length];
      days.push({
        dayNumber: d,
        dateLabel,
        title: tpl.title,
        paragraphs: [...tpl.paragraphs],
        overnight: destination,
        meals: 'Breakfast',
        transfers: tpl.transfers,
        experience: tpl.experience,
        notes: tpl.notes,
      });
    }
  }

  return days;
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
        overnight: destination,
        meals: dNum === 1 ? 'None' : 'Breakfast',
        transfers:
          dNum === 1
            ? 'Private airport-to-hotel transfer'
            : 'Private sightseeing transfers as specified',
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

  // Resolve final durationDays based on options or parsed days
  const finalDurationDays = durationDays || (days.length > 0 ? days.length : 6);
  const finalDurationNights = Math.max(1, finalDurationDays - 1);

  // If no days were parsed from text, dynamically generate days for the actual destination
  if (days.length === 0) {
    const generatedDays = buildDynamicDaysForDestination(destination, finalDurationDays, startDate);
    days.push(...generatedDays);
  } else {
    const lastDay = days[days.length - 1];
    if (lastDay && lastDay.dayNumber === finalDurationDays && lastDay.title.toLowerCase().includes('departure')) {
      lastDay.overnight = '';
      if (!lastDay.notes) {
        lastDay.notes = 'Departure transfer timing will be confirmed against the flight schedule.';
      }
    }
  }

  const adults = options.headcountAdults || 2;
  const children = options.headcountChildren || 0;
  const hotelCategoryDesc = humanizeHotelTier(options.hotelTier, destination);
  const mealPlanDesc =
    options.mealPlan ||
    overviewKeyVal['meal plan'] ||
    overviewKeyVal['meals'] ||
    accommodationKeyVal['meal plan'] ||
    'Daily breakfast';

  // Dynamic Overview Paragraph
  let overviewParagraph = overviewParagraphs.join(' ');
  if (!overviewParagraph) {
    const highlightTitles = days
      .slice(1, Math.max(2, days.length - 1))
      .map((d) => d.title)
      .filter((t) => !t.toLowerCase().includes('leisure') && !t.toLowerCase().includes('departure'));
    const highlightsSummary =
      highlightTitles.length > 0
        ? highlightTitles.slice(0, 3).join(', ')
        : `curated sightseeing and local cultural experiences`;
    overviewParagraph = `A ${numberToWords(finalDurationDays).toLowerCase()}-day ${destination} holiday combining ${highlightsSummary}. The plan includes private airport transfers and time for independent exploration.`;
  }

  // Dynamic Overview Table Rows
  const roomDesc =
    children > 0
      ? `${finalDurationNights} nights in a Family / Double Room (${adults} adults, ${children} children)`
      : adults === 1
      ? `${finalDurationNights} nights in a Luxury Room / Villa (Single Occupancy)`
      : `${finalDurationNights} nights in a Standard Double Room`;

  const overviewTableRows: Array<[string, string]> = [
    ['Destination', overviewKeyVal['destination'] || destination],
    ['Duration', overviewKeyVal['duration'] || `${finalDurationDays} days / ${finalDurationNights} nights`],
    [
      'Hotel plan',
      overviewKeyVal['hotel plan'] ||
        overviewKeyVal['accommodation'] ||
        overviewKeyVal['hotel'] ||
        accommodationKeyVal['room category'] ||
        roomDesc,
    ],
    ['Meal plan', mealPlanDesc],
    [
      'Transfers',
      overviewKeyVal['transfers'] ||
        overviewKeyVal['transport'] ||
        overviewKeyVal['ground transport'] ||
        'Private airport transfers; sightseeing transfers as specified',
    ],
    [
      'Flights',
      overviewKeyVal['flights'] ||
        overviewKeyVal['flight scope'] ||
        overviewKeyVal['airfare'] ||
        'Not included in this proposal',
    ],
    ['Pace', overviewKeyVal['pace'] || 'Moderate, with one leisure period'],
  ];

  // Dynamic Recorded Requirements
  if (recordedRequirements.length === 0) {
    const partyLine =
      children > 0
        ? `${numberToWords(adults)} adults and ${numberToWords(children).toLowerCase()} child${children > 1 ? 'ren' : ''} travelling together.`
        : adults === 1
        ? 'One adult (solo traveller).'
        : `${numberToWords(adults)} adults travelling together.`;
    recordedRequirements.push(
      partyLine,
      options.specialRequests
        ? `Requested experiences and preferences: ${sanitizePdfText(options.specialRequests)}.`
        : `Interest in city sightseeing, gardens and family-friendly attractions in ${destination}.`,
      `Preference for a centrally located hotel (${hotelCategoryDesc}) and private airport transfers.`,
      `${mealPlanDesc} requested.`,
      'No dietary, accessibility or special occasion requirements recorded.'
    );
  }

  // Dynamic To Confirm Before Booking
  if (toConfirmItems.length === 0) {
    toConfirmItems.push(
      'Preferred airline and baggage allowance',
      'Hotel room and bed preference',
      'Dietary or accessibility needs',
      'Attraction preferences',
      'Passport details and final travel dates'
    );
  }

  // Dynamic Accommodation Rows
  const stayRangeFromTable =
    accommodationKeyVal['check-in'] && accommodationKeyVal['check-out']
      ? `${accommodationKeyVal['check-in']} – ${accommodationKeyVal['check-out']}`
      : undefined;

  const accommodationRows: Array<[string, string]> = [
    [
      'Hotel category',
      accommodationKeyVal['hotel category'] ||
        accommodationKeyVal['sample hotel category'] ||
        accommodationKeyVal['category'] ||
        hotelCategoryDesc,
    ],
    ['Stay', accommodationKeyVal['stay'] || stayRangeFromTable || travelDates],
    [
      'Room',
      accommodationKeyVal['room'] ||
        accommodationKeyVal['room category'] ||
        overviewKeyVal['accommodation'] ||
        `Standard Double Room for ${adults} adult${adults > 1 ? 's' : ''}${children > 0 ? ` and ${children} child${children > 1 ? 'ren' : ''}` : ''}`,
    ],
    ['Meal plan', accommodationKeyVal['meal plan'] || overviewKeyVal['meal plan'] || 'Breakfast daily'],
    [
      'Hotel name',
      accommodationKeyVal['hotel name'] ||
        accommodationKeyVal['proposed hotel'] ||
        accommodationKeyVal['hotel'] ||
        'To be confirmed at booking',
    ],
  ];

  const alternativeAccommodationText = accommodationKeyVal['alternative options']
    ? `Alternative options: ${accommodationKeyVal['alternative options']}. A hotel of similar category and location may be offered if the selected property is unavailable. Any change will be shared for approval before confirmation.`
    : 'A hotel of similar category and location may be offered if the selected property is unavailable. Any change will be shared for approval before confirmation.';

  // Dynamic Inclusions derived from actual itinerary days if not explicitly provided
  if (inclusions.length === 0) {
    const orgLabel = options.organizationName || 'LGT Holidays';
    inclusions.push(
      `${numberToWords(finalDurationNights)} nights' accommodation in the stated room category.`,
      'Daily breakfast at the hotel.',
      'Private arrival and departure airport transfers.'
    );

    for (const d of days) {
      if (d.experience && !inclusions.some((inc) => inc.toLowerCase().includes(d.experience.toLowerCase()))) {
        inclusions.push(`${d.experience} (${d.title}).`);
      } else if (
        d.transfers &&
        !d.transfers.toLowerCase().includes('not included') &&
        !d.transfers.toLowerCase().includes('airport') &&
        !inclusions.some((inc) => inc.toLowerCase().includes(d.transfers.toLowerCase()))
      ) {
        inclusions.push(`${d.transfers}.`);
      }
    }

    inclusions.push(
      `Local assistance from the ${orgLabel} team during the trip, using the contact details provided in the final travel documents.`
    );
  }

  // Dynamic Exclusions tailored to destination
  if (exclusions.length === 0) {
    exclusions.push(
      'International airfare and airline-related charges.',
      `${destination} entry visa or other travel authorisations, if required.`,
      'Meals and beverages not listed under inclusions.',
      'Optional tours, activities and personal expenses.',
      'Early check-in, late check-out and room upgrades.',
      'Travel insurance.',
      'Tips, porterage and other discretionary payments.',
      'Any service not expressly listed under "Package Includes."'
    );
  }

  // Dynamic Important Travel Information
  if (importantInfo.length === 0) {
    importantInfo.push(
      "Passports must meet the entry requirements applicable to the traveller's nationality and travel dates.",
      'Entry permission is determined by the relevant authorities. Travellers are responsible for carrying required travel documents.',
      'Attraction visits, transport arrangements and operating hours may change due to weather, traffic, maintenance or supplier operations.',
      'Guests should share any mobility, medical, dietary or other assistance requirements before booking.',
      'Final hotel, transfer, flight and attraction details will be stated in the confirmed travel documents.'
    );
  }

  // Dynamic Before Travel Checklist
  if (beforeTravelItems.length === 0) {
    beforeTravelItems.push(
      'Full names as shown on passports.',
      'Passport nationality and expiry details.',
      'Final flight itinerary and baggage requirements.',
      'Room and bed preference.',
      'Dietary, accessibility or medical requirements.',
      'Emergency contact details.',
      'Acceptance of the final quotation and applicable booking terms.'
    );
  }

  // Dynamic Prepared & Valid Until Dates
  const prepDateObj = options.preparedDate ? new Date(options.preparedDate) : new Date();
  const safePrepDate = isNaN(prepDateObj.getTime()) ? new Date() : prepDateObj;
  const preparedDateStr = formatCalendarDate(safePrepDate);

  let validUntilDateStr: string;
  if (options.validUntilDate) {
    const vd = new Date(options.validUntilDate);
    validUntilDateStr = !isNaN(vd.getTime()) ? formatCalendarDate(vd) : formatCalendarDate(new Date(safePrepDate.getTime() + 5 * 86400000));
  } else {
    const validDt = new Date(safePrepDate.getTime() + 5 * 86400000);
    validUntilDateStr = formatCalendarDate(validDt);
  }

  const orgName = options.organizationName || 'LGT Holidays';
  const paymentScheduleText = `To be provided in the final quotation in line with ${orgName}'s approved payment terms.`;
  const cancellationTermsText = `Supplier-specific charges and ${orgName}'s approved terms will be provided before booking confirmation.`;
  const quoteValidityText = `This illustrative quote is valid until ${validUntilDateStr}. Rates and availability must be reconfirmed after this date.`;

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
 * Generates an executive FIT travel proposal & itinerary PDF
 * matching the minimal design of LGT_Holidays_Singapore_Minimal_Design.pdf,
 * applying the exact PDF Header & Theme configured in Settings across every page,
 * with 100% dynamic content and zero overlapping elements.
 */
export async function generateItineraryPDF(options: PDFOptions): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontGeist = await getGeistFont(pdfDoc);

  const brand = hexToRgb(options.brandColor);
  const brandColor = rgb(brand.r, brand.g, brand.b);
  const brandTintHeader = rgb(
    Math.min(1, brand.r * 0.08 + 0.92),
    Math.min(1, brand.g * 0.08 + 0.92),
    Math.min(1, brand.b * 0.08 + 0.92)
  );
  const charcoal = rgb(0.118, 0.125, 0.133); // #1e2022
  const muted = rgb(0.36, 0.38, 0.41); // #5c6169
  const tableOuterBorder = rgb(0.87, 0.885, 0.905); // #dee2e7
  const tableDividerDark = rgb(0.18, 0.2, 0.22); // #2e3338
  const white = rgb(1, 1, 1);

  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 42;
  const contentWidth = pageWidth - margin * 2; // 511.28

  const parsed = parseItineraryContent(options.itineraryText, options);
  const [logoImg, letterheadImg] = await Promise.all([
    tryEmbedImage(pdfDoc, options.organizationLogo),
    tryEmbedImage(pdfDoc, options.organizationLetterhead),
  ]);

  const orgName = options.organizationName || 'LGT Holidays';
  const orgSubCaption = options.organizationLetterheadText || `A brand of ${orgName}`;
  const footerOrgLabel = orgSubCaption.includes('LGT Global Hospitality Limited')
    ? 'LGT Global Hospitality Limited'
    : orgName;

  const adults = options.headcountAdults || 2;
  const children = options.headcountChildren || 0;
  const totalTravellers = adults + children;

  const hasBudget =
    options.targetBudget !== undefined &&
    options.targetBudget !== null &&
    options.targetBudget !== '' &&
    Number(options.targetBudget) > 0;
  const rawBudget = hasBudget ? Number(options.targetBudget) : null;
  const totalBudgetFormatted = rawBudget ? `₹${rawBudget.toLocaleString('en-IN')}` : 'Package price: To be confirmed';
  const perAdultBudget = rawBudget ? Math.round(rawBudget / Math.max(1, totalTravellers)) : null;
  const perAdultFormatted = perAdultBudget ? `₹${perAdultBudget.toLocaleString('en-IN')}` : 'To be confirmed';

  const bookingRef = options.bookingReference || `FIT/${new Date().getFullYear()}/1042`;
  const headerBadgeText =
    options.recipientType === 'supplier' ? 'SUPPLIER RFQ' : 'CONFIDENTIAL ITINERARY';

  // Inner page header (Settings PDF Header & Theme + Section Title) & Bottom Footer
  const drawInnerPageChrome = (page: any, pageTitle: string, currentPageNum: number): number => {
    const afterHeaderY = drawSettingsConfiguredHeader({
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
      badgeText: headerBadgeText,
      subRightText: `Page ${String(currentPageNum).padStart(2, '0')} • ${parsed.preparedDateStr}`,
    });

    const titleLines = wrapText(pageTitle, contentWidth, fontBold, 24);
    let titleY = afterHeaderY - 4;
    for (const tLine of titleLines) {
      drawSafeText(page, tLine, {
        x: margin,
        y: titleY,
        size: 24,
        fontRegular,
        fontBold,
        fontGeist,
        color: charcoal,
        isBold: true,
      });
      titleY -= 29;
    }

    drawSettingsConfiguredFooter({
      page,
      pageWidth,
      margin,
      footerLeftText: footerOrgLabel,
      pageNum: currentPageNum,
      fontRegular,
      fontBold,
      fontGeist,
      brandColor,
      muted,
    });

    return titleY - 14;
  };

  // Dynamic non-overlapping 2-column table with Brand Theme accent
  const drawDynamicTable = (
    page: any,
    startY: number,
    col1Header: string,
    col2Header: string,
    col1Width: number,
    rows: Array<[string, string]>,
    boldCol1 = false
  ): number => {
    let curY = startY;
    const col2Width = contentWidth - col1Width;
    const cellPadX = 12;
    const fontSize = 11;
    const lineHeight = 15.5;

    // Header row tinted with Settings brandColor
    const headerH = 28;
    page.drawRectangle({
      x: margin,
      y: curY - headerH,
      width: contentWidth,
      height: headerH,
      color: brandTintHeader,
      borderColor: brandColor,
      borderWidth: 0.8,
    });
    page.drawLine({
      start: { x: margin + col1Width, y: curY },
      end: { x: margin + col1Width, y: curY - headerH },
      thickness: 0.8,
      color: brandColor,
    });
    page.drawLine({
      start: { x: margin, y: curY - headerH },
      end: { x: margin + contentWidth, y: curY - headerH },
      thickness: 1,
      color: brandColor,
    });

    drawSafeText(page, col1Header, {
      x: margin + cellPadX,
      y: curY - 18,
      size: 10,
      fontRegular,
      fontBold,
      fontGeist,
      color: brandColor,
      isBold: true,
    });
    drawSafeText(page, col2Header, {
      x: margin + col1Width + cellPadX,
      y: curY - 18,
      size: 10,
      fontRegular,
      fontBold,
      fontGeist,
      color: brandColor,
      isBold: true,
    });

    curY -= headerH;

    for (let rIdx = 0; rIdx < rows.length; rIdx++) {
      const [c1Text, c2Text] = rows[rIdx];
      const c1Lines = wrapText(c1Text, col1Width - cellPadX * 2, boldCol1 ? fontBold : fontRegular, fontSize);
      const c2Lines = wrapText(c2Text, col2Width - cellPadX * 2, fontRegular, fontSize);
      const maxLines = Math.max(1, c1Lines.length, c2Lines.length);
      const rowH = Math.max(33, maxLines * lineHeight + 16);

      page.drawRectangle({
        x: margin,
        y: curY - rowH,
        width: contentWidth,
        height: rowH,
        color: white,
        borderColor: tableOuterBorder,
        borderWidth: 0.75,
      });

      page.drawLine({
        start: { x: margin + col1Width, y: curY },
        end: { x: margin + col1Width, y: curY - rowH },
        thickness: 0.8,
        color: tableDividerDark,
      });

      if (rIdx < rows.length - 1) {
        page.drawLine({
          start: { x: margin, y: curY - rowH },
          end: { x: margin + contentWidth, y: curY - rowH },
          thickness: 0.8,
          color: tableDividerDark,
        });
      }

      const c1BlockH = c1Lines.length * lineHeight;
      let c1Y = curY - (rowH - c1BlockH) / 2 - fontSize + 2;
      for (const line of c1Lines) {
        drawSafeText(page, line, {
          x: margin + cellPadX,
          y: c1Y,
          size: fontSize,
          fontRegular,
          fontBold,
          fontGeist,
          color: charcoal,
          isBold: boldCol1,
        });
        c1Y -= lineHeight;
      }

      const c2BlockH = c2Lines.length * lineHeight;
      let c2Y = curY - (rowH - c2BlockH) / 2 - fontSize + 2;
      for (const line of c2Lines) {
        drawSafeText(page, line, {
          x: margin + col1Width + cellPadX,
          y: c2Y,
          size: fontSize,
          fontRegular,
          fontBold,
          fontGeist,
          color: charcoal,
        });
        c2Y -= lineHeight;
      }

      curY -= rowH;
    }

    return curY;
  };

  // Dynamic non-overlapping numbered list renderer themed with brandColor
  const drawNumberedList = (
    page: any,
    startY: number,
    items: string[],
    fontSize = 12,
    lineHeight = 17.5,
    itemGap = 15
  ): number => {
    let curY = startY;
    const textIndent = 38;
    const maxTextWidth = contentWidth - textIndent;

    for (let idx = 0; idx < items.length; idx++) {
      const numStr = String(idx + 1).padStart(2, '0');
      const wrapped = wrapText(items[idx], maxTextWidth, fontRegular, fontSize);
      const blockH = Math.max(1, wrapped.length) * lineHeight;

      if (curY - blockH < 50) {
        break;
      }

      drawSafeText(page, numStr, {
        x: margin,
        y: curY,
        size: 10.5,
        fontRegular,
        fontBold,
        fontGeist,
        color: brandColor,
        isBold: true,
      });

      let lineY = curY;
      for (const wLine of wrapped) {
        drawSafeText(page, wLine, {
          x: margin + textIndent,
          y: lineY,
          size: fontSize,
          fontRegular,
          fontBold,
          fontGeist,
          color: charcoal,
        });
        lineY -= lineHeight;
      }

      curY = lineY - itemGap + (lineHeight - fontSize);
    }

    return curY;
  };

  let pageNum = 1;

  // ─────────────────────────────────────────────────────────────
  // PAGE 1: COVER PAGE (Uses Configured Settings PDF Header & Theme)
  // ─────────────────────────────────────────────────────────────
  const pCover = pdfDoc.addPage([pageWidth, pageHeight]);
  let coverY = drawSettingsConfiguredHeader({
    page: pCover,
    pageWidth,
    pageHeight,
    margin,
    options,
    logoImg,
    letterheadImg,
    fontRegular,
    fontBold,
    fontGeist,
    badgeText: headerBadgeText,
    subRightText: `Date: ${parsed.preparedDateStr}`,
  });

  coverY -= 55;
  const proposalTag =
    options.recipientType === 'supplier'
      ? 'SUPPLIER QUOTATION REQUEST & ITINERARY'
      : 'FIT TRAVEL PROPOSAL & ITINERARY';

  drawSafeText(pCover, proposalTag, {
    x: margin,
    y: coverY,
    size: 11,
    fontRegular,
    fontBold,
    fontGeist,
    color: brandColor,
    isBold: true,
  });

  coverY -= 54;
  const destSize = parsed.destination.length > 24 ? 30 : 38;
  const destLines = wrapText(parsed.destination, contentWidth, fontBold, destSize);
  for (const dLine of destLines) {
    drawSafeText(pCover, dLine, {
      x: margin,
      y: coverY,
      size: destSize,
      fontRegular,
      fontBold,
      fontGeist,
      color: charcoal,
      isBold: true,
    });
    coverY -= destSize + 10;
  }

  coverY -= 12;
  drawSafeText(pCover, `${parsed.durationDays} Days / ${parsed.durationNights} Nights`, {
    x: margin,
    y: coverY,
    size: 19,
    fontRegular,
    fontBold,
    fontGeist,
    color: charcoal,
  });

  coverY -= 36;
  const dateLines = wrapText(parsed.travelDates, contentWidth, fontRegular, 14);
  for (const dtLine of dateLines) {
    drawSafeText(pCover, dtLine, {
      x: margin,
      y: coverY,
      size: 14,
      fontRegular,
      fontBold,
      fontGeist,
      color: muted,
    });
    coverY -= 20;
  }

  coverY -= 50;
  drawSafeText(pCover, 'Prepared for', {
    x: margin,
    y: coverY,
    size: 14,
    fontRegular,
    fontBold,
    fontGeist,
    color: charcoal,
  });

  coverY -= 26;
  const guestName = resolveCustomerNameForPdf(options, options.itineraryText);
  const guestLines = wrapText(guestName, contentWidth, fontBold, 16);
  for (const gLine of guestLines) {
    drawSafeText(pCover, gLine, {
      x: margin,
      y: coverY,
      size: 16,
      fontRegular,
      fontBold,
      fontGeist,
      color: charcoal,
      isBold: true,
    });
    coverY -= 22;
  }

  // Bottom-left company note
  drawSafeText(pCover, orgName, {
    x: margin,
    y: 165,
    size: 10,
    fontRegular,
    fontBold,
    fontGeist,
    color: muted,
  });

  const subCapLines = wrapText(orgSubCaption, contentWidth, fontRegular, 10);
  let subCapY = 149;
  for (const scLine of subCapLines.slice(0, 2)) {
    drawSafeText(pCover, scLine, {
      x: margin,
      y: subCapY,
      size: 10,
      fontRegular,
      fontBold,
      fontGeist,
      color: muted,
    });
    subCapY -= 15;
  }

  drawSettingsConfiguredFooter({
    page: pCover,
    pageWidth,
    margin,
    footerLeftText: footerOrgLabel,
    pageNum: pageNum++,
    fontRegular,
    fontBold,
    fontGeist,
    brandColor,
    muted,
  });

  // ─────────────────────────────────────────────────────────────
  // PAGE 2: TRIP OVERVIEW
  // ─────────────────────────────────────────────────────────────
  const pOverview = pdfDoc.addPage([pageWidth, pageHeight]);
  let ovY = drawInnerPageChrome(pOverview, 'Trip overview', pageNum++);

  const introLines = wrapText(parsed.overviewParagraph, contentWidth, fontRegular, 12.5);
  for (const line of introLines) {
    drawSafeText(pOverview, line, {
      x: margin,
      y: ovY,
      size: 12.5,
      fontRegular,
      fontBold,
      fontGeist,
      color: charcoal,
    });
    ovY -= 18.5;
  }

  ovY -= 14;
  const afterOvTableY = drawDynamicTable(
    pOverview,
    ovY,
    'Item',
    'Details',
    165,
    parsed.overviewTableRows,
    false
  );

  const metaStartY = Math.min(afterOvTableY - 28, 125);
  drawSafeText(pOverview, `Proposal: ${bookingRef}`, {
    x: margin,
    y: metaStartY,
    size: 10,
    fontRegular,
    fontBold,
    fontGeist,
    color: muted,
  });
  drawSafeText(pOverview, `Prepared: ${parsed.preparedDateStr}`, {
    x: margin,
    y: metaStartY - 16,
    size: 10,
    fontRegular,
    fontBold,
    fontGeist,
    color: muted,
  });
  drawSafeText(pOverview, `Valid until: ${parsed.validUntilDateStr}`, {
    x: margin,
    y: metaStartY - 32,
    size: 10,
    fontRegular,
    fontBold,
    fontGeist,
    color: muted,
  });

  // ─────────────────────────────────────────────────────────────
  // PAGE 3: GUEST PREFERENCES
  // ─────────────────────────────────────────────────────────────
  const pPref = pdfDoc.addPage([pageWidth, pageHeight]);
  let prefY = drawInnerPageChrome(pPref, 'Guest preferences', pageNum++);

  drawSafeText(pPref, 'Recorded requirements', {
    x: margin,
    y: prefY,
    size: 14.5,
    fontRegular,
    fontBold,
    fontGeist,
    color: brandColor,
    isBold: true,
  });

  prefY -= 28;
  prefY = drawNumberedList(pPref, prefY, parsed.recordedRequirements.slice(0, 6), 12, 17.5, 14);

  prefY -= 14;
  drawSafeText(pPref, 'To confirm before booking', {
    x: margin,
    y: prefY,
    size: 14.5,
    fontRegular,
    fontBold,
    fontGeist,
    color: brandColor,
    isBold: true,
  });

  prefY -= 26;
  for (const item of parsed.toConfirmItems) {
    const itemLines = wrapText(item, contentWidth, fontRegular, 12);
    for (const iLine of itemLines) {
      if (prefY < 50) break;
      drawSafeText(pPref, iLine, {
        x: margin,
        y: prefY,
        size: 12,
        fontRegular,
        fontBold,
        fontGeist,
        color: charcoal,
      });
      prefY -= 17;
    }
    prefY -= 8;
  }

  // ─────────────────────────────────────────────────────────────
  // PAGES 4 to (3 + N): DAILY ITINERARY (1 Page Per Day, Zero Overlap)
  // ─────────────────────────────────────────────────────────────
  for (let i = 0; i < parsed.days.length; i++) {
    const day = parsed.days[i];
    const pD = pdfDoc.addPage([pageWidth, pageHeight]);
    const dayStartY = drawInnerPageChrome(pD, `Day ${day.dayNumber}`, pageNum++);

    const dStr = String(day.dayNumber).padStart(2, '0');

    // Giant Numeral colored with Settings brandColor (matches Settings "Day 01 Format" preview)
    const numeralY = dayStartY - 34;
    drawSafeText(pD, dStr, {
      x: margin,
      y: numeralY,
      size: 48,
      fontRegular,
      fontBold,
      fontGeist,
      color: brandColor,
      isBold: true,
    });

    // Dynamic Date beside numeral
    const dateText = day.dateLabel || `Day ${day.dayNumber}`;
    drawSafeText(pD, dateText, {
      x: margin + 98,
      y: numeralY + 26,
      size: 12.5,
      fontRegular,
      fontBold,
      fontGeist,
      color: muted,
    });

    // Day Title (wrapped cleanly so long titles never overflow or collide)
    let dy = numeralY - 52;
    const dayTitleLines = wrapText(day.title, contentWidth, fontBold, 20);
    for (const dtLine of dayTitleLines) {
      drawSafeText(pD, dtLine, {
        x: margin,
        y: dy,
        size: 20,
        fontRegular,
        fontBold,
        fontGeist,
        color: charcoal,
        isBold: true,
      });
      dy -= 26;
    }

    dy -= 14;

    // Main Programme Paragraphs (bounded above y = 250 so they never collide with notes or metadata)
    for (const para of day.paragraphs) {
      const plines = wrapText(para, contentWidth, fontRegular, 13);
      for (const pl of plines) {
        if (dy < 250) break;
        drawSafeText(pD, pl, {
          x: margin,
          y: dy,
          size: 13,
          fontRegular,
          fontBold,
          fontGeist,
          color: charcoal,
        });
        dy -= 19;
      }
      dy -= 11;
    }

    // Bottom section: Operational Note + 2-Column Metadata Grid
    let gridTopY = 185;
    if (day.notes) {
      const noteLines = wrapText(day.notes, contentWidth, fontRegular, 10.5);
      let noteY = Math.min(dy - 8, 235);
      for (const nLine of noteLines) {
        drawSafeText(pD, nLine, {
          x: margin,
          y: noteY,
          size: 10.5,
          fontRegular,
          fontBold,
          fontGeist,
          color: muted,
        });
        noteY -= 14.5;
      }
      gridTopY = Math.min(gridTopY, noteY - 16);
    }

    // Build active metadata cells (omitting empty fields so Departure Day has MEALS left, TRANSFERS right)
    const metaCells: Array<{ label: string; value: string }> = [];
    if (day.overnight && day.overnight.trim()) {
      metaCells.push({ label: 'OVERNIGHT', value: day.overnight.trim() });
    }
    if (day.meals && day.meals.trim()) {
      metaCells.push({ label: 'MEALS', value: day.meals.trim() });
    }
    if (day.transfers && day.transfers.trim()) {
      metaCells.push({ label: 'TRANSFERS', value: day.transfers.trim() });
    }
    if (day.experience && day.experience.trim()) {
      metaCells.push({ label: 'INCLUDED EXPERIENCE', value: day.experience.trim() });
    }

    const col1X = margin;
    const col2X = margin + 260;
    const colMaxWidth = 235;

    let rowY = gridTopY;
    for (let r = 0; r < metaCells.length; r += 2) {
      const leftCell = metaCells[r];
      const rightCell = metaCells[r + 1];

      let leftLines: string[] = [];
      let rightLines: string[] = [];

      if (leftCell) {
        drawSafeText(pD, leftCell.label, {
          x: col1X,
          y: rowY,
          size: 8.5,
          fontRegular,
          fontBold,
          fontGeist,
          color: brandColor,
          isBold: true,
        });
        leftLines = wrapText(leftCell.value, colMaxWidth, fontRegular, 12);
        let ly = rowY - 18;
        for (const lLine of leftLines) {
          drawSafeText(pD, lLine, {
            x: col1X,
            y: ly,
            size: 12,
            fontRegular,
            fontBold,
            fontGeist,
            color: charcoal,
          });
          ly -= 16;
        }
      }

      if (rightCell) {
        drawSafeText(pD, rightCell.label, {
          x: col2X,
          y: rowY,
          size: 8.5,
          fontRegular,
          fontBold,
          fontGeist,
          color: brandColor,
          isBold: true,
        });
        rightLines = wrapText(rightCell.value, colMaxWidth, fontRegular, 12);
        let ry = rowY - 18;
        for (const rLine of rightLines) {
          drawSafeText(pD, rLine, {
            x: col2X,
            y: ry,
            size: 12,
            fontRegular,
            fontBold,
            fontGeist,
            color: charcoal,
          });
          ry -= 16;
        }
      }

      const maxRowLines = Math.max(1, leftLines.length, rightLines.length);
      rowY -= 18 + maxRowLines * 16 + 16;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // PAGE (4 + N): ACCOMMODATION
  // ─────────────────────────────────────────────────────────────
  const pAcc = pdfDoc.addPage([pageWidth, pageHeight]);
  let accY = drawInnerPageChrome(pAcc, 'Accommodation', pageNum++);

  drawSafeText(pAcc, `${parsed.durationNights} nights in ${parsed.destination}`, {
    x: margin,
    y: accY,
    size: 17,
    fontRegular,
    fontBold,
    fontGeist,
    color: brandColor,
    isBold: true,
  });

  accY -= 28;
  accY = drawDynamicTable(
    pAcc,
    accY,
    'Stay details',
    'Proposed arrangement',
    165,
    parsed.accommodationRows,
    false
  );

  accY -= 36;
  drawSafeText(pAcc, 'Alternative accommodation', {
    x: margin,
    y: accY,
    size: 14,
    fontRegular,
    fontBold,
    fontGeist,
    color: charcoal,
    isBold: true,
  });

  const altLines = wrapText(parsed.alternativeAccommodationText, contentWidth, fontRegular, 12);
  accY -= 22;
  for (const line of altLines) {
    drawSafeText(pAcc, line, {
      x: margin,
      y: accY,
      size: 12,
      fontRegular,
      fontBold,
      fontGeist,
      color: muted,
    });
    accY -= 17;
  }

  // ─────────────────────────────────────────────────────────────
  // PAGE (5 + N): PACKAGE INCLUDES (Sample quotation sheet removed from Itinerary PDF)
  // ─────────────────────────────────────────────────────────────
  const pInc = pdfDoc.addPage([pageWidth, pageHeight]);
  const incStartY = drawInnerPageChrome(pInc, 'Package includes', pageNum++);
  drawNumberedList(pInc, incStartY - 4, parsed.inclusions, 12, 17.5, 16);

  // ─────────────────────────────────────────────────────────────
  // PAGE (7 + N): PACKAGE EXCLUDES
  // ─────────────────────────────────────────────────────────────
  const pExc = pdfDoc.addPage([pageWidth, pageHeight]);
  const excStartY = drawInnerPageChrome(pExc, 'Package excludes', pageNum++);
  drawNumberedList(pExc, excStartY - 4, parsed.exclusions, 12, 17.5, 16);

  // ─────────────────────────────────────────────────────────────
  // PAGE (8 + N): IMPORTANT TRAVEL INFORMATION
  // ─────────────────────────────────────────────────────────────
  const pInfo = pdfDoc.addPage([pageWidth, pageHeight]);
  const infoStartY = drawInnerPageChrome(pInfo, 'Important travel information', pageNum++);
  drawNumberedList(pInfo, infoStartY - 4, parsed.importantInfo, 12, 17.5, 18);

  // ─────────────────────────────────────────────────────────────
  // PAGE (9 + N): BOOKING AND PAYMENT
  // ─────────────────────────────────────────────────────────────
  const pBook = pdfDoc.addPage([pageWidth, pageHeight]);
  let bY = drawInnerPageChrome(pBook, 'Booking and payment', pageNum++);

  const bookIntro =
    'Services are subject to availability until confirmed by the relevant suppliers and payment is received.';
  const bookIntroLines = wrapText(bookIntro, contentWidth, fontRegular, 13.5);
  for (const bLine of bookIntroLines) {
    drawSafeText(pBook, bLine, {
      x: margin,
      y: bY,
      size: 13.5,
      fontRegular,
      fontBold,
      fontGeist,
      color: charcoal,
    });
    bY -= 20;
  }
  bY -= 28;

  const bookSections: Array<[string, string]> = [
    ['PAYMENT SCHEDULE', parsed.paymentScheduleText],
    ['CANCELLATION AND AMENDMENT TERMS', parsed.cancellationTermsText],
    ['QUOTE VALIDITY', parsed.quoteValidityText],
  ];

  for (const [title, desc] of bookSections) {
    drawSafeText(pBook, title, {
      x: margin,
      y: bY,
      size: 9,
      fontRegular,
      fontBold,
      fontGeist,
      color: brandColor,
      isBold: true,
    });
    bY -= 22;
    const lines = wrapText(desc, contentWidth, fontRegular, 12.5);
    for (const line of lines) {
      drawSafeText(pBook, line, {
        x: margin,
        y: bY,
        size: 12.5,
        fontRegular,
        fontBold,
        fontGeist,
        color: charcoal,
      });
      bY -= 18;
    }
    bY -= 28;
  }

  // ─────────────────────────────────────────────────────────────
  // PAGE (10 + N): BEFORE TRAVEL
  // ─────────────────────────────────────────────────────────────
  const pBefore = pdfDoc.addPage([pageWidth, pageHeight]);
  let bfY = drawInnerPageChrome(pBefore, 'Before travel', pageNum++);

  drawSafeText(pBefore, 'Please provide or confirm', {
    x: margin,
    y: bfY,
    size: 15,
    fontRegular,
    fontBold,
    fontGeist,
    color: brandColor,
  });

  bfY -= 32;
  drawNumberedList(pBefore, bfY, parsed.beforeTravelItems, 12, 17.5, 16);

  // ─────────────────────────────────────────────────────────────
  // PAGE (11 + N): ASSISTANCE DURING TRAVEL
  // ─────────────────────────────────────────────────────────────
  const pAssist = pdfDoc.addPage([pageWidth, pageHeight]);
  let asY = drawInnerPageChrome(pAssist, 'Assistance during travel', pageNum++);

  drawSafeText(pAssist, `${orgName} customer support`, {
    x: margin,
    y: asY,
    size: 15,
    fontRegular,
    fontBold,
    fontGeist,
    color: charcoal,
    isBold: true,
  });
  asY -= 42;

  const supportPhone = options.organizationPhone || '1800 202 0095';
  drawSafeText(pAssist, supportPhone, {
    x: margin,
    y: asY,
    size: 26,
    fontRegular,
    fontBold,
    fontGeist,
    color: brandColor,
    isBold: true,
  });
  asY -= 42;

  const supportEmail =
    options.consultantEmail ||
    (options.organizationWebsite
      ? `contact@${options.organizationWebsite.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0]}`
      : 'contact@lgtholidays.com');
  const supportWeb = options.organizationWebsite || 'www.lgtholidays.com';

  drawSafeText(pAssist, supportEmail, {
    x: margin,
    y: asY,
    size: 13.5,
    fontRegular,
    fontBold,
    fontGeist,
    color: charcoal,
  });
  asY -= 20;
  drawSafeText(pAssist, supportWeb, {
    x: margin,
    y: asY,
    size: 13.5,
    fontRegular,
    fontBold,
    fontGeist,
    color: charcoal,
  });
  asY -= 55;

  drawSafeText(pAssist, 'OPERATING HOURS', {
    x: margin,
    y: asY,
    size: 9,
    fontRegular,
    fontBold,
    fontGeist,
    color: brandColor,
    isBold: true,
  });
  asY -= 22;
  drawSafeText(pAssist, 'Monday to Saturday, 9:00 a.m. to 6:00 p.m.', {
    x: margin,
    y: asY,
    size: 13,
    fontRegular,
    fontBold,
    fontGeist,
    color: charcoal,
  });
  asY -= 48;

  drawSafeText(pAssist, 'AFTER-HOURS ASSISTANCE', {
    x: margin,
    y: asY,
    size: 9,
    fontRegular,
    fontBold,
    fontGeist,
    color: brandColor,
    isBold: true,
  });
  asY -= 22;
  drawSafeText(pAssist, 'To be confirmed before departure.', {
    x: margin,
    y: asY,
    size: 13,
    fontRegular,
    fontBold,
    fontGeist,
    color: charcoal,
  });

  // ─────────────────────────────────────────────────────────────
  // PAGE (12 + N): COMPANY DETAILS
  // ─────────────────────────────────────────────────────────────
  const pComp = pdfDoc.addPage([pageWidth, pageHeight]);
  let cY = drawInnerPageChrome(pComp, 'Company details', pageNum++);

  drawSafeText(pComp, orgName.toUpperCase(), {
    x: margin,
    y: cY,
    size: 20,
    fontRegular,
    fontBold,
    fontGeist,
    color: brandColor,
    isBold: true,
  });
  cY -= 25;

  const subCaptionWrapped = wrapText(orgSubCaption, contentWidth, fontRegular, 13);
  for (const scLine of subCaptionWrapped) {
    drawSafeText(pComp, scLine, {
      x: margin,
      y: cY,
      size: 13,
      fontRegular,
      fontBold,
      fontGeist,
      color: charcoal,
    });
    cY -= 19;
  }
  cY -= 26;

  const compDetails: Array<[string, string]> = [
    ['CIN', options.companyCin || 'L74999TN2016PLC112289'],
    ['GSTIN - TAMIL NADU', options.companyGstin || '33AADCL1457C1Z0'],
    ['PAN', options.companyPan || 'AADCL1457C'],
    ['CUSTOMER SUPPORT', supportPhone],
    [
      'REGISTERED & CORPORATE OFFICE',
      options.organizationAddress ||
        'No. 18/1 & 18/2 (18), First Cross Street, Brindavan Street Extension, West Mambalam, Chennai, Tamil Nadu 600033, India',
    ],
  ];

  for (const [lbl, val] of compDetails) {
    drawSafeText(pComp, lbl, {
      x: margin,
      y: cY,
      size: 8.5,
      fontRegular,
      fontBold,
      fontGeist,
      color: brandColor,
      isBold: true,
    });
    cY -= 20;
    const valLines = wrapText(val, contentWidth, fontRegular, 13);
    for (const vLine of valLines) {
      drawSafeText(pComp, vLine, {
        x: margin,
        y: cY,
        size: 13,
        fontRegular,
        fontBold,
        fontGeist,
        color: charcoal,
      });
      cY -= 18;
    }
    cY -= 18;
  }

  // ─────────────────────────────────────────────────────────────
  // PAGE (13 + N): PROPOSAL ACCEPTANCE
  // ─────────────────────────────────────────────────────────────
  const pAccept = pdfDoc.addPage([pageWidth, pageHeight]);
  let acY = drawInnerPageChrome(pAccept, 'Proposal acceptance', pageNum++);

  const acceptIntro =
    options.recipientType === 'supplier'
      ? 'To proceed with this quotation request, please confirm service availability, net contracted rates, and cancellation policies.'
      : 'To proceed, please confirm the travel dates, traveller details, selected hotel and acceptance of the final quotation and booking terms.';
  const acLines = wrapText(acceptIntro, contentWidth, fontRegular, 13.5);
  for (const l of acLines) {
    drawSafeText(pAccept, l, {
      x: margin,
      y: acY,
      size: 13.5,
      fontRegular,
      fontBold,
      fontGeist,
      color: charcoal,
    });
    acY -= 20;
  }
  acY -= 42;

  drawSafeText(pAccept, 'Guest name: _________________________', {
    x: margin,
    y: acY,
    size: 13,
    fontRegular,
    fontBold,
    fontGeist,
    color: charcoal,
  });
  acY -= 38;
  drawSafeText(pAccept, 'Signature: ___________________________', {
    x: margin,
    y: acY,
    size: 13,
    fontRegular,
    fontBold,
    fontGeist,
    color: charcoal,
  });
  acY -= 38;
  drawSafeText(pAccept, 'Date: ________________________________', {
    x: margin,
    y: acY,
    size: 13,
    fontRegular,
    fontBold,
    fontGeist,
    color: charcoal,
  });
  acY -= 62;

  const teamLabel = options.consultantRole || `${orgName} - FIT Team`;
  drawSafeText(pAccept, teamLabel, {
    x: margin,
    y: acY,
    size: 12.5,
    fontRegular,
    fontBold,
    fontGeist,
    color: brandColor,
    isBold: true,
  });
  acY -= 28;

  const consultantName = options.consultantName || 'Travel Consultant';
  drawSafeText(pAccept, consultantName, {
    x: margin,
    y: acY,
    size: 16,
    fontRegular,
    fontBold,
    fontGeist,
    color: charcoal,
    isBold: true,
  });
  acY -= 24;

  if (options.consultantEmail || supportEmail) {
    drawSafeText(pAccept, options.consultantEmail || supportEmail, {
      x: margin,
      y: acY,
      size: 12.5,
      fontRegular,
      fontBold,
      fontGeist,
      color: charcoal,
    });
    acY -= 18;
  }

  if (options.consultantPhone || supportPhone) {
    drawSafeText(pAccept, options.consultantPhone || supportPhone, {
      x: margin,
      y: acY,
      size: 12.5,
      fontRegular,
      fontBold,
      fontGeist,
      color: charcoal,
    });
  }

  return await pdfDoc.save();
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
  const quoteFooterOrg = options.organizationName || 'LGT Holidays';
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

  const partyStr = `${options.headcountAdults || 2} Adults, ${options.headcountChildren || 0} Children • Tier: ${(options.hotelTier || 'luxury_5star').replace('_', ' ').toUpperCase()}`;
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
    footerLeftText: `${options.organizationName || 'LGT Holidays'} • Issued on ${formatCalendarDate(new Date())} • CONFIRMED`,
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
