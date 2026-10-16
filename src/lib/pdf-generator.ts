import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

export interface PDFOptions {
  title: string;
  recipientName: string;
  recipientEmail?: string;
  recipientType: 'customer' | 'supplier';
  itineraryText: string;
  organizationName?: string;
}

export async function generateItineraryPDF(options: PDFOptions): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const margin = 50;
  const pageWidth = 595.28; // A4
  const pageHeight = 841.89;
  const contentWidth = pageWidth - margin * 2;

  let currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  const checkPageBreak = (neededHeight: number) => {
    if (y - neededHeight < margin) {
      currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
      drawHeader();
    }
  };

  const drawHeader = () => {
    // Header accent bar
    currentPage.drawRectangle({
      x: margin,
      y: y - 2,
      width: contentWidth,
      height: 3,
      color: options.recipientType === 'customer' ? rgb(0.06, 0.72, 0.5) : rgb(0.39, 0.4, 0.95),
    });
    y -= 15;
  };

  // 1. Draw Document Top Header
  currentPage.drawText(options.organizationName || 'PLIVO BESPOKE TRAVEL CONCIERGE', {
    x: margin,
    y,
    size: 9,
    font: fontBold,
    color: rgb(0.4, 0.45, 0.5),
  });

  const tagText = options.recipientType === 'customer' ? 'CONFIDENTIAL ITINERARY' : 'REQUEST FOR QUOTATION (RFQ)';
  const tagWidth = fontBold.widthOfTextAtSize(tagText, 9);
  currentPage.drawText(tagText, {
    x: pageWidth - margin - tagWidth,
    y,
    size: 9,
    font: fontBold,
    color: options.recipientType === 'customer' ? rgb(0.06, 0.6, 0.4) : rgb(0.3, 0.35, 0.8),
  });

  y -= 25;
  drawHeader();

  // Document Title
  currentPage.drawText(options.title.slice(0, 65), {
    x: margin,
    y,
    size: 16,
    font: fontBold,
    color: rgb(0.1, 0.12, 0.15),
  });
  y -= 22;

  // Metadata block
  const metaBgHeight = 45;
  currentPage.drawRectangle({
    x: margin,
    y: y - metaBgHeight + 10,
    width: contentWidth,
    height: metaBgHeight,
    color: rgb(0.96, 0.97, 0.98),
  });

  currentPage.drawText(`Prepared For: ${options.recipientName}`, {
    x: margin + 12,
    y: y - 2,
    size: 10,
    font: fontBold,
    color: rgb(0.15, 0.2, 0.25),
  });

  if (options.recipientEmail) {
    currentPage.drawText(`Email: ${options.recipientEmail}`, {
      x: margin + 12,
      y: y - 16,
      size: 9,
      font: fontRegular,
      color: rgb(0.35, 0.4, 0.45),
    });
  }

  currentPage.drawText(`Date: ${new Date().toLocaleDateString()}`, {
    x: margin + 320,
    y: y - 2,
    size: 9,
    font: fontRegular,
    color: rgb(0.35, 0.4, 0.45),
  });

  currentPage.drawText(`Status: Verified & Approved`, {
    x: margin + 320,
    y: y - 16,
    size: 9,
    font: fontBold,
    color: rgb(0.1, 0.55, 0.35),
  });

  y -= metaBgHeight + 15;

  // Supplier Notice if RFQ
  if (options.recipientType === 'supplier') {
    currentPage.drawRectangle({
      x: margin,
      y: y - 35,
      width: contentWidth,
      height: 40,
      color: rgb(0.93, 0.95, 1.0),
    });
    currentPage.drawText('SUPPLIER QUOTATION REQUEST:', {
      x: margin + 10,
      y: y - 12,
      size: 9,
      font: fontBold,
      color: rgb(0.2, 0.25, 0.7),
    });
    currentPage.drawText('Please review the itinerary scope below and provide your best net rate quotation and availability.', {
      x: margin + 10,
      y: y - 26,
      size: 8.5,
      font: fontRegular,
      color: rgb(0.2, 0.25, 0.4),
    });
    y -= 50;
  }

  // Render Itinerary Content line by line with auto page wrapping
  const rawLines = options.itineraryText.split('\n');

  for (const rawLine of rawLines) {
    const trimmed = rawLine.trim();

    if (!trimmed) {
      y -= 8;
      continue;
    }

    if (trimmed.startsWith('# ')) {
      checkPageBreak(30);
      y -= 10;
      currentPage.drawText(trimmed.replace(/^# /, ''), {
        x: margin,
        y,
        size: 14,
        font: fontBold,
        color: rgb(0.1, 0.15, 0.2),
      });
      y -= 18;
    } else if (trimmed.startsWith('## ')) {
      checkPageBreak(25);
      y -= 8;
      currentPage.drawText(trimmed.replace(/^## /, ''), {
        x: margin,
        y,
        size: 12,
        font: fontBold,
        color: rgb(0.15, 0.2, 0.3),
      });
      y -= 16;
    } else if (trimmed.startsWith('### ')) {
      checkPageBreak(20);
      y -= 5;
      currentPage.drawText(trimmed.replace(/^### /, ''), {
        x: margin,
        y,
        size: 10.5,
        font: fontBold,
        color: rgb(0.2, 0.25, 0.35),
      });
      y -= 14;
    } else if (trimmed.startsWith('* ') || trimmed.startsWith('- ')) {
      // Bullet point
      const bulletText = trimmed.replace(/^[\*\-]\s+/, '');
      const wrapped = wrapText(bulletText, contentWidth - 16, fontRegular, 9);
      for (let i = 0; i < wrapped.length; i++) {
        checkPageBreak(12);
        if (i === 0) {
          currentPage.drawText('•', { x: margin + 4, y, size: 9, font: fontBold, color: rgb(0.3, 0.35, 0.4) });
        }
        currentPage.drawText(wrapped[i], {
          x: margin + 16,
          y,
          size: 9,
          font: fontRegular,
          color: rgb(0.2, 0.22, 0.25),
        });
        y -= 12;
      }
    } else {
      // Normal paragraph text
      const wrapped = wrapText(trimmed, contentWidth, fontRegular, 9);
      for (const line of wrapped) {
        checkPageBreak(12);
        currentPage.drawText(line, {
          x: margin,
          y,
          size: 9,
          font: fontRegular,
          color: rgb(0.25, 0.28, 0.3),
        });
        y -= 12;
      }
    }
  }

  // Draw Footer on all pages
  const totalPages = pdfDoc.getPageCount();
  for (let i = 0; i < totalPages; i++) {
    const page = pdfDoc.getPage(i);
    page.drawText(`Page ${i + 1} of ${totalPages} • Plivo Communications Platform Concierge Engine`, {
      x: margin,
      y: 25,
      size: 7.5,
      font: fontRegular,
      color: rgb(0.55, 0.6, 0.65),
    });
  }

  return await pdfDoc.save();
}

