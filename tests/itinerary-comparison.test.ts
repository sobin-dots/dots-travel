import { describe, expect, it } from 'vitest';
import { inflateRawSync } from 'node:zlib';
import { PDFDocument } from 'pdf-lib';
import { comparisonRows, isComparisonRequest, type ComparisonOption } from '@/lib/itinerary-comparison';
import { comparisonPdf, itineraryWordDocument } from '@/lib/itinerary-documents';

const programme = 'Morning: Walk around the old quarter with time for the museum. Afternoon: Explore the waterfront and return to the hotel. Evening: Independent dining near the accommodation.';
const option: ComparisonOption = { id: 'a', label: 'Standard', budget: 50000, currency: 'INR', destination: 'Japan', durationDays: 2, departureDate: '2027-04-10',
  itinerary: `# Japan\nDay 1: Arrival\nLocation: Tokyo\n${programme}\nOvernight: Proposed Tokyo Hotel\nMeals: Breakfast\nTransfers: Shared transfer\nDay 2: Heritage\nLocation: Kyoto\n${programme}\nNotes: PreserveThisNote\n## Package Includes\n- Museum admission` };

export function documentXml(bytes: Uint8Array) {
  const buffer = Buffer.from(bytes); const end = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  let offset = buffer.readUInt32LE(end + 16);
  for (let i = 0; i < buffer.readUInt16LE(end + 10); i++) {
    const size = buffer.readUInt32LE(offset + 20); const nameLength = buffer.readUInt16LE(offset + 28); const extra = buffer.readUInt16LE(offset + 30); const comment = buffer.readUInt16LE(offset + 32);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString();
    if (name === 'word/document.xml') {
      const local = buffer.readUInt32LE(offset + 42); const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
      const data = buffer.subarray(start, start + size);
      return (buffer.readUInt16LE(offset + 10) === 8 ? inflateRawSync(data) : data).toString();
    }
    offset += 46 + nameLength + extra + comment;
  }
  throw new Error('Word document XML not found');
}
describe('Budget comparison and editable exports', () => {
  it('compares the same day across budget options and retains exact dates, hotels, meals and transfers', () => {
    const rows = comparisonRows([option, { ...option, id: 'b', label: 'Premium', budget: 100000 }]);
    expect(rows.map(r => r.optionId)).toEqual(['a', 'b', 'a', 'b']);
    expect(rows[0].cells).toEqual(['INR 50,000', 'Standard', 'Day 1 / 2027-04-10', 'Tokyo', expect.stringContaining('Morning:'), 'Proposed Tokyo Hotel', 'Breakfast', 'Shared transfer']);
    expect(rows[2].cells[2]).toBe('Day 2 / 2027-04-11');
    expect(rows[2].cells[4]).toContain('PreserveThisNote');
    expect(rows[2].cells[5]).toBe('Not specified');
  });
  it('routes explicit comparison requests without mistaking Table Mountain for a formatting request', () => {
    for (const request of ['Compare itineraries', 'Give all details in a table', 'Use tabular form', 'table format']) expect(isComparisonRequest(request)).toBe(true);
    expect(isComparisonRequest('Visit Table Mountain on day two')).toBe(false);
    expect(isComparisonRequest('Upgrade the hotel')).toBe(false);
  });
  it('creates a genuine editable Word table and retains all source inclusions and notes', async () => {
    const xml = documentXml(await itineraryWordDocument('Japan comparison', 'Agency & Company', [option], true));
    expect(xml).toContain('<w:tbl>'); expect(xml).toContain('Budget target'); expect(xml).toContain('Proposed Tokyo Hotel');
    expect(xml).toContain('Museum admission'); expect(xml).toContain('PreserveThisNote'); expect(xml).toContain('Agency &amp; Company');
  });
  it('exports a normal itinerary as editable Word paragraphs', async () => {
    const xml = documentXml(await itineraryWordDocument('Japan itinerary', 'Agency', [option], false));
    expect(xml).not.toContain('<w:tbl>'); expect(xml).toContain('Day 2: Heritage'); expect(xml).toContain('Museum admission');
  });
  it('paginates long comparison programmes without clipping a row to one page', async () => {
    const itinerary = option.itinerary.replace(programme, `${programme}\n${Array.from({ length: 150 }, (_, i) => `Stop${i}: ${programme}`).join('\n')}`);
    const bytes = await comparisonPdf('Long comparison', 'Agency', [{ ...option, itinerary }]);
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThan(3);
    expect(pdf.getPages().every(p => p.getWidth() > p.getHeight())).toBe(true);
  });
});
