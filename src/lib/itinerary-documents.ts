import { Document, HeadingLevel, Packer, PageOrientation, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from 'docx';
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import fs from 'node:fs/promises';
import path from 'node:path';
import { comparisonColumns, comparisonRows, formatBudget, plainItineraryLines, type ComparisonOption } from './itinerary-comparison';

export async function itineraryWordDocument(title: string, organization: string, options: ComparisonOption[], comparison: boolean) {
  const children: (Paragraph | Table)[] = [new Paragraph({ text: organization, heading: HeadingLevel.HEADING_1 }), new Paragraph({ text: title, heading: HeadingLevel.HEADING_2 }),
    new Paragraph('Budget figures are planning targets. Supplier quotations and confirmed selling prices are recorded separately.')];
  if (comparison) {
    const rows = [comparisonColumns, ...comparisonRows(options).map(r => r.cells)];
    children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: rows.map((row, index) => new TableRow({ tableHeader: index === 0,
      children: row.map(text => new TableCell({ children: text.split('\n').map(line => new Paragraph({ children: [new TextRun({ text: line, bold: index === 0, size: 18 })] })) })) })) }));
  }
  // Include complete source programmes so sections outside the comparison table are retained.
  for (const option of options) {
    children.push(new Paragraph({ text: `${option.label} — Budget target: ${formatBudget(option)}`, heading: HeadingLevel.HEADING_2 }));
    children.push(...plainItineraryLines(option.itinerary).map(text => new Paragraph({ text, spacing: { after: 100 } })));
  }
  return Packer.toBuffer(new Document({ creator: organization, title, sections: [{ properties: { page: { size: { orientation: comparison ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT }, margin: { top: 650, bottom: 650, left: 600, right: 600 } } }, children }] }));
}

export async function comparisonPdf(title: string, organization: string, options: ComparisonOption[]) {
  const doc = await PDFDocument.create(); doc.registerFontkit(fontkit);
  const font = await doc.embedFont(await fs.readFile(path.join(process.cwd(), 'public/fonts/Geist-Regular.ttf')), { subset: true });
  const widths = [68, 65, 68, 70, 220, 92, 72, 110]; const margin = 32; const fontSize = 8; const lineHeight = 11;
  let page = doc.addPage([841.89, 595.28]); let y = 0;
  const wrap = (text: string, width: number) => {
    const lines: string[] = [];
    for (const paragraph of text.split('\n')) {
      let line = '';
      for (const word of paragraph.split(/\s+/)) {
        const next = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(next, fontSize) <= width) { line = next; continue; }
        if (line) lines.push(line);
        line = '';
        for (const character of word) {
          if (line && font.widthOfTextAtSize(line + character, fontSize) > width) { lines.push(line); line = ''; }
          line += character;
        }
      }
      lines.push(line);
    }
    return lines.length ? lines : [''];
  };
  const drawCells = (cells: string[][], start: number, count: number, header = false) => {
    const height = count * lineHeight + 10; let x = margin;
    cells.forEach((lines, column) => {
      page.drawRectangle({ x, y: y - height, width: widths[column], height, borderWidth: 0.4, borderColor: rgb(.7, .7, .75), ...(header ? { color: rgb(.93, .94, .98) } : {}) });
      lines.slice(start, start + count).forEach((line, i) => page.drawText(line, { x: x + 4, y: y - 12 - i * lineHeight, size: fontSize, font }));
      x += widths[column];
    });
    y -= height;
  };
  const newPage = (first = false) => {
    if (!first) page = doc.addPage([841.89, 595.28]);
    page.drawText(organization.slice(0, 100), { x: margin, y: 564, size: 12, font });
    page.drawText(title.slice(0, 100), { x: margin, y: 545, size: 10, font });
    page.drawText('Budget targets only; supplier quotations and selling prices are recorded separately.', { x: margin, y: 528, size: 8, font });
    page.drawText(`Page ${doc.getPageCount()}`, { x: margin, y: 18, size: 8, font });
    y = 515; drawCells(comparisonColumns.map((c, i) => wrap(c, widths[i] - 8)), 0, 2, true);
  };
  newPage(true);
  for (const row of comparisonRows(options)) {
    const cells = row.cells.map((c, i) => wrap(c, widths[i] - 8)); const total = Math.max(...cells.map(c => c.length));
    let start = 0;
    while (start < total) {
      let available = Math.floor((y - 34 - 10) / lineHeight);
      if (available < 1) { newPage(); available = Math.floor((y - 44) / lineHeight); }
      const count = Math.min(total - start, available);
      drawCells(cells, start, count); start += count;
      if (start < total) newPage();
    }
  }
  return doc.save();
}
