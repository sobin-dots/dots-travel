import { afterAll, describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { generateItineraryFromTranscript } from '@/lib/deepseek';
import { generateItineraryPDF } from '@/lib/pdf-generator';
import { parseItineraryDays } from '@/lib/itinerary-content';
import { db } from '@/lib/db';

// Explicit opt-in: calls a configured AI provider with synthetic travel parameters only.
describe.skipIf(process.env.ITINERARY_LIVE_AI !== '1')('Live itinerary AI smoke test', () => {
  afterAll(async () => { await db.$disconnect(); });
  it('generates the reported combined destination and produces a PDF without customer data or lead writes', async () => {
    const result = await generateItineraryFromTranscript('', undefined, undefined, {
      destination: 'Malaysia and Singapore', durationDays: 5, departureDate: '2027-02-20', returnDate: '2027-02-24',
      headcountAdults: 2, headcountChildren: 1, hotelTier: 'boutique_4star',
      specialRequests: 'A family-friendly proposed journey covering both Malaysia and Singapore. Services and accommodation are not confirmed.',
    });
    const days = parseItineraryDays(result.itinerary);
    expect(days).toHaveLength(5);
    expect(days.every(day => day.paragraphs.join(' ').length >= 160)).toBe(true);
    const pdf = await generateItineraryPDF({
      title: result.title, recipientName: 'QA Test', recipientType: 'customer', itineraryText: result.itinerary,
      durationDays: 5, destination: result.destination, departureDate: '2027-02-20', returnDate: '2027-02-24',
      headcountAdults: 2, headcountChildren: 1,
    });
    expect(pdf.length).toBeGreaterThan(1000);
    const directory = mkdtempSync(path.join(tmpdir(), 'itinerary-qa-'));
    writeFileSync(path.join(directory, 'proposal.md'), result.itinerary);
    writeFileSync(path.join(directory, 'proposal.pdf'), pdf);
    console.log(JSON.stringify({ liveGeneration: 'passed', days: days.length, programmeCharacters: days.map(day => day.paragraphs.join(' ').length), pdfBytes: pdf.length, artifactDirectory: directory }));
  }, 220000);
});
