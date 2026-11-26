'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { formatMonthYearInput } from '@/lib/contact-fields';

const DEFAULT_TOUR_TYPES = ['Family', 'Honeymoon', 'Group', 'Solo', 'Adventure', 'Business', 'Custom'];

function formatMonthForInput(val?: string | null) {
  if (!val) return '';
  if (/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(val)) {
    const [yyyy, mm] = val.split('-');
    return `${mm}/${yyyy}`;
  }
  return val;
}

interface Props { contact?: Record<string, any>; disabled?: boolean; }
export function ContactDetailsFields({ contact = {}, disabled }: Props) {
  const field = 'w-full rounded-lg border border-zinc-700 bg-zinc-950 p-2.5 text-sm text-zinc-100 focus:border-emerald-500 focus:outline-none';

  const initialTourType = contact.tourType || '';
  const isPredefined = DEFAULT_TOUR_TYPES.some(t => t.toLowerCase() === initialTourType.toLowerCase());

  const tourOptions = useMemo(() => {
    if (initialTourType && !isPredefined) {
      return [...DEFAULT_TOUR_TYPES.slice(0, -1), initialTourType, 'Custom'];
    }
    return DEFAULT_TOUR_TYPES;
  }, [initialTourType, isPredefined]);

  const [selectedTourType, setSelectedTourType] = useState<string>(() => {
    if (!initialTourType) return '';
    const match = tourOptions.find(t => t.toLowerCase() === initialTourType.toLowerCase());
    return match || initialTourType;
  });

  const [customTourType, setCustomTourType] = useState<string>(() => {
    return !isPredefined ? initialTourType : '';
  });

  useEffect(() => {
    if (contact.tourType) {
      const match = DEFAULT_TOUR_TYPES.find(t => t.toLowerCase() === contact.tourType.toLowerCase());
      if (match) {
        setSelectedTourType(match);
        setCustomTourType('');
      } else {
        setSelectedTourType(contact.tourType);
        setCustomTourType(contact.tourType);
      }
    }
  }, [contact.tourType]);

  return <fieldset disabled={disabled} className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-zinc-400 disabled:opacity-60">
    <label className="sm:col-span-2">Full name *<input name="name" autoComplete="name" required minLength={2} maxLength={100} defaultValue={contact.name || ''} className={field} /></label>
    <label>Destination<input name="destination" maxLength={150} defaultValue={contact.destination || ''} placeholder="e.g. Singapore, Bali, Paris" className={field} /></label>
    <label>Departure city<input name="city" autoComplete="address-level2" maxLength={100} defaultValue={contact.city || ''} placeholder="e.g. Chennai, Mumbai" className={field} /></label>
    <label>
      Preferred month of travel
      <input
        name="preferredTravelMonth"
        type="text"
        placeholder="MM/YYYY (e.g. 12/2026)"
        defaultValue={formatMonthYearInput(contact.preferredTravelMonth)}
        className={field}
      />
    </label>
    <label>
      Tour type
      <input
        type="hidden"
        name="tourType"
        value={selectedTourType === 'Custom' ? (customTourType.trim() || 'Custom') : selectedTourType}
      />
      <select
        value={selectedTourType}
        onChange={(e) => setSelectedTourType(e.target.value)}
        className={field}
      >
        <option value="">Choose a tour type</option>
        {tourOptions.map((type) => (
          <option key={type} value={type}>
            {type}
          </option>
        ))}
      </select>
      {selectedTourType === 'Custom' && (
        <input
          type="text"
          value={customTourType}
          onChange={(e) => setCustomTourType(e.target.value)}
          placeholder="Specify custom tour type"
          className={`${field} mt-2`}
        />
      )}
    </label>
    <label>Number of adults<input name="numberOfAdults" type="number" min={0} max={1000} step={1} defaultValue={contact.numberOfAdults ?? ''} placeholder="Leave blank if unknown" className={field} /></label>
    <label>Number of children<input name="numberOfChildren" type="number" min={0} max={1000} step={1} defaultValue={contact.numberOfChildren ?? ''} placeholder="Leave blank if unknown" className={field} /></label>
    <label>Phone number<input name="phone" type="tel" autoComplete="tel" maxLength={40} defaultValue={contact.phone || ''} placeholder="+919876543210" className={field} /><span className="text-[11px] text-zinc-500">Include the country code.</span></label>
    <label>Email address<input name="email" type="email" autoComplete="email" defaultValue={contact.email || ''} className={field} /></label>
    <label className="sm:col-span-2">Special requirements<textarea name="specialRequirements" maxLength={5000} rows={3} defaultValue={contact.specialRequirements || ''} placeholder="Dietary needs, accessibility, room preferences, or other requests" className={field} /></label>
    <p className="sm:col-span-2 text-zinc-500">Provide a phone number or email address. Travel preferences can be completed later.</p>
    <details className="sm:col-span-2" open={!!(contact.company || contact.notes)}><summary className="cursor-pointer">Other contact details</summary><div className="grid gap-3 mt-3"><label>Company<input name="company" maxLength={100} defaultValue={contact.company || ''} className={field} /></label><label>Notes<textarea name="notes" rows={2} maxLength={500} defaultValue={contact.notes || ''} className={field} /></label></div></details>
  </fieldset>;
}
