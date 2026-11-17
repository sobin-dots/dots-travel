'use client';

import React, { useState, useEffect } from 'react';
import {
  Compass,
  Calendar,
  Clock,
  Users,
  Building2,
  Sparkles,
  FileText,
  X,
  RefreshCw,
  Mail,
  User,
  MapPin,
} from 'lucide-react';
import { useConsole } from '@/context/ConsoleContext';
import { readItineraryResponse } from '@/lib/itinerary-response';

interface IntakeCall {
  id: string;
  contactName?: string;
  contactEmail?: string;
}

interface ExtractedPreferences {
  destination?: string;
  departureDate?: string;
  returnDate?: string;
  durationDays?: number;
  headcountAdults?: number;
  headcountChildren?: number;
  headcountInfants?: number;
  hotelTier?: string;
  specialRequests?: string;
  customerName?: string;
  customerEmail?: string;
}

export function ItineraryIntakeModal() {
  const { showItineraryIntakeModal, intakeCallTarget } = useConsole();
  if (!showItineraryIntakeModal || !intakeCallTarget) return null;
  return <ItineraryIntakeForm key={intakeCallTarget.id} call={intakeCallTarget} />;
}

function ItineraryIntakeForm({ call: intakeCallTarget }: { call: IntakeCall }) {
  const {
    setShowItineraryIntakeModal,
    setIntakeCallTarget,
    authFetch,
    handleGenerateItineraryWithParams,
    generatingItineraryCallId,
  } = useConsole();

  const [loadingExtraction, setLoadingExtraction] = useState(true);
  const [transcriptSnippet, setTranscriptSnippet] = useState('');
  const [formError, setFormError] = useState('');
  const [extractionError, setExtractionError] = useState('');
  
  // Intake form state (all blank until extracted from transcript or entered by user)
  const [destination, setDestination] = useState('');
  const [departureDate, setDepartureDate] = useState('');
  const [returnDate, setReturnDate] = useState('');
  const [durationDays, setDurationDays] = useState<string>('');
  const [headcountAdults, setHeadcountAdults] = useState<string>('');
  const [headcountChildren, setHeadcountChildren] = useState<string>('');
  const [headcountInfants, setHeadcountInfants] = useState<string>('');
  const [hotelTier, setHotelTier] = useState('');
  const [specialRequests, setSpecialRequests] = useState('');
  const [customerName, setCustomerName] = useState(intakeCallTarget.contactName || '');
  const [customerEmail, setCustomerEmail] = useState(intakeCallTarget.contactEmail || '');

  const computeReturnDateStr = (depStr: string, days: string | number) => {
    const numDays = Number(days);
    if (!depStr || !numDays || numDays < 1) return '';
    const parts = depStr.split('-').map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) return '';
    const [year, month, day] = parts;
    const d = new Date(Date.UTC(year, month - 1, day));
    d.setUTCDate(d.getUTCDate() + Math.max(0, Math.round(numDays) - 1));
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dt = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${dt}`;
  };

  const computeDepartureDateStr = (retStr: string, days: string | number) => {
    const numDays = Number(days);
    if (!retStr || !numDays || numDays < 1) return '';
    const parts = retStr.split('-').map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) return '';
    const [year, month, day] = parts;
    const d = new Date(Date.UTC(year, month - 1, day));
    d.setUTCDate(d.getUTCDate() - Math.max(0, Math.round(numDays) - 1));
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dt = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${dt}`;
  };

  const computeDurationDays = (depStr: string, retStr: string) => {
    if (!depStr || !retStr) return '';
    const depParts = depStr.split('-').map(Number);
    const retParts = retStr.split('-').map(Number);
    if (depParts.length !== 3 || retParts.length !== 3 || depParts.some(isNaN) || retParts.some(isNaN)) return '';
    const depDate = new Date(Date.UTC(depParts[0], depParts[1] - 1, depParts[2]));
    const retDate = new Date(Date.UTC(retParts[0], retParts[1] - 1, retParts[2]));
    const diffDays = Math.round((retDate.getTime() - depDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    if (diffDays >= 1 && diffDays <= 60) return String(diffDays);
    return '';
  };

  const formatDatePreview = (dateStr: string) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-').map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) return '';
    const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-IN', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
  };

  const handleDepartureChange = (newDep: string) => {
    setDepartureDate(newDep);
    if (newDep && durationDays) {
      setReturnDate(computeReturnDateStr(newDep, durationDays));
    } else if (newDep && returnDate) {
      const days = computeDurationDays(newDep, returnDate);
      if (days) setDurationDays(days);
    }
  };

  const handleDurationChange = (newDur: string) => {
    setDurationDays(newDur);
    if (departureDate && newDur) {
      setReturnDate(computeReturnDateStr(departureDate, newDur));
    } else if (returnDate && newDur && !departureDate) {
      setDepartureDate(computeDepartureDateStr(returnDate, newDur));
    }
  };

  const handleReturnChange = (newRet: string) => {
    setReturnDate(newRet);
    if (departureDate && newRet) {
      const days = computeDurationDays(departureDate, newRet);
      if (days) setDurationDays(days);
    } else if (durationDays && newRet && !departureDate) {
      setDepartureDate(computeDepartureDateStr(newRet, durationDays));
    }
  };

  const runExtraction = async (callTarget: IntakeCall, isMountedCheck: () => boolean = () => true) => {
    if (!callTarget?.id) return;
    try {
      const res = await authFetch('/api/v1/leads/extract-params', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ callId: callTarget.id }),
      });

      const data = await readItineraryResponse<{ params?: ExtractedPreferences; transcriptSnippet?: string }>(res);
      if (isMountedCheck()) {
        const p = data.params || {};
        const dep = p.departureDate || '';
        const dur = p.durationDays != null ? String(p.durationDays) : '';
        const ret = p.returnDate || '';

        setDestination(p.destination || '');
        setDurationDays(dur);

        if (dep) {
          setDepartureDate(dep);
          setReturnDate(ret || (dur ? computeReturnDateStr(dep, dur) : ''));
        } else if (ret && dur) {
          setDepartureDate(computeDepartureDateStr(ret, dur));
          setReturnDate(ret);
        } else {
          setDepartureDate('');
          setReturnDate(ret);
        }

        setHeadcountAdults(p.headcountAdults != null ? String(p.headcountAdults) : '');
        setHeadcountChildren(p.headcountChildren != null ? String(p.headcountChildren) : '');
        setHeadcountInfants(p.headcountInfants != null ? String(p.headcountInfants) : '');
        setHotelTier(p.hotelTier || '');
        setSpecialRequests(p.specialRequests || '');
        const resolvedName =
          p.customerName && p.customerName !== 'Valued Client' && p.customerName !== 'Guest'
            ? p.customerName
            : callTarget.contactName || '';
        setCustomerName(resolvedName);
        setCustomerEmail(p.customerEmail || callTarget.contactEmail || '');
        setTranscriptSnippet(data.transcriptSnippet || '');
      }
    } catch (err) {
      if (isMountedCheck()) setExtractionError(err instanceof Error ? err.message : 'Could not extract trip preferences. Enter them below or retry extraction.');
    } finally {
      if (isMountedCheck()) setLoadingExtraction(false);
    }
  };

  const reExtract = () => {
    setLoadingExtraction(true);
    setExtractionError('');
    runExtraction(intakeCallTarget);
  };

  // Extract params when modal opens
  useEffect(() => {
    let isMounted = true;
    // This effect starts remote extraction; its state updates reflect the request lifecycle.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    runExtraction(intakeCallTarget, () => isMounted);

    return () => {
      isMounted = false;
    };
    // The keyed form remounts on open or when the target call changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isGenerating = Boolean(generatingItineraryCallId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isGenerating) return;
    setFormError('');
    const error = await handleGenerateItineraryWithParams(intakeCallTarget.id, {
      destination: destination.trim() || undefined,
      departureDate: departureDate || undefined,
      returnDate: returnDate || computeReturnDateStr(departureDate, durationDays) || undefined,
      durationDays: durationDays !== '' ? Number(durationDays) : undefined,
      headcountAdults: headcountAdults !== '' ? Number(headcountAdults) : undefined,
      headcountChildren: headcountChildren !== '' ? Number(headcountChildren) : undefined,
      headcountInfants: headcountInfants !== '' ? Number(headcountInfants) : undefined,
      hotelTier: hotelTier || undefined,
      specialRequests: specialRequests.trim() || undefined,
      customerName: customerName.trim() || undefined,
      customerEmail: customerEmail.trim() || undefined,
    });
    if (error) setFormError(error);
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="itinerary-intake-title" className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-3xl max-h-[calc(100dvh-2rem)] overflow-hidden shadow-2xl flex flex-col">
        {/* Modal Header */}
        <div className="shrink-0 px-5 py-4 border-b border-zinc-800 bg-zinc-900/90 flex items-start justify-between gap-3">
          <div className="flex items-start sm:items-center gap-3 min-w-0">
            <div className="shrink-0 w-10 h-10 rounded-xl bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
              <Sparkles className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 id="itinerary-intake-title" className="text-sm sm:text-base font-bold text-white tracking-tight">
                  Customize Itinerary Generation Inputs
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">
                  AI Intake Form
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Review and adjust trip preferences prefilled from the call transcription before synthesizing.
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close itinerary inputs"
            disabled={isGenerating}
            onClick={() => {
              setShowItineraryIntakeModal(false);
              setIntakeCallTarget(null);
            }}
            className="text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-zinc-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Loading Banner */}
        {loadingExtraction && (
          <div className="px-5 py-2.5 bg-indigo-950/40 border-b border-indigo-500/20 flex items-center gap-2.5 text-xs text-indigo-300">
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-400" />
            <span>Parsing speech transcript with AI to extract trip preferences...</span>
          </div>
        )}

        <form onSubmit={handleSubmit} aria-busy={isGenerating} className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 overflow-y-auto overscroll-contain">
        {/* Transcription Snippet Notice */}
        {transcriptSnippet && (
          <div className="px-5 py-3 bg-zinc-950 border-b border-zinc-800/80 flex flex-col sm:flex-row items-start justify-between gap-3">
            <div className="flex items-start gap-2.5 min-w-0">
              <FileText className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div className="text-xs min-w-0">
                <span className="font-semibold text-zinc-300">Extracted from Call Transcript: </span>
                <span className="text-zinc-400 italic font-mono text-[11px] break-words line-clamp-4">&quot;{transcriptSnippet}&quot;</span>
              </div>
            </div>
            <button
              type="button"
              disabled={loadingExtraction || isGenerating}
              onClick={reExtract}
              className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] font-medium transition disabled:opacity-50 cursor-pointer"
              title="Re-extract parameters from call transcript"
            >
              <RefreshCw className={`w-3 h-3 ${loadingExtraction ? 'animate-spin' : ''}`} />
              <span>Re-Extract</span>
            </button>
          </div>
        )}
        {extractionError && (
          <div role="alert" className="mx-5 mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
            {extractionError} You can enter the trip preferences manually.
            <button type="button" disabled={loadingExtraction || isGenerating} onClick={reExtract} className="ml-2 underline disabled:opacity-50">Retry extraction</button>
          </div>
        )}

        {/* Modal Form */}
        <fieldset disabled={isGenerating || loadingExtraction} className="min-w-0 p-5 space-y-4 disabled:opacity-70">
          {/* Destination & Accommodation Preference */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1.5 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-indigo-400" />
                Destination / Region
              </label>
              <input
                type="text"
                required
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="e.g. Dubai, United Arab Emirates"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1.5 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-indigo-400" />
                Accommodation Preference
              </label>
              <select
                value={hotelTier}
                onChange={(e) => setHotelTier(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
              >
                <option value="">-- Select Accommodation Preference --</option>
                <option value="luxury_5star">🌟 5-Star Luxury Resort & Suites</option>
                <option value="boutique_4star">💎 4-Star Boutique & Heritage Hotel</option>
                <option value="chalet_villa">🏡 Private Luxury Chalet / Villa</option>
                <option value="standard_3star">🏨 3-Star Standard / Modern Comfort</option>
              </select>
            </div>
          </div>

          {/* Trip Schedule & Dates: Target Departure Date, Duration, and Target Return Date */}
          <div className="bg-zinc-950/70 p-4 rounded-xl border border-zinc-800/90 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-200">
                <Calendar className="w-4 h-4 text-indigo-400" />
                <span>Trip Schedule & Dates</span>
              </div>
              {durationDays && (
                <span className="whitespace-nowrap text-[11px] font-mono px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                  {durationDays} {Number(durationDays) === 1 ? 'Day' : 'Days'}
                  {Number(durationDays) > 1 ? ` / ${Number(durationDays) - 1} Nights` : ''}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 items-start">
              {/* Target Departure Date */}
              <div className="min-w-0">
                <div className="min-h-8 flex items-center mb-1.5">
                  <label htmlFor="intake-departure" className="text-[11px] font-medium text-zinc-300 flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-indigo-400" />
                    Departure date
                  </label>
                </div>
                <input
                  type="date"
                  id="intake-departure"
                  value={departureDate}
                  onChange={(e) => handleDepartureChange(e.target.value)}
                  className="min-w-0 w-full h-10 bg-zinc-900 border border-zinc-700/80 rounded-lg px-2.5 text-xs text-white focus:outline-none focus:border-indigo-500 [color-scheme:dark]"
                />
                {departureDate && (
                  <p className="text-[10px] text-zinc-400 font-mono mt-1">
                    {formatDatePreview(departureDate)}
                  </p>
                )}
              </div>

              {/* Duration (Days) */}
              <div className="min-w-0">
                <label htmlFor="intake-duration" className="min-h-8 text-[11px] font-medium text-zinc-300 mb-1.5 flex items-center gap-1">
                  <Clock className="w-3 h-3 text-amber-400" />
                  Duration (Days)
                </label>
                <input
                  type="number"
                  id="intake-duration"
                  min="1"
                  max="60"
                  value={durationDays}
                  placeholder="e.g. 5"
                  onChange={(e) => handleDurationChange(e.target.value)}
                  className="min-w-0 w-full h-10 bg-zinc-900 border border-zinc-700/80 rounded-lg px-2.5 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                />
                {durationDays && (
                  <p className="text-[10px] text-zinc-400 font-mono mt-1">
                    {Number(durationDays)} {Number(durationDays) === 1 ? 'day trip' : 'days trip'}
                  </p>
                )}
              </div>

              {/* Target Return Date */}
              <div className="min-w-0">
                <div className="min-h-8 flex items-center mb-1.5">
                  <label htmlFor="intake-return" className="text-[11px] font-medium text-zinc-300 flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-emerald-400" />
                    Return date
                  </label>
                </div>
                <input
                  type="date"
                  id="intake-return"
                  min={departureDate || undefined}
                  value={returnDate}
                  onChange={(e) => handleReturnChange(e.target.value)}
                  className="min-w-0 w-full h-10 bg-zinc-900 border border-zinc-700/80 rounded-lg px-2.5 text-xs text-white focus:outline-none focus:border-indigo-500 [color-scheme:dark]"
                />
                {returnDate && (
                  <p className="text-[10px] text-zinc-400 font-mono mt-1">
                    {formatDatePreview(returnDate)}
                  </p>
                )}
              </div>
            </div>
            <p className="text-[10px] text-zinc-400">Departure, duration and return date stay linked. Change the return date to update the duration.</p>
          </div>

          {/* Trip Duration & Headcount */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-zinc-950/60 p-3.5 rounded-xl border border-zinc-800/80">
            <div>
              <label className="block text-[11px] font-medium text-zinc-400 mb-1 flex items-center gap-1">
                <Users className="w-3 h-3 text-emerald-400" /> Adults (18+)
              </label>
              <input
                type="number"
                min="1"
                max="50"
                value={headcountAdults}
                placeholder="e.g. 2"
                onChange={(e) => setHeadcountAdults(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-700/80 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-zinc-400 mb-1 flex items-center gap-1">
                <Users className="w-3 h-3 text-sky-400" /> Children (2-17)
              </label>
              <input
                type="number"
                min="0"
                max="20"
                value={headcountChildren}
                placeholder="0"
                onChange={(e) => setHeadcountChildren(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-700/80 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-zinc-400 mb-1 flex items-center gap-1">
                <Users className="w-3 h-3 text-violet-400" /> Infants (0-2)
              </label>
              <input
                type="number"
                min="0"
                max="10"
                value={headcountInfants}
                placeholder="0"
                onChange={(e) => setHeadcountInfants(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-700/80 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
              />
            </div>
          </div>

          {/* Customer Name & Email */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1.5 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-zinc-400" />
                Lead Customer Name
              </label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="e.g. Sarah Connor"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1.5 flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-zinc-400" />
                Customer Email Address
              </label>
              <input
                type="email"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                placeholder="customer@example.com"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Special Requests & Inclusions */}
          <div>
            <label className="block text-xs font-semibold text-zinc-300 mb-1.5 flex items-center gap-1.5">
              <Compass className="w-3.5 h-3.5 text-amber-400" />
              Special Requests, Inclusions & Preferences
            </label>
            <textarea
              rows={2}
              value={specialRequests}
              onChange={(e) => setSpecialRequests(e.target.value)}
              placeholder="e.g. Private airport transfer, ocean-view suite, vegetarian diet, private desert safari with sunset dinner..."
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 resize-none"
            />
          </div>

        </fieldset>
        </div>
          {/* Actions stay visible while the form scrolls. */}
          <div className="shrink-0 border-t border-zinc-800 bg-zinc-900 p-4 sm:px-5 space-y-3">
          {formError && <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">{formError}</div>}
          {isGenerating && <p role="status" className="text-xs text-indigo-300">Generating your day-by-day itinerary. Longer trips can take a few minutes. Keep this window open.</p>}
          <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3">
            <button
              type="button"
              disabled={isGenerating}
              onClick={() => {
                setShowItineraryIntakeModal(false);
                setIntakeCallTarget(null);
              }}
              className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={isGenerating || loadingExtraction || !destination.trim()}
              className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white px-5 py-2.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20 transition disabled:opacity-50 cursor-pointer"
            >
              {isGenerating ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Generating itinerary...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-amber-300" />
                  <span>Synthesize Bespoke Itinerary</span>
                </>
              )}
            </button>
          </div>
          </div>
        </form>
      </div>
    </div>
  );
}
