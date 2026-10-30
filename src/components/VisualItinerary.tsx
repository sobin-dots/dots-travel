'use client';

import React, { useState } from 'react';
import {
  Calendar,
  MapPin,
  Clock,
  Hotel,
  Sunrise,
  Sun,
  Moon,
  Sparkles,
  CheckCircle,
  DollarSign,
  FileText,
  Layout,
  Eye,
  Plane,
  Compass,
} from 'lucide-react';

interface VisualItineraryProps {
  itineraryText?: string | null;
  destination?: string | null;
  leadTitle?: string | null;
  durationDays?: number | null;
}

interface ParsedDay {
  dayNumber: string;
  title: string;
  morning?: string;
  afternoon?: string;
  evening?: string;
  generalActivities: string[];
}

export function parseItinerary(text?: string | null) {
  if (!text || typeof text !== 'string') {
    return {
      title: 'Curated Bespoke Itinerary',
      destination: 'Global Destination',
      duration: 'Custom Duration',
      overview: 'No itinerary details available yet.',
      accommodations: [],
      days: [],
      experiences: [],
      quotationScope: '',
    };
  }

  // Normalize inline horizontal rules before headings (e.g. "--- ## 2. Guest Preferences")
  const normalizedText = text
    .replace(/\s*---\s*(#{1,3}\s+)/g, '\n$1')
    .replace(/\s+(#{2,3}\s+\d+\.\s+)/g, '\n$1');
  const lines = normalizedText.split('\n');
  let title = '';
  let destination = '';
  let duration = '';
  let overview = '';
  const accommodations: string[] = [];
  const days: ParsedDay[] = [];
  const experiences: string[] = [];
  let quotationScope = '';

  let currentSection = '';
  let currentDay: ParsedDay | null = null;
  let currentSlot: 'morning' | 'afternoon' | 'evening' | 'general' = 'general';

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();

    if (!line || line === '---') continue;

    // Check top header
    if (line.startsWith('# ') && !title) {
      title = line.replace(/^#\s+/, '').trim();
      continue;
    }

    if (line.toLowerCase().includes('destination:') && !destination) {
      destination = line.replace(/.*destination:\s*/i, '').replace(/\*+/g, '').trim();
      continue;
    }

    if (line.toLowerCase().includes('duration:') && !duration) {
      duration = line.replace(/.*duration:\s*/i, '').replace(/\*+/g, '').trim();
      continue;
    }

    // Section headers
    if (line.startsWith('## ') || line.startsWith('### ')) {
      const heading = line.replace(/^#{2,3}\s+/, '').trim();
      const lowerHeading = heading.toLowerCase();

      // Check if this is a Day header (e.g. "Day 1: Arrival" or "## Day 1")
      const dayMatch = heading.match(/Day\s+(\d+)[:\s-]*(.*)/i);
      if (dayMatch) {
        if (currentDay) days.push(currentDay);
        currentDay = {
          dayNumber: `Day ${dayMatch[1]}`,
          title: dayMatch[2]?.trim() || `Exploration & Activities`,
          generalActivities: [],
        };
        currentSlot = 'general';
        currentSection = 'day';
        continue;
      }

      if (lowerHeading.includes('executive summary') || lowerHeading.includes('overview')) {
        currentSection = 'overview';
        continue;
      }

      if (lowerHeading.includes('accommodation') || lowerHeading.includes('hotel') || lowerHeading.includes('resort')) {
        if (currentDay) {
          days.push(currentDay);
          currentDay = null;
        }
        currentSection = 'accommodations';
        continue;
      }

      if (
        lowerHeading.includes('experience') ||
        lowerHeading.includes('highlight') ||
        lowerHeading.includes('activities') ||
        lowerHeading.includes('package includes') ||
        lowerHeading.includes('inclusions')
      ) {
        if (currentDay) {
          days.push(currentDay);
          currentDay = null;
        }
        currentSection = 'experiences';
        continue;
      }

      if (lowerHeading.includes('quotation') || lowerHeading.includes('scope') || lowerHeading.includes('budget') || lowerHeading.includes('pricing')) {
        if (currentDay) {
          days.push(currentDay);
          currentDay = null;
        }
        currentSection = 'quotation';
        continue;
      }

      // Any other section header (e.g. Guest Preferences, Package Excludes, Important Travel Info)
      if (currentDay) {
        days.push(currentDay);
        currentDay = null;
      }
      currentSection = 'other';
      continue;
    }

    // Check inline Day marker if not in heading (e.g. "**Day 1:** Arrival in Paris")
    const inlineDayMatch = line.match(/^\*\*Day\s+(\d+)[:\s-]*(.*?)\*\*(.*)/i);
    if (inlineDayMatch) {
      if (currentDay) days.push(currentDay);
      const afterBold = inlineDayMatch[3] ? inlineDayMatch[3].trim() : '';
      currentDay = {
        dayNumber: `Day ${inlineDayMatch[1]}`,
        title: (inlineDayMatch[2] + (afterBold ? ' ' + afterBold : '')).trim() || 'Day Itinerary',
        generalActivities: [],
      };
      currentSlot = 'general';
      currentSection = 'day';
      continue;
    }

    // Time slots within Day
    if (currentSection === 'day' && currentDay) {
      const lower = line.toLowerCase();
      if (lower.startsWith('**morning:') || lower.startsWith('- morning:') || lower.startsWith('* morning:')) {
        currentSlot = 'morning';
        const content = line.replace(/^[\s*-]*\**morning:\**\s*/i, '').trim();
        currentDay.morning = content;
        continue;
      }
      if (lower.startsWith('**afternoon:') || lower.startsWith('- afternoon:') || lower.startsWith('* afternoon:')) {
        currentSlot = 'afternoon';
        const content = line.replace(/^[\s*-]*\**afternoon:\**\s*/i, '').trim();
        currentDay.afternoon = content;
        continue;
      }
      if (lower.startsWith('**evening:') || lower.startsWith('- evening:') || lower.startsWith('* evening:')) {
        currentSlot = 'evening';
        const content = line.replace(/^[\s*-]*\**evening:\**\s*/i, '').trim();
        currentDay.evening = content;
        continue;
      }

      // Append to current slot or general activities
      const cleanLine = line.replace(/^[-*•]\s+/, '').replace(/\*\*/g, '').trim();
      if (cleanLine) {
        if (currentSlot === 'morning' && currentDay.morning) {
          currentDay.morning += ' ' + cleanLine;
        } else if (currentSlot === 'afternoon' && currentDay.afternoon) {
          currentDay.afternoon += ' ' + cleanLine;
        } else if (currentSlot === 'evening' && currentDay.evening) {
          currentDay.evening += ' ' + cleanLine;
        } else {
          currentDay.generalActivities.push(cleanLine);
        }
      }
      continue;
    }

    // Content for other sections
    if (currentSection === 'overview') {
      // Skip markdown table borders/headers and redundant bullet metadata in the overview paragraph
      if (/^\|?[\s-:|]+\|[\s-:|]*$/.test(line)) continue;
      if (/^\|\s*item\s*\|\s*details\s*\|/i.test(line)) continue;
      if (line.startsWith('|') && line.endsWith('|')) continue;
      if (/^[-*•]\s*\*?\*?(destination|duration|hotel plan|meal plan|transfers|flights|pace)\s*:/i.test(line)) continue;
      overview += (overview ? ' ' : '') + line.replace(/\*\*/g, '');
    } else if (currentSection === 'accommodations') {
      const clean = line.replace(/^[-*•]\s+/, '').replace(/\*\*/g, '').trim();
      if (clean) accommodations.push(clean);
    } else if (currentSection === 'experiences') {
      const clean = line.replace(/^[-*•]\s+/, '').replace(/\*\*/g, '').trim();
      if (clean) experiences.push(clean);
    } else if (currentSection === 'quotation') {
      quotationScope += (quotationScope ? '\n' : '') + line.replace(/\*\*/g, '');
    }
  }

  if (currentDay) days.push(currentDay);

  return {
    title: title || 'Curated Bespoke Itinerary',
    destination: destination || 'Global Destination',
    duration: duration || (days.length ? `${days.length} Days / ${Math.max(1, days.length - 1)} Nights` : 'Custom Duration'),
    overview: overview || 'An impeccably tailored travel itinerary designed around customer preferences and luxury comfort.',
    accommodations,
    days,
    experiences,
    quotationScope,
  };
}

export function VisualItinerary({ itineraryText, destination: propDest, leadTitle, durationDays }: VisualItineraryProps) {
  const [viewMode, setViewMode] = useState<'visual' | 'raw'>('visual');
  const safeText = typeof itineraryText === 'string' ? itineraryText : '';
  const parsed = parseItinerary(safeText);
  const effectiveDaysCount =
    durationDays && Number(durationDays) > 0
      ? Number(durationDays)
      : parsed.days.length > 0
      ? parsed.days.length
      : null;
  const displayDuration = effectiveDaysCount
    ? `${effectiveDaysCount} Days / ${Math.max(1, effectiveDaysCount - 1)} Nights`
    : parsed.duration;

  return (
    <div className="space-y-4">
      {/* Top Controls: Visual vs Raw Switch */}
      <div className="flex items-center justify-between pb-2 border-b border-zinc-800/80">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
            <Compass className="w-3.5 h-3.5 text-indigo-400" />
            Itinerary Presentation
          </span>
          <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-medium">
            AI Formatted
          </span>
        </div>

        <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-lg p-0.5 text-[11px]">
          <button
            type="button"
            onClick={() => setViewMode('visual')}
            className={`px-2.5 py-1 rounded flex items-center gap-1.5 font-medium transition ${
              viewMode === 'visual'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Layout className="w-3 h-3" />
            <span>Visual Showcase</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('raw')}
            className={`px-2.5 py-1 rounded flex items-center gap-1.5 font-medium transition ${
              viewMode === 'raw'
                ? 'bg-zinc-800 text-zinc-200'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <FileText className="w-3 h-3" />
            <span>Markdown</span>
          </button>
        </div>
      </div>

      {viewMode === 'raw' ? (
        <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 font-mono text-xs text-zinc-300 whitespace-pre-line leading-relaxed max-h-[500px] overflow-y-auto select-text">
          {safeText || '(No itinerary details generated yet)'}
        </div>
      ) : (
        <div className="space-y-4 max-h-[520px] overflow-y-auto pr-1">
          {/* Hero Banner Card */}
          <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-indigo-950/70 via-violet-950/40 to-zinc-900 border border-indigo-500/30 p-5 space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold tracking-wider uppercase bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded">
                    Luxury Concierge
                  </span>
                  <span className="text-zinc-400 text-xs flex items-center gap-1 font-medium">
                    <MapPin className="w-3 h-3 text-emerald-400" />
                    {propDest || parsed.destination}
                  </span>
                </div>
                <h3 className="text-base font-bold text-white tracking-tight">
                  {leadTitle || parsed.title}
                </h3>
              </div>

              <div className="text-right shrink-0">
                <div className="text-[11px] text-zinc-400 flex items-center gap-1 justify-end">
                  <Calendar className="w-3 h-3 text-indigo-400" />
                  <span>{displayDuration}</span>
                </div>
                <div className="text-[10px] text-zinc-500 mt-0.5">
                  {effectiveDaysCount || parsed.days.length} Days Planned
                </div>
              </div>
            </div>

            {/* Executive Summary */}
            {parsed.overview && (
              <p className="text-xs text-zinc-300/90 leading-relaxed bg-zinc-900/60 p-3 rounded-lg border border-zinc-800/80">
                {parsed.overview}
              </p>
            )}
          </div>

          {/* Curated Accommodations Card */}
          {parsed.accommodations.length > 0 && (
            <div className="bg-zinc-950/70 border border-zinc-800/90 rounded-xl p-4 space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-bold text-zinc-200">
                <Hotel className="w-4 h-4 text-emerald-400" />
                <span>Curated Accommodations</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                {parsed.accommodations.map((acc, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 bg-zinc-900/70 border border-zinc-800/80 rounded-lg flex items-start gap-2.5"
                  >
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                    <span className="text-zinc-300 leading-snug">{acc}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Day-by-Day Timeline */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs font-bold text-zinc-200 pt-1">
              <span className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-indigo-400" />
                <span>Day-by-Day Journey Timeline</span>
              </span>
              <span className="text-[10px] text-zinc-500">
                {parsed.days.length} Detailed Stages
              </span>
            </div>

            {parsed.days.length === 0 ? (
              <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 text-xs text-zinc-400 whitespace-pre-line">
                {safeText || 'No timeline activities specified.'}
              </div>
            ) : (
              <div className="space-y-3 relative before:absolute before:inset-0 before:left-4 before:w-0.5 before:bg-zinc-800/80">
                {parsed.days.map((day, idx) => (
                  <div
                    key={idx}
                    className="relative pl-10 group"
                  >
                    {/* Timeline Node Badge */}
                    <div className="absolute left-1 top-2.5 w-6 h-6 rounded-full bg-indigo-600 text-white font-bold text-[10px] flex items-center justify-center shadow-md shadow-indigo-600/30 border-2 border-zinc-900">
                      {idx + 1}
                    </div>

                    {/* Day Content Card */}
                    <div className="bg-zinc-900/80 border border-zinc-800/90 hover:border-indigo-500/40 rounded-xl p-4 space-y-3 transition">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-indigo-300">{day.dayNumber}</span>
                          <span className="text-zinc-600">•</span>
                          <span className="text-xs font-semibold text-zinc-100">{day.title}</span>
                        </div>
                      </div>

                      {/* Time Slots (Morning / Afternoon / Evening) */}
                      {(day.morning || day.afternoon || day.evening) ? (
                        <div className="space-y-2 text-xs pt-1">
                          {day.morning && (
                            <div className="flex items-start gap-2.5 bg-zinc-950/60 p-2.5 rounded-lg border border-zinc-800/60">
                              <Sunrise className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                              <div>
                                <span className="font-semibold text-amber-300/90 text-[11px] block">Morning</span>
                                <span className="text-zinc-300 leading-relaxed text-[11px]">{day.morning}</span>
                              </div>
                            </div>
                          )}

                          {day.afternoon && (
                            <div className="flex items-start gap-2.5 bg-zinc-950/60 p-2.5 rounded-lg border border-zinc-800/60">
                              <Sun className="w-3.5 h-3.5 text-sky-400 shrink-0 mt-0.5" />
                              <div>
                                <span className="font-semibold text-sky-300/90 text-[11px] block">Afternoon</span>
                                <span className="text-zinc-300 leading-relaxed text-[11px]">{day.afternoon}</span>
                              </div>
                            </div>
                          )}

                          {day.evening && (
                            <div className="flex items-start gap-2.5 bg-zinc-950/60 p-2.5 rounded-lg border border-zinc-800/60">
                              <Moon className="w-3.5 h-3.5 text-violet-400 shrink-0 mt-0.5" />
                              <div>
                                <span className="font-semibold text-violet-300/90 text-[11px] block">Evening</span>
                                <span className="text-zinc-300 leading-relaxed text-[11px]">{day.evening}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : null}

                      {/* General Activities list if present */}
                      {day.generalActivities.length > 0 && (
                        <div className="space-y-1.5 pt-1">
                          {day.generalActivities.map((act, actIdx) => (
                            <div key={actIdx} className="flex items-start gap-2 text-[11px] text-zinc-300">
                              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-1.5 shrink-0" />
                              <span className="leading-relaxed">{act}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Key Experiences & Highlights */}
          {parsed.experiences.length > 0 && (
            <div className="bg-zinc-950/70 border border-zinc-800/90 rounded-xl p-4 space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-bold text-zinc-200">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>Featured Experiences & Highlights</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                {parsed.experiences.map((exp, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 bg-zinc-900/70 border border-zinc-800/80 rounded-lg flex items-start gap-2"
                  >
                    <CheckCircle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                    <span className="text-zinc-300 text-[11px] leading-snug">{exp}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Supplier Quotation Scope */}
          {parsed.quotationScope && (
            <div className="bg-zinc-950/70 border border-indigo-500/20 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-indigo-300">
                <DollarSign className="w-4 h-4 text-indigo-400" />
                <span>Quotation Scope & Partner Requirements</span>
              </div>
              <div className="text-[11px] text-zinc-300 bg-zinc-900/60 p-3 rounded-lg border border-zinc-800/80 leading-relaxed whitespace-pre-line">
                {parsed.quotationScope}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