function wrapText(text: string, maxWidth: number, font: any, fontSize: number): string[] {
  const clean = text.replace(/\*\*/g, '');
  const words = clean.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const candidate = currentLine ? `${currentLine} ${word}` : word;
    const width = font.widthOfTextAtSize(candidate, fontSize);
    if (width <= maxWidth) {
      currentLine = candidate;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }

  if (currentLine) lines.push(currentLine);
  return lines.length > 0 ? lines : [clean];
}

export interface CustomerQuotePDFOptions {
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
  organizationName?: string;
  validUntil?: string | Date;
}

export async function generateCustomerQuotationPDF(options: CustomerQuotePDFOptions): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const margin = 50;
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const contentWidth = pageWidth - margin * 2;

  let currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  const checkPageBreak = (neededHeight: number) => {
    if (y - neededHeight < margin + 30) {
      currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
    }
  };

  // Header Banner
  currentPage.drawRectangle({
    x: margin,
    y: y - 3,
    width: contentWidth,
    height: 4,
    color: rgb(0.39, 0.4, 0.95), // Indigo
  });
  y -= 18;

  currentPage.drawText(options.organizationName || 'PLIVO BESPOKE TRAVEL CONCIERGE', {
    x: margin,
    y,
    size: 10,
    font: fontBold,
    color: rgb(0.2, 0.25, 0.35),
  });

  const tagText = `OFFICIAL PROPOSAL • v${options.version}`;
  const tagWidth = fontBold.widthOfTextAtSize(tagText, 9);
  currentPage.drawText(tagText, {
    x: pageWidth - margin - tagWidth,
    y,
    size: 9,
    font: fontBold,
    color: rgb(0.39, 0.4, 0.95),
  });
  y -= 25;

  // Title
  currentPage.drawText(options.title.slice(0, 60), {
    x: margin,
    y,
    size: 18,
    font: fontBold,
    color: rgb(0.08, 0.1, 0.15),
  });
  y -= 22;

  // Price & Summary Card
  const cardHeight = 65;
  currentPage.drawRectangle({
    x: margin,
    y: y - cardHeight + 10,
    width: contentWidth,
    height: cardHeight,
    color: rgb(0.96, 0.97, 1.0),
    borderColor: rgb(0.85, 0.88, 0.98),
    borderWidth: 1,
  });

  currentPage.drawText(`Customer: ${options.recipientName}`, {
    x: margin + 14,
    y: y - 5,
    size: 10,
    font: fontBold,
    color: rgb(0.1, 0.15, 0.2),
  });

  currentPage.drawText(`Destination: ${options.destination}`, {
    x: margin + 14,
    y: y - 20,
    size: 9,
    font: fontRegular,
    color: rgb(0.3, 0.35, 0.4),
  });

  const validDate = options.validUntil ? new Date(options.validUntil).toLocaleDateString() : '14 days';
  currentPage.drawText(`Quote Validity: Until ${validDate}`, {
    x: margin + 14,
    y: y - 35,
    size: 8.5,
    font: fontRegular,
    color: rgb(0.4, 0.45, 0.5),
  });

  // Price on the right
  const curr = options.currency || 'USD';
  const priceStr = `${curr} $${Number(options.finalSellingPrice).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
  const priceWidth = fontBold.widthOfTextAtSize(priceStr, 16);
  currentPage.drawText(priceStr, {
    x: pageWidth - margin - priceWidth - 14,
    y: y - 10,
    size: 16,
    font: fontBold,
    color: rgb(0.15, 0.55, 0.35),
  });

  currentPage.drawText('All Inclusive Selling Price', {
    x: pageWidth - margin - 150,
    y: y - 26,
    size: 8.5,
    font: fontRegular,
    color: rgb(0.4, 0.45, 0.5),
  });

  y -= cardHeight + 20;

  // Confirmed Flights Section (if any)
  if (options.flights && options.flights.length > 0) {
    checkPageBreak(80);
    currentPage.drawText('CONFIRMED FLIGHT SCHEDULES', {
      x: margin,
      y,
      size: 11,
      font: fontBold,
      color: rgb(0.2, 0.25, 0.35),
    });
    y -= 15;

    for (const f of options.flights) {
      checkPageBreak(45);
      currentPage.drawRectangle({
        x: margin,
        y: y - 32,
        width: contentWidth,
        height: 38,
        color: rgb(0.98, 0.98, 0.99),
        borderColor: rgb(0.9, 0.92, 0.95),
        borderWidth: 1,
      });

      currentPage.drawText(`${f.airline} • Flight ${f.flightNumber} (${f.cabinClass?.toUpperCase() || 'ECONOMY'})`, {
        x: margin + 10,
        y: y - 10,
        size: 9,
        font: fontBold,
        color: rgb(0.1, 0.15, 0.2),
      });

      const depDate = new Date(f.departureTime).toLocaleString();
      const arrDate = new Date(f.arrivalTime).toLocaleString();
      currentPage.drawText(`${f.origin} -> ${f.destination} | Dep: ${depDate} | Arr: ${arrDate}`, {
        x: margin + 10,
        y: y - 24,
        size: 8,
        font: fontRegular,
        color: rgb(0.3, 0.35, 0.4),
      });

      if (f.pnr) {
        const pnrText = `PNR: ${f.pnr}`;
        const pnrW = fontBold.widthOfTextAtSize(pnrText, 9);
        currentPage.drawText(pnrText, {
          x: pageWidth - margin - pnrW - 10,
          y: y - 10,
          size: 9,
          font: fontBold,
          color: rgb(0.39, 0.4, 0.95),
        });
      }

      y -= 45;
    }
    y -= 10;
  }

  // Itinerary Section Header
  checkPageBreak(40);
  currentPage.drawText('CURATED DAY-WISE JOURNEY ITINERARY', {
    x: margin,
    y,
    size: 11,
    font: fontBold,
    color: rgb(0.2, 0.25, 0.35),
  });
  y -= 15;

  // Itinerary Lines
  const rawLines = options.itineraryText.split('\n');
  for (const rawLine of rawLines) {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      y -= 7;
      continue;
    }
    if (trimmed.startsWith('# ')) continue; // Skip redundant top title

    if (trimmed.startsWith('## ') || trimmed.startsWith('### ')) {
      checkPageBreak(30);
      const heading = trimmed.replace(/^#+\s*/, '');
      y -= 6;
      currentPage.drawText(heading, {
        x: margin,
        y,
        size: 10.5,
        font: fontBold,
        color: rgb(0.15, 0.2, 0.3),
      });
      y -= 15;
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      const bulletText = trimmed.replace(/^[-*]\s*/, '');
      const wrapped = wrapText(bulletText, contentWidth - 20, fontRegular, 8.5);
      for (let i = 0; i < wrapped.length; i++) {
        checkPageBreak(12);
        if (i === 0) {
          currentPage.drawText('•', { x: margin + 4, y, size: 8.5, font: fontBold, color: rgb(0.39, 0.4, 0.95) });
        }
        currentPage.drawText(wrapped[i], {
          x: margin + 14,
          y,
          size: 8.5,
          font: fontRegular,
          color: rgb(0.2, 0.22, 0.25),
        });
        y -= 12;
      }
    } else {
      const wrapped = wrapText(trimmed, contentWidth, fontRegular, 8.5);
      for (const line of wrapped) {
        checkPageBreak(12);
        currentPage.drawText(line, {
          x: margin,
          y,
          size: 8.5,
          font: fontRegular,
          color: rgb(0.25, 0.28, 0.3),
        });
        y -= 12;
      }
    }
  }

  // Footer on all pages
  const totalPages = pdfDoc.getPageCount();
  for (let i = 0; i < totalPages; i++) {
    const page = pdfDoc.getPage(i);
    page.drawText(`Page ${i + 1} of ${totalPages} • Customer Quotation Proposal v${options.version} • Plivo Travel Concierge`, {
      x: margin,
      y: 20,
      size: 7.5,
      font: fontRegular,
      color: rgb(0.55, 0.6, 0.65),
    });
  }

  return await pdfDoc.save();
}

export interface BookingVoucherPDFOptions {
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
  organizationName?: string;
}

export async function generateBookingVoucherPDF(options: BookingVoucherPDFOptions): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const margin = 50;
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const contentWidth = pageWidth - margin * 2;

  const page = pdfDoc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  // Header Banner Green
  page.drawRectangle({
    x: margin,
    y: y - 3,
    width: contentWidth,
    height: 4,
    color: rgb(0.06, 0.72, 0.5), // Emerald
  });
  y -= 18;

  page.drawText(options.organizationName || 'PLIVO BESPOKE TRAVEL CONCIERGE', {
    x: margin,
    y,
    size: 10,
    font: fontBold,
    color: rgb(0.2, 0.25, 0.35),
  });

  const refBadge = `CONFIRMED BOOKING • ${options.bookingReference}`;
  const badgeWidth = fontBold.widthOfTextAtSize(refBadge, 9);
  page.drawText(refBadge, {
    x: pageWidth - margin - badgeWidth,
    y,
    size: 9,
    font: fontBold,
    color: rgb(0.06, 0.6, 0.4),
  });
  y -= 30;

  // Title
  page.drawText('OFFICIAL BOOKING CONFIRMATION VOUCHER', {
    x: margin,
    y,
    size: 16,
    font: fontBold,
    color: rgb(0.08, 0.1, 0.15),
  });
  y -= 25;

  // Voucher Box
  const vBoxHeight = 110;
  page.drawRectangle({
    x: margin,
    y: y - vBoxHeight + 10,
    width: contentWidth,
    height: vBoxHeight,
    color: rgb(0.95, 0.99, 0.97),
    borderColor: rgb(0.7, 0.9, 0.8),
    borderWidth: 1.5,
  });

  page.drawText(`Booking Reference: ${options.bookingReference}`, {
    x: margin + 16,
    y: y - 8,
    size: 13,
    font: fontBold,
    color: rgb(0.05, 0.45, 0.25),
  });

  page.drawText(`Primary Guest: ${options.customerName} (${options.customerPhone || options.customerEmail || 'N/A'})`, {
    x: margin + 16,
    y: y - 28,
    size: 9.5,
    font: fontRegular,
    color: rgb(0.15, 0.2, 0.25),
  });

  page.drawText(`Destination: ${options.destination} • Status: Confirmed & Locked`, {
    x: margin + 16,
    y: y - 44,
    size: 9.5,
    font: fontBold,
    color: rgb(0.15, 0.2, 0.25),
  });

  const depStr = options.departureDate ? new Date(options.departureDate).toLocaleDateString() : 'Confirmed';
  const partyStr = `${options.headcountAdults || 2} Adults${options.headcountChildren ? `, ${options.headcountChildren} Children` : ''}`;
  page.drawText(`Travel Dates: From ${depStr} • Party: ${partyStr}`, {
    x: margin + 16,
    y: y - 60,
    size: 9,
    font: fontRegular,
    color: rgb(0.3, 0.35, 0.4),
  });

  page.drawText(`Accommodations: ${options.hotelTier ? options.hotelTier.replace('_', ' ').toUpperCase() : 'PREMIER LUXURY'}`, {
    x: margin + 16,
    y: y - 76,
    size: 9,
    font: fontRegular,
    color: rgb(0.3, 0.35, 0.4),
  });

  y -= vBoxHeight + 25;

  // Flights table if present
  if (options.flights && options.flights.length > 0) {
    page.drawText('CONFIRMED FLIGHT RESERVATIONS', {
      x: margin,
      y,
      size: 11,
      font: fontBold,
      color: rgb(0.15, 0.2, 0.25),
    });
    y -= 15;

    for (const f of options.flights) {
      page.drawRectangle({
        x: margin,
        y: y - 25,
        width: contentWidth,
        height: 30,
        color: rgb(0.98, 0.98, 0.99),
        borderColor: rgb(0.9, 0.92, 0.95),
        borderWidth: 1,
      });

      page.drawText(`${f.airline} ${f.flightNumber}: ${f.origin} -> ${f.destination} (Dep: ${new Date(f.departureTime).toLocaleString()})`, {
        x: margin + 10,
        y: y - 10,
        size: 8.5,
        font: fontBold,
        color: rgb(0.15, 0.2, 0.25),
      });

      if (f.pnr) {
        page.drawText(`PNR: ${f.pnr}`, {
          x: margin + 10,
          y: y - 20,
          size: 8,
          font: fontRegular,
          color: rgb(0.06, 0.6, 0.4),
        });
      }
      y -= 35;
    }
    y -= 10;
  }

  // Concierge Instructions & 24/7 Hotline
  page.drawText('CONCIERGE & ON-GROUND ASSISTANCE', {
    x: margin,
    y,
    size: 11,
    font: fontBold,
    color: rgb(0.15, 0.2, 0.25),
  });
  y -= 15;

  const instructions = [
    'Please present this digital or printed voucher alongside your valid passports upon arrival at airport and hotel check-in.',
    'Your dedicated private chauffeur will be waiting at the arrivals terminal holding a personalized welcome placard.',
    '24/7 Worldwide Emergency Support Hotline: +1 (800) 555-PLIVO or WhatsApp Support Desk.',
    'All ground activities, private guides, and prepaid dining reservations have been synchronized with your trip itinerary.',
  ];

  for (const inst of instructions) {
    page.drawText('*', { x: margin + 4, y, size: 9, font: fontBold, color: rgb(0.06, 0.6, 0.4) });
    const wrapped = wrapText(inst, contentWidth - 25, fontRegular, 8.5);
    for (const line of wrapped) {
      page.drawText(line, { x: margin + 18, y, size: 8.5, font: fontRegular, color: rgb(0.2, 0.25, 0.3) });
      y -= 13;
    }
  }

  // Footer
  page.drawText(`Voucher ID: ${options.bookingReference} • Plivo Fulfillment Desk • Issued ${new Date().toLocaleDateString()}`, {
    x: margin,
    y: 25,
    size: 7.5,
    font: fontRegular,
    color: rgb(0.55, 0.6, 0.65),
  });

  return await pdfDoc.save();
}

