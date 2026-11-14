import { describe, expect, it } from 'vitest';
import { parseItineraryDays, validateItinerary, assertTripInput, leadItineraryIssue } from '@/lib/itinerary-content';
import { parseItinerary } from '@/components/VisualItinerary';
import { parseItineraryContent } from '@/lib/pdf-generator';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { VisualItinerary } from '@/components/VisualItinerary';

const programme = 'Visit the heritage district on foot, stopping at the local museum before returning to the hotel in the evening.';
const options = { title: 'Trip', recipientName: 'Client', recipientType: 'customer' as const, itineraryText: '' };

describe('Shared itinerary interpretation', () => {
  it('renders real programme text in the dashboard and shows an honest empty state', () => {
    const rendered = renderToStaticMarkup(createElement(VisualItinerary, { itineraryText: `Day 1: Heritage\n${programme}`, durationDays: 1 }));
    expect(rendered).toContain(programme);
    expect(rendered).not.toContain('No timeline activities specified');
    const empty = renderToStaticMarkup(createElement(VisualItinerary, { itineraryText: '', durationDays: 5 }));
    expect(empty).toContain('No itinerary has been generated');
    expect(empty).toContain('Needs attention');
    expect(empty).not.toContain('AI Formatted');
  });
  it.each(['### Day 1: Heritage', 'Day 1 — Heritage', '**Day 1:** Heritage', '## **Day 1: Heritage**', 'DAY 1 - Heritage', 'Day 1\nHeritage'])('reads %s consistently in the dashboard and PDF', heading => {
    const text = `${heading}\n${programme}\nMeals: Not confirmed\n## Package Includes\n- Museum admission proposed`;
    const shared = parseItineraryDays(text);
    expect(shared).toHaveLength(1);
    expect(shared[0].paragraphs).toEqual([programme]);
    expect(parseItinerary(text).days[0].generalActivities).toContain(programme);
    expect(parseItineraryContent(text, options).days[0].paragraphs).toEqual([programme]);
    expect(validateItinerary(text, 1)).toBeNull();
  });

  it('retains time-of-day subheadings and multi-line content', () => {
    const text = `### Day 1: Heritage\n#### Morning\n${programme}\n#### Afternoon: Museum visit\nExplore the gallery.\n**Evening:** Return to the hotel.\n**Transfers:** Not confirmed\n## Package Excludes\n- Flights`;
    const day = parseItineraryDays(text)[0];
    expect(day.paragraphs.join(' ')).toContain('Explore the gallery.');
    expect(day.paragraphs.join(' ')).toContain('Evening: Return to the hotel.');
    expect(day.paragraphs.join(' ')).not.toContain('Flights');
    expect(day.transfers).toBe('Not confirmed');
  });

  it.each([null, '', '   ', '# Proposal\nNo days', 'Day 1: Arrival', `Day 2: Arrival\n${programme}`, `Day 1: Arrival\n${programme}\nDay 1: Again\n${programme}`])('rejects empty, heading-only or invalid day sequences: %s', text => {
    expect(validateItinerary(text)).toBeTruthy();
  });

  it('rejects incomplete duration and marks parameter changes as stale', () => {
    const text = `Day 1: Heritage\n${programme}`;
    expect(validateItinerary(text, 5)).toContain('Day 5');
    expect(leadItineraryIssue({ itinerary: text, durationDays: 1, metadata: { itineraryNeedsRegeneration: true } })).toContain('parameters have changed');
  });

  it('never creates activities, meals, transfers, hotels, inclusions or dates from missing text', () => {
    const parsed = parseItineraryContent('', { ...options, destination: 'Malaysia and Singapore', durationDays: 5 });
    expect(parsed.days).toEqual([]);
    expect(parsed.overviewParagraph).toBe('');
    expect(parsed.recordedRequirements).toEqual([]);
    expect(parsed.inclusions).toEqual([]);
    expect(parsed.exclusions).toEqual([]);
    expect(parsed.accommodationRows.find(([key]) => key === 'Hotel name')?.[1]).toBe('');
    expect(parsed.overviewTableRows.find(([key]) => key === 'Meal plan')?.[1]).toBe('');
    expect(parsed.validUntilDateStr).toBe('Not specified');
    expect(parseItineraryDays(`Day 1: Heritage\n${programme}`)[0]).toMatchObject({ meals: '', transfers: '', overnight: '' });
  });

  it.each([
    { durationDays: 0 }, { durationDays: 2.5 }, { durationDays: -1 }, { durationDays: 61 },
    { headcountChildren: -1 }, { headcountAdults: 'abc' }, { destination: {} },
    { departureDate: '2027-02-30' }, { returnDate: 'invalid' },
    { departureDate: '2027-02-20', returnDate: '2027-02-19' },
    { departureDate: '2027-02-20', returnDate: '2027-02-24', durationDays: 4 },
  ])('rejects invalid trip parameters: %j', input => expect(() => assertTripInput(input)).toThrow());

  it('accepts the reported Malaysia/Singapore dates and a single-day trip', () => {
    expect(() => assertTripInput({ destination: 'Malaysia and Singapore', departureDate: '2027-02-20', returnDate: '2027-02-24', durationDays: 5, headcountAdults: 2, headcountChildren: 1 })).not.toThrow();
    expect(() => assertTripInput({ departureDate: '2027-02-20', returnDate: '2027-02-20', durationDays: 1 })).not.toThrow();
  });
});
