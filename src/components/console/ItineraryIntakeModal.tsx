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
    handleGenerateItineraryWithParams,
    generatingItineraryCallId,
  } = useConsole();

  const [loadingExtraction, setLoadingExtraction] = useState(false);
  const [transcriptSnippet, setTranscriptSnippet] = useState('');
  
  // Intake form state
  const [destination, setDestination] = useState('');
  const [departureDate, setDepartureDate] = useState('');
  const [durationDays, setDurationDays] = useState(5);
  const [headcountAdults, setHeadcountAdults] = useState(2);
  const [headcountChildren, setHeadcountChildren] = useState(0);
  const [headcountInfants, setHeadcountInfants] = useState(0);
  const [targetBudget, setTargetBudget] = useState(5000);
  const [hotelTier, setHotelTier] = useState('luxury_5star');
  const [specialRequests, setSpecialRequests] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');

  // Extract params when modal opens
  useEffect(() => {
    if (!showItineraryIntakeModal || !intakeCallTarget) return;

    let isMounted = true;
    const fetchExtraction = async () => {
      setLoadingExtraction(true);
      try {
        const res = await fetch('/api/v1/leads/extract-params', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${bearerToken}`,
          },
          body: JSON.stringify({ callId: intakeCallTarget.id }),
        });

        if (res.ok && isMounted) {
          const data = await res.json();
          const p = data.params;
          setDestination(p.destination || 'Dubai, United Arab Emirates');
          setDepartureDate(p.departureDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
          setDurationDays(p.durationDays || 5);
          setHeadcountAdults(p.headcountAdults ?? 2);
          setHeadcountChildren(p.headcountChildren ?? 0);
          setHeadcountInfants(p.headcountInfants ?? 0);
          setTargetBudget(p.targetBudget || 5000);
          setHotelTier(p.hotelTier || 'luxury_5star');
          setSpecialRequests(p.specialRequests || '');
          setCustomerName(p.customerName || 'Valued Client');
          setCustomerEmail(p.customerEmail || '');
          setTranscriptSnippet(data.transcriptSnippet || '');
        }
      } catch (err) {
        console.warn('Extraction fetch error:', err);
      } finally {
        if (isMounted) setLoadingExtraction(false);
      }
    };

    fetchExtraction();

    return () => {
      isMounted = false;
    };
  }, [showItineraryIntakeModal, intakeCallTarget, bearerToken]);

  if (!showItineraryIntakeModal || !intakeCallTarget) return null;

  const isGenerating = generatingItineraryCallId === intakeCallTarget.id;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleGenerateItineraryWithParams(intakeCallTarget.id, {
      destination,
      departureDate,
      durationDays: Number(durationDays),
      headcountAdults: Number(headcountAdults),
      headcountChildren: Number(headcountChildren),
      headcountInfants: Number(headcountInfants),
      targetBudget: Number(targetBudget),
      hotelTier,
      specialRequests,
      customerName,
      customerEmail,
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
          <div className="px-5 py-3 bg-zinc-950 border-b border-zinc-800/80 flex items-start gap-2.5">
            <FileText className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div className="text-xs">
              <span className="font-semibold text-zinc-300">Extracted from Call Transcript: </span>
              <span className="text-zinc-400 italic font-mono text-[11px]">"{transcriptSnippet}"</span>
            </div>
          </div>
        )}

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto max-h-[70vh]">
          {/* Destination & Departure Date */}
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
                <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                Target Departure Date
              </label>
              <input
                type="date"
                required
                value={departureDate}
                onChange={(e) => setDepartureDate(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Trip Duration & Headcount */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-zinc-950/60 p-3.5 rounded-xl border border-zinc-800/80">
            <div>
              <label className="block text-[11px] font-medium text-zinc-400 mb-1 flex items-center gap-1">
                <Clock className="w-3 h-3 text-amber-400" /> Duration (Days)
              </label>
              <input
                type="number"
                min="1"
                max="60"
                value={durationDays}
                onChange={(e) => setDurationDays(Number(e.target.value))}
                className="w-full bg-zinc-900 border border-zinc-700/80 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-zinc-400 mb-1 flex items-center gap-1">
                <Users className="w-3 h-3 text-emerald-400" /> Adults (18+)
              </label>
              <input
                type="number"
                min="1"
                max="50"
                value={headcountAdults}
                onChange={(e) => setHeadcountAdults(Number(e.target.value))}
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
                onChange={(e) => setHeadcountChildren(Number(e.target.value))}
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
                onChange={(e) => setHeadcountInfants(Number(e.target.value))}
                className="w-full bg-zinc-900 border border-zinc-700/80 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
              />
            </div>
          </div>

          {/* Budget & Hotel Tier */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1.5 flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                Target Budget ($ USD)
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-zinc-500 font-mono text-xs">$</span>
                <input
                  type="number"
                  min="500"
                  step="100"
                  value={targetBudget}
                  onChange={(e) => setTargetBudget(Number(e.target.value))}
                  placeholder="5000"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-7 pr-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>
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
                <option value="luxury_5star">🌟 5-Star Luxury Resort & Suites</option>
                <option value="boutique_4star">💎 4-Star Boutique & Heritage Hotel</option>
                <option value="chalet_villa">🏡 Private Luxury Chalet / Villa</option>
                <option value="standard_3star">🏨 3-Star Standard / Modern Comfort</option>
              </select>
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
