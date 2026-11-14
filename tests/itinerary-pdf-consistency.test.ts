import { describe, it, expect } from 'vitest';
import { PDFDocument, PDFRawStream, PDFArray, decodePDFRawStream } from 'pdf-lib';
import { generateItineraryPDF, parseItineraryContent } from '@/lib/pdf-generator';
import { parseItinerary } from '@/components/VisualItinerary';

// Inspect the actual PDF text operators, including the last line on continuation pages.
async function pdfText(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes);
  let text = '';
  for (const page of doc.getPages()) {
    const contents = page.node.Contents();
    const streams = contents instanceof PDFArray ? contents.asArray() : [contents];
    for (const streamRef of streams) {
      const stream = doc.context.lookup(streamRef!);
      if (!(stream instanceof PDFRawStream)) continue;
      const operators = Buffer.from(decodePDFRawStream(stream).decode()).toString();
      for (const match of operators.matchAll(/<([0-9a-f]+)>\s*Tj/gi)) text += Buffer.from(match[1], 'hex').toString('latin1') + '\n';
    }
  }
  return { text, pages: doc.getPageCount() };
}

describe('PDF content fidelity', () => {
  it('retains every paragraph and operational note across continuation pages', async () => {
    const paragraphs = Array.from({ length: 90 }, (_, i) => `ProgrammeItem${i}: Explore the heritage district and its local museum before taking time for lunch and continuing the proposed journey along the waterfront.`);
    const itinerary = `# Heritage journey\nDay 1: Heritage\n${paragraphs.join('\n\n')}\nNotes: FinalOperationalNote\n## Package Includes\n- ConfirmedMuseumAdmission`;
    const bytes = await generateItineraryPDF({ title: 'Heritage journey', recipientName: 'Guest', recipientType: 'customer', itineraryText: itinerary, durationDays: 1, organizationName: 'VoyoTrip' });
    const rendered = await pdfText(bytes);
    expect(rendered.pages).toBeGreaterThan(3);
    for (let i = 0; i < 90; i++) expect(rendered.text).toContain(`ProgrammeItem${i}:`);
    expect(rendered.text).toContain('FinalOperationalNote');
    expect(rendered.text).toContain('ConfirmedMuseumAdmission');
    expect(rendered.text).not.toContain('Changi');
    expect(rendered.text).not.toContain('LGT');
    expect(rendered.text).not.toContain('1800 202');
    expect(rendered.text).not.toContain('Breakfast');
    expect(parseItinerary(itinerary).days[0].generalActivities).toContain(paragraphs[89]);
    expect(parseItineraryContent(itinerary, { title: '', recipientName: '', recipientType: 'customer', itineraryText: itinerary }).days[0].paragraphs).toEqual(paragraphs);
  });

  it('paginates long requirements and inclusions instead of discarding later items', async () => {
    const requirements = Array.from({ length: 65 }, (_, i) => `- Requirement${i}: Confirm the requested museum visit and walking pace before finalizing the daily itinerary.`).join('\n');
    const text = `## Guest Preferences\n### Recorded requirements\n${requirements}\n## Day 1: Heritage\nExplore the heritage district at a relaxed pace and visit the museum before returning to the hotel.\n## Package Includes\n${requirements}`;
    const rendered = await pdfText(await generateItineraryPDF({ title: 'Trip', recipientName: 'Client', recipientType: 'customer', itineraryText: text, durationDays: 1 }));
    expect(rendered.text.match(/Requirement64:/g)).toHaveLength(2);
  });

  it('blocks empty and incomplete PDF generation', async () => {
    for (const text of ['', '# Trip', 'Day 1: Arrival', 'Day 1: Arrival\nNo details']) {
      await expect(generateItineraryPDF({ title: 'Trip', recipientName: 'Client', recipientType: 'customer', itineraryText: text, durationDays: 5 })).rejects.toThrow();
    }
  });
});
