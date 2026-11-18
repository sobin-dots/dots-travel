import { cleanItineraryLine, normalizeItineraryText, parseItineraryDays } from './itinerary-content';

export interface ComparisonOption {
  id: string; label: string; budget: number | string | null; currency: string;
  itinerary: string; durationDays: number; departureDate?: string | Date | null; destination: string;
  updatedAt?: string | Date;
}
export const comparisonColumns = ['Budget target', 'Option', 'Day / Date', 'Location', 'Programme', 'Hotel', 'Meals', 'Transfers'];
export function isComparisonRequest(text: string) {
  return /\b(compar(?:e|ison|ing)|tabular)\b|\btable\s+(format|view|form)\b|\b(in|as|into)\s+(?:a\s+|the\s+)?table\b|\b(different|multiple|various)\s+budgets\b|\bbudget\s+(options|alternatives)\b|^\s*table\s*$/i.test(text);
}
export function formatBudget(option: Pick<ComparisonOption, 'budget' | 'currency'>) {
  return option.budget == null ? 'Not specified' : `${option.currency} ${Number(option.budget).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}
export function comparisonRows(options: ComparisonOption[]) {
  return options.flatMap(option => parseItineraryDays(option.itinerary).map(day => {
    let date = '';
    if (option.departureDate) {
      const parsed = new Date(option.departureDate);
      if (!Number.isNaN(parsed.getTime())) { parsed.setUTCDate(parsed.getUTCDate() + day.dayNumber - 1); date = parsed.toISOString().slice(0, 10); }
    }
    const locationLine = day.paragraphs.find(p => /^(location|city|destination)\s*:/i.test(p));
    return { dayNumber: day.dayNumber, optionId: option.id, cells: [formatBudget(option), option.label,
      `Day ${day.dayNumber}${date ? ` / ${date}` : ''}`, locationLine?.replace(/^[^:]+:\s*/, '') || option.destination,
      [day.title, ...day.paragraphs.filter(p => p !== locationLine), day.experience && `Experience: ${day.experience}`, day.notes && `Notes: ${day.notes}`].filter(Boolean).join('\n'),
      day.overnight || 'Not specified', day.meals || 'Not specified', day.transfers || 'Not specified'] };
  })).sort((a, b) => a.dayNumber - b.dayNumber || options.findIndex(o => o.id === a.optionId) - options.findIndex(o => o.id === b.optionId));
}
export function plainItineraryLines(text: string) {
  return normalizeItineraryText(text).split('\n').map(line => cleanItineraryLine(line.replace(/^#{1,6}\s*/, ''))).filter(Boolean);
}
