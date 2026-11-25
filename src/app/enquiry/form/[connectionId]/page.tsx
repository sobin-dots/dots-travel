'use client';

import React, { useEffect, useState, use } from 'react';
import {
  Compass,
  Plane,
  Calendar,
  Users,
  MapPin,
  CheckCircle2,
  Sparkles,
  Phone,
  Mail,
  Send,
  Loader2,
  AlertCircle,
  ShieldCheck,
} from 'lucide-react';
import { normalizeAndValidatePhone } from '@/lib/phone-validation';

interface FormProps {
  params: Promise<{ connectionId: string }>;
  searchParams: Promise<{ key?: string; orgId?: string }>;
}

export default function PublicEnquiryFormPage(props: FormProps) {
  const { connectionId } = use(props.params);
  const searchParams = use(props.searchParams);
  const secretKey = searchParams.key || '';
  const orgId = searchParams.orgId || '';

  const [loadingBrand, setLoadingBrand] = useState(true);
  const [brandData, setBrandData] = useState<{
    formName: string;
    organization: {
      name: string;
      logoUrl?: string | null;
      brandColor?: string | null;
      phone?: string | null;
      website?: string | null;
    };
  } | null>(null);

  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Form inputs
  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [emailAddress, setEmailAddress] = useState('');
  const [destination, setDestination] = useState('');
  const [travelMonth, setTravelMonth] = useState('');
  const [tourType, setTourType] = useState('Family');
  const [numberOfChildren, setNumberOfChildren] = useState<number>(0);
  const [specialRequirements, setSpecialRequirements] = useState('');
  const [city, setCity] = useState('');
  const [notes, setNotes] = useState('');

  // Invisible Honeypot field (hidden with CSS)
  const [botTrap, setBotTrap] = useState('');

  // 1. Fetch organization branding on page load
  useEffect(() => {
    let cancelled = false;
    async function fetchBranding() {
      try {
        const res = await fetch(`/api/v1/public/enquiry/${connectionId}`);
        if (!res.ok) {
          const err = await res.json().catch(() => null);
          throw new Error(err?.error || 'Form is currently unavailable.');
        }
        const data = await res.json();
        if (!cancelled) {
          setBrandData(data);
          setLoadingBrand(false);
        }
      } catch (err: any) {
        if (!cancelled) {
          setLoadError(err.message || 'Unable to load travel enquiry form.');
          setLoadingBrand(false);
        }
      }
    }
    fetchBranding();
    return () => {
      cancelled = true;
    };
  }, [connectionId]);

  // 2. Submit form handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // Strict Country-Specific E.164 Phone Validation
    const phoneValidation = normalizeAndValidatePhone(phoneNumber);
    if (!phoneValidation.valid) {
      setFormError(phoneValidation.error || 'Please enter a valid phone number with country code.');
      return;
    }
    const cleanedPhone = phoneValidation.phone;

    setSubmitting(true);
    try {
      const payload = {
        name: fullName,
        phone: cleanedPhone,
        email: emailAddress || undefined,
        destination: destination || undefined,
        preferredTravelMonth: travelMonth || undefined,
        tourType,
        numberOfChildren: numberOfChildren ? Number(numberOfChildren) : 0,
        specialRequirements: specialRequirements || undefined,
        city: city || undefined,
        notes: notes || undefined,
        bot_trap: botTrap, // Invisible bot trap
      };

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (secretKey) headers['x-lead-secret'] = secretKey;
      if (orgId) headers['x-org-id'] = orgId;

      const url = `/api/v1/public/enquiry/${connectionId}`;

      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      const result = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(result?.error || 'Submission failed. Please check your entries.');
      }

      setSubmitted(true);
    } catch (err: any) {
      setFormError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingBrand) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-4 text-zinc-400">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mb-3" />
        <p className="text-xs font-mono">Loading enquiry form...</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-zinc-900 border border-red-900/40 p-6 rounded-2xl text-center space-y-3">
          <AlertCircle className="w-10 h-10 text-red-400 mx-auto" />
          <h2 className="text-lg font-bold text-white">Form Unavailable</h2>
          <p className="text-xs text-zinc-400">{loadError}</p>
        </div>
      </div>
    );
  }

  const agencyName = brandData?.organization.name || 'Travel Agency';
  const brandColor = brandData?.organization.brandColor || '#6366f1';

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950 text-zinc-100 flex flex-col items-center justify-center p-4 sm:p-6 lg:p-10 font-sans">
      <div className="max-w-2xl w-full my-auto space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          {brandData?.organization.logoUrl ? (
            <img
              src={brandData.organization.logoUrl}
              alt={agencyName}
              className="h-12 sm:h-14 mx-auto object-contain mb-2"
            />
          ) : (
            <div className="w-12 h-12 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 flex items-center justify-center mx-auto mb-2 shadow-lg shadow-indigo-500/10">
              <Compass className="w-6 h-6" />
            </div>
          )}
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
            {agencyName}
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400 max-w-md mx-auto">
            {brandData?.formName ? `${brandData.formName} — ` : ''}
            Share your travel preferences and our destination specialists will craft the perfect itinerary for you.
          </p>
        </div>

        {/* Form Container */}
        <div className="bg-zinc-900/80 backdrop-blur-xl border border-zinc-800 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-black/80 relative overflow-hidden">
          {submitted ? (
            <div className="py-10 text-center space-y-4 animate-in fade-in zoom-in-95 duration-500">
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mx-auto shadow-lg shadow-emerald-500/10">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <div className="space-y-1">
                <h3 className="text-xl font-bold text-white">Enquiry Received!</h3>
                <p className="text-xs sm:text-sm text-zinc-400 max-w-sm mx-auto">
                  Thank you, <strong className="text-white">{fullName}</strong>! Our travel consultant at{' '}
                  <strong className="text-zinc-200">{agencyName}</strong> will review your details and reach out to you shortly.
                </p>
              </div>
              {brandData?.organization.phone && (
                <div className="pt-4 border-t border-zinc-800 text-xs text-zinc-500">
                  <span>Need urgent help? Call us directly: </span>
                  <a
                    href={`tel:${brandData.organization.phone}`}
                    className="text-indigo-400 font-mono font-medium hover:underline"
                  >
                    {brandData.organization.phone}
                  </a>
                </div>
              )}
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {formError && (
                <div className="p-3.5 rounded-xl bg-red-950/40 border border-red-800/60 text-xs text-red-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Invisible Bot Trap / Honeypot */}
              <div className="hidden" aria-hidden="true" style={{ display: 'none' }}>
                <label>Do not fill this field</label>
                <input
                  type="text"
                  name="bot_trap"
                  tabIndex={-1}
                  value={botTrap}
                  onChange={(e) => setBotTrap(e.target.value)}
                  autoComplete="off"
                />
              </div>

              {/* Section 1: Customer Info */}
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                    Your Full Name <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Aarav Sharma"
                    className="w-full bg-zinc-950/80 border border-zinc-700/80 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                    Phone / WhatsApp Number <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="tel"
                    required
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="+91 98765 43210"
                    className="w-full bg-zinc-950/80 border border-zinc-700/80 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-zinc-500 font-mono focus:outline-none focus:border-indigo-500 transition"
                  />
                  <p className="text-[10px] text-zinc-500 mt-1">
                    Include country code (e.g. +91 9876543210 for India, exactly 10 digits).
                  </p>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                    Email Address <span className="text-zinc-500 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="email"
                    value={emailAddress}
                    onChange={(e) => setEmailAddress(e.target.value)}
                    placeholder="aarav@example.com"
                    className="w-full bg-zinc-950/80 border border-zinc-700/80 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                    City of Residence
                  </label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="e.g. Chennai, Mumbai, Bangalore"
                    className="w-full bg-zinc-950/80 border border-zinc-700/80 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition"
                  />
                </div>
              </div>

              {/* Section 2: Trip Preferences */}
              <div className="pt-2 border-t border-zinc-800 space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                      Destination / Country
                    </label>
                    <input
                      type="text"
                      value={destination}
                      onChange={(e) => setDestination(e.target.value)}
                      placeholder="e.g. Maldives, Europe, Bali, Dubai"
                      className="w-full bg-zinc-950/80 border border-zinc-700/80 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                      Preferred Travel Month
                    </label>
                    <input
                      type="text"
                      placeholder="MM/YYYY (e.g. 12/2026)"
                      value={travelMonth}
                      onChange={(e) => setTravelMonth(e.target.value)}
                      className="w-full bg-zinc-950/80 border border-zinc-700/80 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition"
                    />
                    <span className="block text-[11px] text-zinc-500 mt-1">
                      Format: MM/YYYY (e.g. 12/2026)
                    </span>
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                      Tour Type
                    </label>
                    <select
                      value={tourType}
                      onChange={(e) => setTourType(e.target.value)}
                      className="w-full bg-zinc-950/80 border border-zinc-700/80 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500 transition"
                    >
                      <option value="Family">Family Holiday</option>
                      <option value="Honeymoon">Honeymoon / Couple</option>
                      <option value="Solo">Solo Traveler</option>
                      <option value="Friends">Group / Friends Trip</option>
                      <option value="Corporate">Corporate / MICE</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                      Number of Children (under 12)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={20}
                      value={numberOfChildren}
                      onChange={(e) => setNumberOfChildren(Number(e.target.value))}
                      className="w-full bg-zinc-950/80 border border-zinc-700/80 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500 transition"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                    Special Requests / Trip Notes
                  </label>
                  <textarea
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Tell us about your budget, preferred hotels, flights or any specific activities..."
                    className="w-full bg-zinc-950/80 border border-zinc-700/80 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition"
                  />
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 px-4 rounded-xl font-bold text-xs text-white shadow-xl flex items-center justify-center gap-2 transition disabled:opacity-60 cursor-pointer"
                style={{ backgroundColor: brandColor || '#4f46e5' }}
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Submitting Enquiry...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Submit Travel Enquiry
                  </>
                )}
              </button>

              <div className="flex items-center justify-center gap-1.5 text-[11px] text-zinc-500">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Your contact details are kept private and secure.</span>
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-[11px] text-zinc-500 font-mono">
          Powered by {agencyName} Telephony & Travel CRM
        </p>
      </div>
    </div>
  );
}
