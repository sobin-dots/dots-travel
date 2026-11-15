'use client';

import React, { useState, useEffect } from 'react';
import {
  Compass,
  Calendar,
  Clock,
  Users,
  DollarSign,
  Building2,
  Sparkles,
  FileText,
  X,
  AlertCircle,
  RefreshCw,
  Mail,
  User,
  MapPin,
  Check,
} from 'lucide-react';
import { useConsole } from '@/context/ConsoleContext';

export function ItineraryIntakeModal() {
  const {
    showItineraryIntakeModal,
    setShowItineraryIntakeModal,
    intakeCallTarget,
    setIntakeCallTarget,
    bearerToken,
    authFetch,
    handleGenerateItineraryWithParams,
    generatingItineraryCallId,
  } = useConsole();

  const [loadingExtraction, setLoadingExtraction] = useState(false);
  const [transcriptSnippet, setTranscriptSnippet] = useState('');
  
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
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');

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

  const runExtraction = async (callTarget: any, isMountedCheck: () => boolean = () => true) => {
    if (!callTarget?.id) return;
    setLoadingExtraction(true);
    try {
      const res = await authFetch('/api/v1/leads/extract-params', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ callId: callTarget.id }),
      });

      if (res.ok && isMountedCheck()) {
        const data = await res.json();
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
      console.warn('Extraction fetch error:', err);
    } finally {
      if (isMountedCheck()) setLoadingExtraction(false);
    }
  };

  // Extract params when modal opens
  useEffect(() => {
    if (!showItineraryIntakeModal || !intakeCallTarget) return;

    // Reset all fields before fetching transcript extraction
    setDestination('');
    setDepartureDate('');
    setReturnDate('');
    setDurationDays('');
    setHeadcountAdults('');
    setHeadcountChildren('');
    setHeadcountInfants('');
    setHotelTier('');
    setSpecialRequests('');
    setCustomerName(intakeCallTarget.contactName || '');
    setCustomerEmail(intakeCallTarget.contactEmail || '');
    setTranscriptSnippet('');

    let isMounted = true;
    runExtraction(intakeCallTarget, () => isMounted);

    return () => {
      isMounted = false;
    };
  }, [showItineraryIntakeModal, intakeCallTarget?.id, bearerToken]);

  if (!showItineraryIntakeModal || !intakeCallTarget) return null;

  const isGenerating = Boolean(generatingItineraryCallId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isGenerating) return;
    handleGenerateItineraryWithParams(intakeCallTarget.id, {
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
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-2xl my-8 overflow-hidden shadow-2xl flex flex-col">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-zinc-800 bg-zinc-900/90 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
              <Sparkles className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white tracking-tight">
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

        {/* Transcription Snippet Notice */}
        {transcriptSnippet && (
          <div className="px-5 py-3 bg-zinc-950 border-b border-zinc-800/80 flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5 min-w-0">
              <FileText className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div className="text-xs min-w-0">
                <span className="font-semibold text-zinc-300">Extracted from Call Transcript: </span>
                <span className="text-zinc-400 italic font-mono text-[11px] break-words">"{transcriptSnippet}"</span>
              </div>
            </div>
            <button
              type="button"
              disabled={loadingExtraction}
              onClick={() => runExtraction(intakeCallTarget)}
              className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] font-medium transition disabled:opacity-50 cursor-pointer"
              title="Re-extract parameters from call transcript"
            >
              <RefreshCw className={`w-3 h-3 ${loadingExtraction ? 'animate-spin' : ''}`} />
              <span>Re-Extract</span>
            </button>
          </div>
        )}

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto max-h-[70vh]">
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
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-200">
                <Calendar className="w-4 h-4 text-indigo-400" />
                <span>Trip Schedule & Dates</span>
              </div>
              {durationDays && (
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                  {durationDays} {Number(durationDays) === 1 ? 'Day' : 'Days'}
                  {Number(durationDays) > 1 ? ` / ${Number(durationDays) - 1} Nights` : ''}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              {/* Target Departure Date */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[11px] font-medium text-zinc-300 flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-indigo-400" />
                    Target Departure Date
                  </label>
                  {departureDate && returnDate && durationDays && (
                    <span className="text-[9px] font-mono text-emerald-400">Linked</span>
                  )}
                </div>
                <input
                  type="date"
                  value={departureDate}
                  onChange={(e) => handleDepartureChange(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700/80 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
                {departureDate && (
                  <p className="text-[10px] text-zinc-400 font-mono mt-1">
                    {formatDatePreview(departureDate)}
                  </p>
                )}
              </div>

              {/* Duration (Days) */}
              <div>
                <label className="block text-[11px] font-medium text-zinc-300 mb-1.5 flex items-center gap-1">
                  <Clock className="w-3 h-3 text-amber-400" />
                  Duration (Days)
                </label>
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={durationDays}
                  placeholder="e.g. 5"
                  onChange={(e) => handleDurationChange(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700/80 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                />
                {durationDays && (
                  <p className="text-[10px] text-zinc-400 font-mono mt-1">
                    {Number(durationDays)} {Number(durationDays) === 1 ? 'day trip' : 'days trip'}
                  </p>
                )}
              </div>

              {/* Target Return Date */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[11px] font-medium text-zinc-300 flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-emerald-400" />
                    Target Return Date
                  </label>
                  {departureDate && durationDays && returnDate && (
                    <span className="text-[9px] font-mono text-emerald-400 bg-emerald-500/10 px-1 rounded border border-emerald-500/20">
                      Auto-calculated
                    </span>
                  )}
                </div>
                <input
                  type="date"
                  value={returnDate}
                  onChange={(e) => handleReturnChange(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700/80 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
                {returnDate && (
                  <p className="text-[10px] text-zinc-400 font-mono mt-1">
                    {formatDatePreview(returnDate)}
                  </p>
                )}
              </div>
            </div>
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

          {/* Modal Actions */}
          <div className="pt-3 border-t border-zinc-800 flex items-center justify-between">
            <button
              type="button"
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
              disabled={isGenerating || !destination.trim()}
              className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white px-5 py-2.5 rounded-lg text-xs font-semibold flex items-center gap-2 shadow-lg shadow-indigo-600/20 transition disabled:opacity-50 cursor-pointer"
            >
              {isGenerating ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Synthesizing Customized Itinerary...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-amber-300" />
                  <span>Synthesize Bespoke Itinerary</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
