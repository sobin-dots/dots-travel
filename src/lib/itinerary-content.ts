/** Shared, browser-safe itinerary interpretation. Never creates travel services or activities. */
export interface ItineraryDay {
  dayNumber: number;
  title: string;
  paragraphs: string[];
  overnight: string;
  meals: string;
  transfers: string;
  experience: string;
  notes: string;
}

export class ItineraryError extends Error {
  constructor(message: string, public status = 422, public code = 'invalid_itinerary') {
    super(message);
    this.name = 'ItineraryError';
  }
}

export function cleanItineraryLine(line: string): string {
  return line.replace(/\*\*|__/g, '').replace(/^\s*[-*•]\s+/, '').trim();
}

export function normalizeItineraryText(text: string): string {
  return text.replace(/\r\n?/g, '\n').replace(/^```(?:markdown|md)?\s*\n|\n```\s*$/g, '')
    .replace(/\s+---\s+(?=#{1,6}\s)/g, '\n---\n');
}

export function matchItineraryDay(line: string): { dayNumber: number; title: string } | null {
  const clean = cleanItineraryLine(line.replace(/^\s*#{1,6}\s*/, '').replace(/^\s*\d+[.)]\s+/, ''));
  const match = clean.match(/^day\s*(\d+)\b\s*(?:[:.\-–—|]\s*|$)(.*)$/i);
  return match ? { dayNumber: Number(match[1]), title: match[2].trim() } : null;
}

export function parseItineraryDays(text?: string | null): ItineraryDay[] {
  if (typeof text !== 'string' || !text.trim()) return [];
  const days: ItineraryDay[] = [];
  let current: ItineraryDay | undefined;
  for (const raw of normalizeItineraryText(text).split('\n')) {
    const line = raw.trim();
    if (!line || line === '---' || line.startsWith('>')) continue;
    const heading = matchItineraryDay(line);
    if (heading) {
      current = { ...heading, paragraphs: [], overnight: '', meals: '', transfers: '', experience: '', notes: '' };
      days.push(current);
      continue;
    }
    // Time-of-day subheadings belong to the active day; other sections end it.
    const clean = cleanItineraryLine(line.replace(/^#{1,6}\s*/, ''));
    const slotHeading = /^(morning|afternoon|evening|programme|program|main programme|activities)(?:\s*:|$)/i.test(clean);
    if ((/^#{1,6}\s/.test(line) && !slotHeading)
      || /^(?:\d+[.)]\s*)?(?:package includes|package excludes|inclusions|exclusions|before travel|curated accommodations|guest preferences)\s*:?$/i.test(clean)) {
      current = undefined;
      continue;
    }
    if (!current) continue;
    const meta = clean.match(/^(overnight|meals?|transfers?|included experiences?|experiences?|notes?)\s*:\s*(.*)$/i);
    if (meta) {
      const key = meta[1].toLowerCase();
      const field = key.startsWith('overnight') ? 'overnight' : key.startsWith('meal') ? 'meals'
        : key.startsWith('transfer') ? 'transfers' : key.startsWith('note') ? 'notes' : 'experience';
      current[field] = [current[field], meta[2]].filter(Boolean).join(' ');
    } else if (!/^\|?\s*:?-{3,}/.test(clean)) {
      if (!current.title && !slotHeading) current.title = clean;
      else if (clean) current.paragraphs.push(clean);
    }
  }
  return days;
}

export function declaredItineraryDuration(text: string): number | undefined {
  const match = text.replace(/\*\*|__/g, '').match(/(?:^|\n)\s*(?:[-*]\s*)?Duration\s*:\s*(\d+)\s*days?\b/i)
    || text.match(/^#\s+[^\n]*?\b(\d+)[ -]days?\b/im);
  return match ? Number(match[1]) : undefined;
}

export function validateItinerary(text: unknown, expectedDays?: number | null, minProgrammeLength = 40): string | null {
  if (typeof text !== 'string' || !text.trim()) return 'No itinerary has been generated. Generate an itinerary before downloading or sending it.';
  const days = parseItineraryDays(text);
  if (!days.length) return 'The itinerary has no readable day-by-day programme. Regenerate it before downloading or sending.';
  const count = expectedDays ?? days.length;
  if (!Number.isInteger(count) || count < 1 || count > 60) return 'Trip duration must be between 1 and 60 days.';
  if (days.length !== count || days.some((day, i) => day.dayNumber !== i + 1)) {
    return `The itinerary must contain every day from Day 1 through Day ${count}, in order, with no missing or duplicate days.`;
  }
  const declared = declaredItineraryDuration(text);
  if (declared !== undefined && declared !== count) return 'The itinerary duration does not match its daily programme. Regenerate it using the confirmed trip parameters.';
  const incomplete = days.find(day => !day.title || day.paragraphs.join(' ').length < minProgrammeLength
    || /^(?:to be (?:confirmed|planned)|tbd|pending|not (?:available|specified))\.?$/i.test(day.paragraphs.join(' ').trim()));
  return incomplete ? `Day ${incomplete.dayNumber} has no complete programme. Regenerate the itinerary before downloading or sending.` : null;
}

export function assertItineraryReady(text: unknown, expectedDays?: number | null, minProgrammeLength = 40): void {
  const error = validateItinerary(text, expectedDays, minProgrammeLength);
  if (error) throw new ItineraryError(error);
}

export function leadItineraryIssue(lead: { itinerary: unknown; durationDays?: number | null; metadata?: unknown }): string | null {
  if ((lead.metadata as Record<string, unknown> | null)?.itineraryNeedsRegeneration) {
    return 'Trip parameters have changed. Save parameters and regenerate the itinerary before downloading or sending.';
  }
  return validateItinerary(lead.itinerary, lead.durationDays);
}

export function assertTripInput(input: Record<string, any>): void {
  for (const [field, min, max] of [
    ['durationDays', 1, 60], ['headcountAdults', 0, 1000], ['headcountChildren', 0, 1000], ['headcountInfants', 0, 1000],
  ] as const) {
    const value = input[field];
    if (value != null && value !== '' && (!['string', 'number'].includes(typeof value) || !Number.isInteger(Number(value)) || Number(value) < min || Number(value) > max)) {
      throw new ItineraryError(`${field} must be a whole number between ${min} and ${max}.`, 400, 'invalid_trip_parameters');
    }
  }
  if (input.targetBudget != null && input.targetBudget !== '' && (!Number.isFinite(Number(input.targetBudget)) || Number(input.targetBudget) < 0)) {
    throw new ItineraryError('Budget must be a valid non-negative amount.', 400, 'invalid_trip_parameters');
  }
  for (const field of ['destination', 'hotelTier', 'specialRequests', 'customerName', 'customerEmail']) {
    if (input[field] != null && typeof input[field] !== 'string') throw new ItineraryError(`${field} must be text.`, 400);
  }
  for (const field of ['departureDate', 'returnDate']) {
    if (input[field] && (typeof input[field] !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input[field])
      || !Number.isFinite(Date.parse(input[field])) || new Date(input[field]).toISOString().slice(0, 10) !== input[field])) {
      throw new ItineraryError(`${field} must be a valid date (YYYY-MM-DD).`, 400, 'invalid_trip_parameters');
    }
  }
  if (input.departureDate && input.returnDate) {
    const days = (Date.parse(input.returnDate) - Date.parse(input.departureDate)) / 86400000 + 1;
    if (days < 1 || (input.durationDays != null && days !== Number(input.durationDays))) {
      throw new ItineraryError('Departure date, return date and duration must describe the same trip.', 400, 'invalid_trip_parameters');
    }
  }
}
