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
  // Strip bold markdown markers like **
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
