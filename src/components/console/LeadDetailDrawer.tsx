'use client';

import React, { useState, useEffect } from 'react';
import {
  Compass,
  ChevronDown,
  Download,
  BookUser,
  Mail,
  CheckCircle2,
  AlertTriangle,
  Mic,
  RefreshCw,
  FileText,
  Edit3,
  Sparkles,
  Building2,
  Plus,
  X,
  DollarSign,
  Plane,
  Send,
  MessageSquare,
  ShieldCheck,
  Calendar,
  Layers,
  HeartHandshake,
  Clock,
  ExternalLink,
  Check,
  AlertCircle,
  FileCheck,
  Search,
  Trash2,
} from 'lucide-react';
import { useConsole } from '@/context/ConsoleContext';
import { VisualItinerary } from '@/components/VisualItinerary';

export function LeadDetailDrawer() {
  const {
    selectedLead,
    setSelectedLead,
    bearerToken,
    suppliersList,
    setShowSupplierModal,
    leadRevisionNotes,
    setLeadRevisionNotes,
    leadCustomerEmail,
    setLeadCustomerEmail,
    leadSelectedSupplierId,
    setLeadSelectedSupplierId,
    leadRevising,
    handleUpdateLeadStatus,
    handleReviseItinerary,
    fetchData,
  } = useConsole();

  // Active Drawer Tab
  const [activeTab, setActiveTab] = useState<'itinerary' | 'send_itinerary' | 'procurement' | 'pricing' | 'flights' | 'dispatch' | 'lifecycle'>('itinerary');

  // Send Itinerary (Customer & Supplier) tab state
  const [sendingToCustomer, setSendingToCustomer] = useState(false);
  const [sendingToSupplier, setSendingToSupplier] = useState(false);
  const [sendingToBoth, setSendingToBoth] = useState(false);
  const [sendItineraryMsg, setSendItineraryMsg] = useState('');
  const [sendItineraryError, setSendItineraryError] = useState('');

  // Procurement / Supplier Quotes state (P2-01, P2-02)
  const [supplierQuotes, setSupplierQuotes] = useState<any[]>([]);
  const [comparisonMatrix, setComparisonMatrix] = useState<any>(null);
  const [loadingQuotes, setLoadingQuotes] = useState(false);
  const [showAddQuoteForm, setShowAddQuoteForm] = useState(false);
  const [newQuoteSupplierId, setNewQuoteSupplierId] = useState('');
  const [newQuoteCost, setNewQuoteCost] = useState<string>('');
  const [newQuoteHotelTier, setNewQuoteHotelTier] = useState('luxury_5star');
  const [newQuoteInclusions, setNewQuoteInclusions] = useState('Luxury Suite, VIP airport transfers, gourmet breakfast');
  const [newQuoteCancellation, setNewQuoteCancellation] = useState('Full refund up to 14 days before arrival');

  // CPQ Pricing & Margins state (P2-03, P2-04, P2-07, P2-09)
  const [customerQuotes, setCustomerQuotes] = useState<any[]>([]);
  const [marginType, setMarginType] = useState<'percentage' | 'fixed_dollar'>('percentage');
  const [marginValue, setMarginValue] = useState<number>(18.0);
  const [taxPercentage, setTaxPercentage] = useState<number>(5.0);
  const [floorGuardrailMin, setFloorGuardrailMin] = useState<number>(10.0);
  const [pricingNetCost, setPricingNetCost] = useState<number>(0);
  const [savingQuote, setSavingQuote] = useState(false);

  // Flights state (P2-05)
  const [tripFlights, setTripFlights] = useState<any[]>([]);
  const [gdsSearchResults, setGdsSearchResults] = useState<any[]>([]);
  const [loadingFlights, setLoadingFlights] = useState(false);
  const [showManualFlightForm, setShowManualFlightForm] = useState(false);
  const [manualAirline, setManualAirline] = useState('Emirates');
  const [manualFlightNo, setManualFlightNo] = useState('EK 202');
  const [manualOrigin, setManualOrigin] = useState('JFK');
  const [manualDest, setManualDest] = useState('DXB');
  const [manualCabin, setManualCabin] = useState('business');
  const [manualPnr, setManualPnr] = useState('EMR882');
  const [manualDepartureDate, setManualDepartureDate] = useState('');
  const [manualArrivalDate, setManualArrivalDate] = useState('');
  const [manualBaggage, setManualBaggage] = useState('2x 32kg check-in + 14kg cabin');
  const [manualTicketCost, setManualTicketCost] = useState('3850');
  const [manualFareRules, setManualFareRules] = useState('Confirmed GDS PNR. Seat assignment included.');
  const [manualPnrSearching, setManualPnrSearching] = useState(false);
  const [savingManualFlight, setSavingManualFlight] = useState(false);
  const [flightActionMsg, setFlightActionMsg] = useState('');

  // Dispatch & Email Automation state (P2-11, P2-12, P2-13, P2-14, P2-15, P2-16)
  const [dispatching, setDispatching] = useState(false);
  const [sendEmail, setSendEmail] = useState(true);
  const [scheduleFollowUps, setScheduleFollowUps] = useState(true);
  const [dispatchSuccessMsg, setDispatchSuccessMsg] = useState('');
  const [automationLogs, setAutomationLogs] = useState<any[]>([]);

  // Lifecycle state (P2-18, P2-19, P2-20, P2-21, P2-22, P2-23)
  const [confirmingBooking, setConfirmingBooking] = useState(false);
  const [paymentMilestones, setPaymentMilestones] = useState<any[]>([]);
  const [visaChecklist, setVisaChecklist] = useState<any[]>([]);
  const [lifecycleSuccessMsg, setLifecycleSuccessMsg] = useState('');

  const computeReturnDateFromDep = (depStr: string, days: number): string => {
    if (!depStr) return '';
    const d = new Date(depStr);
    if (isNaN(d.getTime())) return '';
    d.setUTCDate(d.getUTCDate() + Math.max(0, Number(days || 1) - 1));
    return d.toISOString().split('T')[0];
  };

  // Trip Parameters editing state
  const [editBudget, setEditBudget] = useState<string>('');
  const [editDepartureDate, setEditDepartureDate] = useState<string>(
    selectedLead?.departureDate ? new Date(selectedLead.departureDate).toISOString().split('T')[0] : ''
  );
  const [editReturnDate, setEditReturnDate] = useState<string>(
    selectedLead?.returnDate ? new Date(selectedLead.returnDate).toISOString().split('T')[0] : ''
  );
  const [editDurationDays, setEditDurationDays] = useState<number>(selectedLead?.durationDays || 5);
  const [editDestination, setEditDestination] = useState<string>(selectedLead?.destination || '');
  const [editAdults, setEditAdults] = useState<number>(selectedLead?.headcountAdults || 2);
  const [editChildren, setEditChildren] = useState<number>(selectedLead?.headcountChildren || 0);
  const [editHotelTier, setEditHotelTier] = useState<string>(selectedLead?.hotelTier || 'luxury_5star');
  const [savingParams, setSavingParams] = useState(false);
  const [paramsSuccessMsg, setParamsSuccessMsg] = useState('');

  // Synchronize state when selectedLead changes
  useEffect(() => {
    if (!selectedLead) return;
    const depStr = selectedLead.departureDate
      ? new Date(selectedLead.departureDate).toISOString().split('T')[0]
      : '';
    const dur = selectedLead.durationDays || 5;
    const retStr = selectedLead.returnDate
      ? new Date(selectedLead.returnDate).toISOString().split('T')[0]
      : computeReturnDateFromDep(depStr, dur);

    setEditBudget(selectedLead.targetBudget ? String(Number(selectedLead.targetBudget)) : '');
    setEditDepartureDate(depStr);
    setEditReturnDate(retStr);
    setEditDurationDays(dur);
    setEditDestination(selectedLead.destination || '');
    setEditAdults(selectedLead.headcountAdults || 2);
    setEditChildren(selectedLead.headcountChildren || 0);
    setEditHotelTier(selectedLead.hotelTier || 'luxury_5star');
    setParamsSuccessMsg('');
    setSendItineraryMsg('');
    setSendItineraryError('');
  }, [selectedLead?.id, selectedLead?.updatedAt]);

  // Reset tab and quote states when switching to a different lead
  useEffect(() => {
    setActiveTab('itinerary');
    setSupplierQuotes(Array.isArray(selectedLead?.supplierQuotations) ? selectedLead.supplierQuotations : []);
    setCustomerQuotes(Array.isArray(selectedLead?.quotations) ? selectedLead.quotations : []);
    setComparisonMatrix(null);
    setPricingNetCost(0);
  }, [selectedLead?.id]);

  const handleSaveTripParams = async () => {
    if (!selectedLead || !bearerToken) return;
    setSavingParams(true);
    setParamsSuccessMsg('');
    try {
      const payload: Record<string, any> = {
        departureDate: editDepartureDate || null,
        returnDate: editReturnDate || computeReturnDateFromDep(editDepartureDate, editDurationDays) || null,
        durationDays: editDurationDays,
        destination: editDestination,
        headcountAdults: editAdults,
        headcountChildren: editChildren,
        hotelTier: editHotelTier,
        currency: 'INR',
      };
      if (supplierQuotes.length > 0 && editBudget !== '') {
        payload.targetBudget = Number(editBudget);
      }

      const res = await fetch(`/api/v1/leads/${selectedLead.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${bearerToken}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok && data.lead) {
        setSelectedLead(data.lead);
        setParamsSuccessMsg('✓ Trip parameters updated! Proposal PDF synchronized.');
        if (fetchData) fetchData();
        setTimeout(() => setParamsSuccessMsg(''), 4000);
      } else {
        alert(data.error || 'Failed to update parameters');
      }
    } catch (err: any) {
      alert(err.message || 'Error updating parameters');
    } finally {
      setSavingParams(false);
    }
  };

  // Fetch contextual lead data on drawer open or tab switch
  useEffect(() => {
    if (!selectedLead || !bearerToken) return;

    let isMounted = true;
    const fetchLeadSubData = async () => {
      try {
        // 1. Fetch supplier quotes & comparison matrix
        const [qRes, matrixRes, custQRes, flightsRes, autoRes, payRes, visaRes] = await Promise.all([
          fetch(`/api/v1/leads/${selectedLead.id}/supplier-quotes`, { headers: { Authorization: `Bearer ${bearerToken}` } }),
          fetch(`/api/v1/leads/${selectedLead.id}/supplier-quotes/compare`, { headers: { Authorization: `Bearer ${bearerToken}` } }),
          fetch(`/api/v1/leads/${selectedLead.id}/customer-quotes`, { headers: { Authorization: `Bearer ${bearerToken}` } }),
          fetch(`/api/v1/leads/${selectedLead.id}/flights`, { headers: { Authorization: `Bearer ${bearerToken}` } }),
          fetch(`/api/v1/leads/${selectedLead.id}/automations`, { headers: { Authorization: `Bearer ${bearerToken}` } }),
          fetch(`/api/v1/leads/${selectedLead.id}/payments`, { headers: { Authorization: `Bearer ${bearerToken}` } }),
          fetch(`/api/v1/leads/${selectedLead.id}/visa`, { headers: { Authorization: `Bearer ${bearerToken}` } }),
        ]);

        if (isMounted) {
          if (qRes.ok) {
            const data = await qRes.json();
            const fetchedQuotes = data.quotes || [];
            setSupplierQuotes(fetchedQuotes);
            const selectedOrLatest =
              fetchedQuotes.find((q: any) => q.status === 'selected') || fetchedQuotes[0];
            setPricingNetCost(selectedOrLatest?.totalNetCost ? Number(selectedOrLatest.totalNetCost) : 0);
          }
          if (matrixRes.ok) {
            const data = await matrixRes.json();
            setComparisonMatrix(data.matrix || null);
          }
          if (custQRes.ok) {
            const data = await custQRes.json();
            const fetchedCustQuotes = data.quotations || [];
            setCustomerQuotes(fetchedCustQuotes);
            if (fetchedCustQuotes[0]?.finalSellingPrice != null) {
              setEditBudget(String(Number(fetchedCustQuotes[0].finalSellingPrice)));
            }
          }
          if (flightsRes.ok) {
            const data = await flightsRes.json();
            setTripFlights(data.flights || []);
          }
          if (autoRes.ok) {
            const data = await autoRes.json();
            setAutomationLogs(data.automations || []);
          }
          if (payRes.ok) {
            const data = await payRes.json();
            setPaymentMilestones(data.milestones || []);
          }
          if (visaRes.ok) {
            const data = await visaRes.json();
            setVisaChecklist(data.checklist || []);
          }
        }
      } catch (err) {
        console.warn('Error loading lead sub-data:', err);
      }
    };

    fetchLeadSubData();

    return () => {
      isMounted = false;
    };
  }, [selectedLead?.id, bearerToken]);

  if (!selectedLead) return null;

  // Real-time Pricing Calculations (P2-04)
  const calcMarginAmount = marginType === 'percentage'
    ? (pricingNetCost * marginValue) / 100
    : Number(marginValue);
  const calcSubtotal = pricingNetCost + calcMarginAmount;
  const calcTaxAmount = (calcSubtotal * taxPercentage) / 100;
  const calcFinalPrice = calcSubtotal + calcTaxAmount;
  const effectiveMarginPercent = pricingNetCost > 0 ? (calcMarginAmount / pricingNetCost) * 100 : 0;
  const isFloorApproved = effectiveMarginPercent >= floorGuardrailMin;

  // Handler: Add Inbound Supplier Quotation (P2-01)
  const handleAddSupplierQuote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQuoteSupplierId) {
      alert('Please select a supplier');
      return;
    }
    const parsedNetCost = Number(newQuoteCost);
    if (!parsedNetCost || parsedNetCost <= 0) {
      alert('Please enter a valid Total Net Cost from the supplier');
      return;
    }

    try {
      const res = await fetch(`/api/v1/leads/${selectedLead.id}/supplier-quotes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${bearerToken}`,
        },
        body: JSON.stringify({
          supplierId: newQuoteSupplierId,
          totalNetCost: parsedNetCost,
          hotelTier: newQuoteHotelTier,
          cancellationPolicy: newQuoteCancellation,
          inclusions: newQuoteInclusions.split(',').map((s) => s.trim()),
          lineItems: [
            { category: 'accommodation', description: 'Curated Hotel Accommodations', unitCost: parsedNetCost * 0.7, totalCost: parsedNetCost * 0.7 },
            { category: 'transfer', description: 'Executive Ground Transfers', unitCost: parsedNetCost * 0.15, totalCost: parsedNetCost * 0.15 },
            { category: 'activity', description: 'Curated VIP Excursions & Guides', unitCost: parsedNetCost * 0.15, totalCost: parsedNetCost * 0.15 },
          ],
        }),
      });

      if (res.ok) {
        setShowAddQuoteForm(false);
        setNewQuoteCost('');
        const data = await res.json();
        const updatedSupplierQuotes = [data.quote, ...supplierQuotes];
        setSupplierQuotes(updatedSupplierQuotes);
        setPricingNetCost(parsedNetCost);
        setSelectedLead((prev: any) => (prev ? { ...prev, supplierQuotations: updatedSupplierQuotes } : prev));
        // Refresh comparison matrix and global leads list immediately
        const matrixRes = await fetch(`/api/v1/leads/${selectedLead.id}/supplier-quotes/compare`, {
          headers: { Authorization: `Bearer ${bearerToken}` },
        });
        if (matrixRes.ok) {
          const mData = await matrixRes.json();
          setComparisonMatrix(mData.matrix || null);
        }
        if (fetchData) await fetchData();
        alert('Supplier quotation recorded! You can now click "Generate Quote" in the Pricing & Margins tab.');
      }
    } catch (err: any) {
      alert(err.message || 'Error recording quotation');
    }
  };

  // Handler: Send Revised / New Itinerary PDF to Customer via Email
  const handleSendItineraryToCustomer = async () => {
    if (!selectedLead || !bearerToken) return;
    if (!leadCustomerEmail || !leadCustomerEmail.includes('@')) {
      setSendItineraryError('Please enter a valid customer email address.');
      return;
    }
    setSendingToCustomer(true);
    setSendItineraryMsg('');
    setSendItineraryError('');
    try {
      const res = await fetch(`/api/v1/leads/${selectedLead.id}/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${bearerToken}`,
        },
        body: JSON.stringify({
          target: 'customer',
          customerEmail: leadCustomerEmail,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        if (data.lead) {
          setSelectedLead((prev: any) => ({ ...prev, ...data.lead }));
        }
        setSendItineraryMsg(data.message || `Revised/new Itinerary PDF attached and sent to customer (${leadCustomerEmail}) via email.`);
        if (fetchData) fetchData();
      } else {
        setSendItineraryError(data.error || 'Failed to send itinerary email to customer.');
      }
    } catch (err: any) {
      setSendItineraryError(err.message || 'Error sending itinerary email to customer.');
    } finally {
      setSendingToCustomer(false);
    }
  };

  // Handler: Send Itinerary PDF to Supplier via Email to Request Quote
  const handleSendItineraryToSupplier = async () => {
    if (!selectedLead || !bearerToken) return;
    if (!leadSelectedSupplierId) {
      setSendItineraryError('Please select a partner supplier first.');
      return;
    }
    setSendingToSupplier(true);
    setSendItineraryMsg('');
    setSendItineraryError('');
    try {
      const res = await fetch(`/api/v1/leads/${selectedLead.id}/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${bearerToken}`,
        },
        body: JSON.stringify({
          target: 'supplier',
          supplierId: leadSelectedSupplierId,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        if (data.lead) {
          setSelectedLead((prev: any) => ({ ...prev, ...data.lead }));
        }
        setSendItineraryMsg(data.message || `Itinerary PDF attached and sent via email to supplier to get quote.`);
        if (fetchData) fetchData();
      } else {
        setSendItineraryError(data.error || 'Failed to send itinerary email to supplier.');
      }
    } catch (err: any) {
      setSendItineraryError(err.message || 'Error sending itinerary email to supplier.');
    } finally {
      setSendingToSupplier(false);
    }
  };

  // Handler: Send Itinerary PDF to Both Customer & Supplier via Email
  const handleSendItineraryToBoth = async () => {
    if (!selectedLead || !bearerToken) return;
    if (!leadCustomerEmail || !leadCustomerEmail.includes('@')) {
      setSendItineraryError('Please enter a valid customer email address.');
      return;
    }
    if (!leadSelectedSupplierId) {
      setSendItineraryError('Please select a partner supplier to request a quote.');
      return;
    }
    setSendingToBoth(true);
    setSendItineraryMsg('');
    setSendItineraryError('');
    try {
      const res = await fetch(`/api/v1/leads/${selectedLead.id}/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${bearerToken}`,
        },
        body: JSON.stringify({
          target: 'both',
          customerEmail: leadCustomerEmail,
          supplierId: leadSelectedSupplierId,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        if (data.lead) {
          setSelectedLead((prev: any) => ({ ...prev, ...data.lead }));
        }
        setSendItineraryMsg(data.message || `Itinerary PDF dispatched to both customer (${leadCustomerEmail}) and supplier via email.`);
        if (fetchData) fetchData();
      } else {
        setSendItineraryError(data.error || 'Failed to dispatch itinerary emails.');
      }
    } catch (err: any) {
      setSendItineraryError(err.message || 'Error dispatching itinerary emails.');
    } finally {
      setSendingToBoth(false);
    }
  };

  // Handler: Select Winning Supplier Quote (P2-02)
  const handleSelectWinningQuote = async (quoteId: string) => {
    try {
      const res = await fetch(`/api/v1/leads/${selectedLead.id}/supplier-quotes/${quoteId}/select`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${bearerToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setPricingNetCost(Number(data.quote.totalNetCost));
        const updatedSupplierQuotes = supplierQuotes.map((q) =>
          q.id === quoteId ? { ...q, status: 'selected' } : { ...q, status: 'rejected' }
        );
        setSupplierQuotes(updatedSupplierQuotes);
        setSelectedLead((prev: any) => (prev ? { ...prev, supplierQuotations: updatedSupplierQuotes } : prev));
        if (fetchData) await fetchData();
        alert(`Supplier quotation selected as winning quote!`);
      }
    } catch (err: any) {
      alert(err.message || 'Error selecting quote');
    }
  };

  // Handler: Save Customer Quotation Version (P2-03, P2-04, P2-07, P2-09)
  const handleSaveCustomerQuote = async () => {
    setSavingQuote(true);
    try {
      const res = await fetch(`/api/v1/leads/${selectedLead.id}/customer-quotes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${bearerToken}`,
        },
        body: JSON.stringify({
          supplierNetTotal: pricingNetCost,
          marginType,
          marginValue,
          taxPercentage,
          floorGuardrailMin,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const updatedCustQuotes = [data.quotation, ...customerQuotes];
        setCustomerQuotes(updatedCustQuotes);
        if (data.quotation?.finalSellingPrice != null) {
          setEditBudget(String(Number(data.quotation.finalSellingPrice)));
        }
        setSelectedLead((prev: any) =>
          prev
            ? {
                ...prev,
                quotations: updatedCustQuotes,
                targetBudget: data.quotation?.finalSellingPrice ?? prev.targetBudget,
              }
            : prev
        );
        if (fetchData) await fetchData();
        alert(`Customer quotation v${data.quotation.version} calculated and saved!`);
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to save customer quotation');
      }
    } catch (err: any) {
      alert(err.message || 'Error communicating with pricing engine');
    } finally {
      setSavingQuote(false);
    }
  };

  // Handler: GDS Live Flight Search (P2-05)
  const handleSearchGdsFlights = async () => {
    setLoadingFlights(true);
    try {
      const destCode = selectedLead.destination.toLowerCase().includes('dubai') ? 'DXB' :
                       selectedLead.destination.toLowerCase().includes('paris') ? 'CDG' :
                       selectedLead.destination.toLowerCase().includes('tokyo') ? 'HND' : 'DXB';
      const res = await fetch(`/api/v1/flights/search?origin=JFK&destination=${destCode}&cabinClass=business`, {
        headers: { Authorization: `Bearer ${bearerToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setGdsSearchResults(data.flights || []);
      }
    } catch (err) {
      console.warn('Flight search error:', err);
    } finally {
      setLoadingFlights(false);
    }
  };

  // Handler: Attach Flight to Trip File (P2-05)
  const handleAttachFlight = async (flightData: any) => {
    try {
      const res = await fetch(`/api/v1/leads/${selectedLead.id}/flights`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${bearerToken}`,
        },
        body: JSON.stringify(flightData),
      });

      if (res.ok) {
        const data = await res.json();
        setTripFlights([data.flight, ...tripFlights]);
        setFlightActionMsg(`Flight ${flightData.flightNumber} attached to trip!`);
      }
    } catch (err: any) {
      alert(err.message || 'Error attaching flight');
    }
  };

  // Handler: Lookup GDS PNR Reservation (P2-05)
  const handleLookupPnr = async (pnrOverride?: string) => {
    const codeToSearch = (pnrOverride || manualPnr || '').trim();
    if (!codeToSearch) {
      alert('Please enter a PNR code to look up (e.g. EMR882, QR702, BA178, SQ25, AI102)');
      return;
    }
    setManualPnrSearching(true);
    setFlightActionMsg('');
    try {
      const res = await fetch(`/api/v1/flights/pnr-lookup?pnr=${encodeURIComponent(codeToSearch)}`, {
        headers: { Authorization: `Bearer ${bearerToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.flight) {
          setManualPnr(data.flight.pnr || codeToSearch);
          setManualAirline(data.flight.airline || manualAirline);
          setManualFlightNo(data.flight.flightNumber || manualFlightNo);
          setManualOrigin(data.flight.origin || manualOrigin);
          setManualDest(data.flight.destination || manualDest);
          setManualCabin(data.flight.cabinClass || manualCabin);
          setManualBaggage(data.flight.baggageAllowance || manualBaggage);
          setManualTicketCost(data.flight.ticketCost !== undefined ? String(data.flight.ticketCost) : manualTicketCost);
          setManualFareRules(data.flight.fareRules || manualFareRules);
          if (data.flight.departureTime) {
            setManualDepartureDate(new Date(data.flight.departureTime).toISOString().slice(0, 16));
          }
          if (data.flight.arrivalTime) {
            setManualArrivalDate(new Date(data.flight.arrivalTime).toISOString().slice(0, 16));
          }
          setFlightActionMsg(`Verified PNR: ${data.flight.pnr} with ${data.flight.airline} (${data.flight.status}). Flight schedule prefilled!`);
        }
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to lookup PNR');
      }
    } catch (err: any) {
      alert(err.message || 'Error looking up PNR');
    } finally {
      setManualPnrSearching(false);
    }
  };

  // Handler: Save / Attach Manual PNR Flight (P2-05)
  const handleSaveManualFlight = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!manualFlightNo.trim()) {
      alert('Flight number is required (e.g. EK 202)');
      return;
    }
    if (!manualAirline.trim()) {
      alert('Airline name is required (e.g. Emirates)');
      return;
    }
    setSavingManualFlight(true);
    setFlightActionMsg('');
    try {
      const res = await fetch(`/api/v1/leads/${selectedLead.id}/flights`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${bearerToken}`,
        },
        body: JSON.stringify({
          pnr: manualPnr.trim().toUpperCase() || undefined,
          airline: manualAirline.trim(),
          flightNumber: manualFlightNo.trim(),
          origin: (manualOrigin || 'JFK').trim().toUpperCase(),
          destination: (manualDest || 'DXB').trim().toUpperCase(),
          departureTime: manualDepartureDate ? new Date(manualDepartureDate).toISOString() : undefined,
          arrivalTime: manualArrivalDate ? new Date(manualArrivalDate).toISOString() : undefined,
          cabinClass: manualCabin,
          baggageAllowance: manualBaggage,
          ticketCost: manualTicketCost ? Number(manualTicketCost) : null,
          fareRules: manualFareRules,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setTripFlights([data.flight, ...tripFlights]);
        setShowManualFlightForm(false);
        setFlightActionMsg(`Flight ${data.flight.flightNumber} (PNR: ${data.flight.pnr}) attached to trip successfully!`);
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to attach manual flight');
      }
    } catch (err: any) {
      alert(err.message || 'Error saving manual flight');
    } finally {
      setSavingManualFlight(false);
    }
  };

  // Handler: Delete / Detach Flight from Trip
  const handleDeleteFlight = async (flightId: string) => {
    if (!confirm('Remove this flight schedule from the trip file?')) return;
    try {
      const res = await fetch(`/api/v1/leads/${selectedLead.id}/flights?flightId=${flightId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${bearerToken}` },
      });
      if (res.ok) {
        setTripFlights(tripFlights.filter((f) => f.id !== flightId));
        setFlightActionMsg('Flight schedule removed from trip.');
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to remove flight');
      }
    } catch (err: any) {
      alert(err.message || 'Error removing flight');
    }
  };

  // Handler: Email Quotation Dispatch (P2-12, P2-13, P2-14, P2-15)
  const handleDispatchQuotation = async () => {
    setDispatching(true);
    setDispatchSuccessMsg('');
    try {
      const res = await fetch(`/api/v1/leads/${selectedLead.id}/send-quotation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${bearerToken}`,
        },
        body: JSON.stringify({
          sendEmail,
          scheduleAutomatedFollowUps: scheduleFollowUps,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setDispatchSuccessMsg(`Quotation dispatched successfully via Email with ${data.results?.automatedFollowUpsScheduled || 3} automated follow-ups scheduled!`);
        await fetchData();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to dispatch quotation');
      }
    } catch (err: any) {
      alert(err.message || 'Error dispatching quotation');
    } finally {
      setDispatching(false);
    }
  };

  // Handler: Supplier RFP Chasing (P2-16)
  const handleChaseRfp = async () => {
    try {
      const res = await fetch(`/api/v1/leads/${selectedLead.id}/supplier-rfp-chase`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${bearerToken}` },
      });
      if (res.ok) {
        alert('Automated SLA warning RFP reminders dispatched to partner suppliers!');
      }
    } catch (err: any) {
      alert(err.message || 'Error chasing RFPs');
    }
  };

  // Handler: Confirm Booking & Handover (P2-18)
  const handleConfirmBooking = async () => {
    setConfirmingBooking(true);
    setLifecycleSuccessMsg('');
    try {
      const res = await fetch(`/api/v1/leads/${selectedLead.id}/confirm-booking`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${bearerToken}`,
        },
        body: JSON.stringify({
          specialInstructions: 'VIP Concierge fulfillment requested with meet & greet',
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setLifecycleSuccessMsg(`Booking confirmed (${data.bookingReference})! Handed over to fulfillment desk and voucher PDF generated.`);
        await fetchData();
      }
    } catch (err: any) {
      alert(err.message || 'Error confirming booking');
    } finally {
      setConfirmingBooking(false);
    }
  };

  // Handler: Send Payment Reminder (P2-19)
  const handleSendPaymentReminder = async (paymentId: string) => {
    try {
      const res = await fetch(`/api/v1/leads/${selectedLead.id}/payments/${paymentId}/remind`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${bearerToken}` },
      });
      if (res.ok) {
        alert('Automated Email payment reminder dispatched with secure checkout link!');
      }
    } catch (err: any) {
      alert(err.message || 'Error sending payment reminder');
    }
  };

  // Handler: Toggle Visa Document Status (P2-20)
  const handleToggleVisaStatus = async (requirementId: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'verified' ? 'pending' : currentStatus === 'pending' ? 'submitted' : 'verified';
    try {
      const res = await fetch(`/api/v1/leads/${selectedLead.id}/visa`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${bearerToken}`,
        },
        body: JSON.stringify({ requirementId, status: nextStatus }),
      });
      if (res.ok) {
        setVisaChecklist(visaChecklist.map((d) => d.id === requirementId ? { ...d, status: nextStatus } : d));
      }
    } catch (err: any) {
      alert(err.message || 'Error updating visa document');
    }
  };

  // Handler: Pre-Departure Briefing (P2-21)
  const handleSendPreDeparture = async (milestone: string) => {
    try {
      const res = await fetch(`/api/v1/leads/${selectedLead.id}/pre-departure`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${bearerToken}`,
        },
        body: JSON.stringify({ milestone }),
      });
      if (res.ok) {
        alert(`Pre-departure ${milestone} briefing package dispatched to customer via Email!`);
      }
    } catch (err: any) {
      alert(err.message || 'Error dispatching briefing');
    }
  };

  // Handler: Post-Trip CSAT (P2-22)
  const handleSendCsat = async () => {
    try {
      const res = await fetch(`/api/v1/leads/${selectedLead.id}/csat`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${bearerToken}` },
      });
      if (res.ok) {
        alert('Post-trip CSAT & NPS survey invitation dispatched via Email!');
      }
    } catch (err: any) {
      alert(err.message || 'Error dispatching survey');
    }
  };

  // Handler: Loyalty Marketing (P2-23)
  const handleSendLoyalty = async () => {
    try {
      const res = await fetch(`/api/v1/leads/${selectedLead.id}/loyalty-trigger`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${bearerToken}`,
        },
        body: JSON.stringify({ campaignType: 'anniversary', promotionalDiscount: 500 }),
      });
      if (res.ok) {
        alert('$500 VIP Member Anniversary reward dispatched to customer via Email!');
      }
    } catch (err: any) {
      alert(err.message || 'Error dispatching loyalty reward');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-2 sm:p-4 overflow-hidden">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-6xl max-h-[96vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-4 sm:px-6 py-3 border-b border-zinc-800 bg-zinc-900/90 flex flex-col md:flex-row md:items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
              <Compass className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h3 className="text-base font-bold text-white tracking-tight">{selectedLead.title}</h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 font-semibold uppercase">
                  {selectedLead.stage || 'new_inquiry'}
                </span>
              </div>
              <div className="text-xs text-indigo-400 flex items-center gap-2 mt-0.5 flex-wrap">
                <span>{selectedLead.destination || 'Unspecified'}</span>
                <span className="text-zinc-600">•</span>
                <span className="text-zinc-400 font-mono text-[11px]">#{selectedLead.id.slice(0, 8)}</span>
                <span className="text-zinc-600">•</span>
                <span className="text-zinc-300 font-mono text-[11px]">
                  {selectedLead.durationDays || 5} Days • {selectedLead.headcountAdults || 2} Adults
                  {selectedLead.headcountChildren > 0 ? `, ${selectedLead.headcountChildren} Children` : ''}
                </span>
                {supplierQuotes.length > 0 && (
                  <>
                    <span className="text-zinc-600">•</span>
                    <span className="text-emerald-400 font-mono font-semibold">
                      {customerQuotes.length > 0 && customerQuotes[0]?.finalSellingPrice != null
                        ? `Quote: ₹${Number(customerQuotes[0].finalSellingPrice).toLocaleString('en-IN')}`
                        : `Supplier Net: ₹${Number(
                            (supplierQuotes.find((q: any) => q.status === 'selected') || supplierQuotes[0])?.totalNetCost || 0
                          ).toLocaleString('en-IN')}`}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Quick PDF Downloads & Close */}
          <div className="flex items-center gap-2 flex-wrap self-end md:self-auto">
            <a
              href={`/api/v1/leads/${selectedLead.id}/pdf?token=${bearerToken}`}
              target="_blank"
              rel="noreferrer"
              className="text-xs bg-red-950/60 hover:bg-red-900/80 text-red-200 px-3 py-1.5 rounded-lg border border-red-700/60 flex items-center gap-1.5 transition font-semibold shadow-sm shadow-red-900/20"
              title="Download Executive Itinerary Proposal PDF (without Sample Quotation)"
            >
              <Download className="w-3.5 h-3.5 text-red-400" />
              <span>Itinerary Proposal PDF</span>
            </a>
            {supplierQuotes.length > 0 && customerQuotes.length > 0 && (
              <a
                href={`/api/v1/leads/${selectedLead.id}/quotation-pdf?token=${bearerToken}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs bg-indigo-950/70 hover:bg-indigo-900/90 text-indigo-200 px-3 py-1.5 rounded-lg border border-indigo-600/60 flex items-center gap-1.5 transition font-semibold shadow-sm shadow-indigo-900/20"
                title="Download Branded Customer Quotation Document"
              >
                <Download className="w-3.5 h-3.5 text-indigo-400" />
                <span>Quote PDF</span>
              </a>
            )}
            <button
              type="button"
              onClick={() => setSelectedLead(null)}
              className="text-zinc-400 hover:text-white p-1.5 rounded-lg hover:bg-zinc-800 text-lg leading-none transition ml-1"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="px-4 sm:px-6 bg-zinc-950 border-b border-zinc-800 flex items-center gap-1 overflow-x-auto shrink-0 py-2">
          <button
            type="button"
            onClick={() => setActiveTab('itinerary')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition whitespace-nowrap ${
              activeTab === 'itinerary'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
            }`}
          >
            <Compass className="w-3.5 h-3.5" />
            <span>Itinerary & Revisions (P2-08)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('send_itinerary')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition whitespace-nowrap ${
              activeTab === 'send_itinerary'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
            }`}
          >
            <Mail className="w-3.5 h-3.5" />
            <span>Send Itinerary & Request Quote</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('procurement')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition whitespace-nowrap ${
              activeTab === 'procurement'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>Supplier Quotes & Matrix (P2-01, P2-02)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('pricing')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition whitespace-nowrap ${
              activeTab === 'pricing'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
            }`}
          >
            <DollarSign className="w-3.5 h-3.5" />
            <span>Pricing & Margins (P2-03, P2-04, P2-09)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('flights')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition whitespace-nowrap ${
              activeTab === 'flights'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
            }`}
          >
            <Plane className="w-3.5 h-3.5" />
            <span>Flights & Operations (P2-05)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('dispatch')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition whitespace-nowrap ${
              activeTab === 'dispatch'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
            }`}
          >
            <Send className="w-3.5 h-3.5" />
            <span>Dispatch & Drips (P2-10 - P2-15)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('lifecycle')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition whitespace-nowrap ${
              activeTab === 'lifecycle'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
            }`}
          >
            <HeartHandshake className="w-3.5 h-3.5" />
            <span>Lifecycle & Fulfillment (P2-18 - P2-23)</span>
          </button>
        </div>

        {/* Tab Contents */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {/* TAB 1: ITINERARY & AI REVISION */}
          {activeTab === 'itinerary' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Column: Contact Details, Audio & Speech Transcript */}
              <div className="lg:col-span-5 space-y-4">
                <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 space-y-3">
                  <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <BookUser className="w-3.5 h-3.5 text-emerald-400" />
                      Client Details
                    </span>
                    <span className="text-[10px] font-mono text-zinc-500">
                      Party: {selectedLead.headcountAdults || 2} Adults
                      {selectedLead.headcountChildren > 0 ? `, ${selectedLead.headcountChildren} Children` : ''}
                      {selectedLead.headcountInfants > 0 ? `, ${selectedLead.headcountInfants} Infants` : ''}
                    </span>
                  </div>
                  <div className="text-xs space-y-1">
                    <div className="font-semibold text-zinc-200">
                      {(selectedLead.contact?.name && selectedLead.contact.name !== 'Valued Client'
                        ? selectedLead.contact.name
                        : selectedLead.metadata?.customerName && selectedLead.metadata.customerName !== 'Valued Client'
                        ? selectedLead.metadata.customerName
                        : (selectedLead.customerEmail || selectedLead.contact?.email)
                        ? String(selectedLead.customerEmail || selectedLead.contact?.email)
                            .split('@')[0]
                            .replace(/[._-]+/g, ' ')
                            .replace(/\b\w/g, (c) => c.toUpperCase())
                        : 'Customer')}
                    </div>
                    <div className="text-zinc-400 font-mono text-[11px]">
                      {selectedLead.contact?.phone ||
                        selectedLead.metadata?.customerPhone ||
                        (selectedLead.call
                          ? selectedLead.call.direction === 'outbound'
                            ? selectedLead.call.to
                            : selectedLead.call.from
                          : '—')}
                    </div>
                    <div className="text-zinc-400 text-[11px]">
                      {selectedLead.customerEmail || selectedLead.contact?.email || '—'}
                    </div>
                  </div>
                </div>

                {/* Trip Parameters Editor */}
                <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 space-y-3">
                  <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Edit3 className="w-3.5 h-3.5 text-amber-400" />
                      {supplierQuotes.length > 0 ? 'Trip & Quotation Parameters' : 'Trip Parameters'}
                    </span>
                    <span className="text-[10px] font-mono text-zinc-400 bg-zinc-800/80 px-2 py-0.5 rounded">
                      Syncs with Proposal PDF
                    </span>
                  </div>

                  {paramsSuccessMsg && (
                    <div className="p-2 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5 shrink-0" />
                      <span>{paramsSuccessMsg}</span>
                    </div>
                  )}

                  <div className="space-y-2.5">
                    {/* Quotation Amount — only displayed after supplier quote is received */}
                    {supplierQuotes.length > 0 && (
                      <div>
                        <label className="block text-[11px] text-zinc-400 mb-1 font-medium">
                          Quotation Amount (₹ INR)
                        </label>
                        <div className="relative">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 font-bold text-xs">
                            ₹
                          </span>
                          <input
                            type="number"
                            value={editBudget}
                            onChange={(e) => setEditBudget(e.target.value)}
                            placeholder="Enter quoted amount"
                            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-7 pr-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                          />
                        </div>
                      </div>
                    )}

                    {/* Stay Dates */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] text-zinc-400 mb-1 font-medium">
                          Stay Departure
                        </label>
                        <input
                          type="date"
                          value={editDepartureDate}
                          onChange={(e) => {
                            const nextDep = e.target.value;
                            setEditDepartureDate(nextDep);
                            if (nextDep) {
                              setEditReturnDate(computeReturnDateFromDep(nextDep, editDurationDays));
                            }
                          }}
                          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-zinc-400 mb-1 font-medium">
                          Stay Return
                        </label>
                        <input
                          type="date"
                          value={editReturnDate}
                          onChange={(e) => {
                            const nextRet = e.target.value;
                            setEditReturnDate(nextRet);
                            if (editDepartureDate && nextRet) {
                              const diffDays =
                                Math.round(
                                  (new Date(nextRet).getTime() - new Date(editDepartureDate).getTime()) / 86400000
                                ) + 1;
                              if (diffDays >= 1 && diffDays <= 60) {
                                setEditDurationDays(diffDays);
                              }
                            }
                          }}
                          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                    </div>

                    {/* Duration & Destination */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] text-zinc-400 mb-1 font-medium">
                          Duration (Days)
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={60}
                          value={editDurationDays}
                          onChange={(e) => {
                            const nextDur = Math.max(1, parseInt(e.target.value || '1', 10));
                            setEditDurationDays(nextDur);
                            if (editDepartureDate) {
                              setEditReturnDate(computeReturnDateFromDep(editDepartureDate, nextDur));
                            }
                          }}
                          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500 font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-zinc-400 mb-1 font-medium">
                          Destination
                        </label>
                        <input
                          type="text"
                          value={editDestination}
                          onChange={(e) => setEditDestination(e.target.value)}
                          placeholder="Destination"
                          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                    </div>

                    {/* Travellers (Adults & Children) */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] text-zinc-400 mb-1 font-medium">
                          Adults
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={20}
                          value={editAdults}
                          onChange={(e) => setEditAdults(parseInt(e.target.value || '1', 10))}
                          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500 font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-zinc-400 mb-1 font-medium">
                          Children
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={20}
                          value={editChildren}
                          onChange={(e) => setEditChildren(parseInt(e.target.value || '0', 10))}
                          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500 font-mono"
                        />
                      </div>
                    </div>

                    {/* Hotel Tier */}
                    <div>
                      <label className="block text-[11px] text-zinc-400 mb-1 font-medium">
                        Hotel Category / Tier
                      </label>
                      <select
                        value={editHotelTier}
                        onChange={(e) => setEditHotelTier(e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500"
                      >
                        <option value="standard_3star">4-star hotel in a central location</option>
                        <option value="luxury_5star">5-star Luxury Hotel</option>
                        <option value="boutique_4star">4-star Boutique Hotel</option>
                        <option value="chalet_villa">Private Villa & Chalet</option>
                      </select>
                    </div>

                    {/* Save Button */}
                    <button
                      type="button"
                      onClick={handleSaveTripParams}
                      disabled={savingParams}
                      className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2 px-3 rounded-lg text-xs flex items-center justify-center gap-2 transition disabled:opacity-50 cursor-pointer shadow-md shadow-emerald-600/20"
                    >
                      {savingParams ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                      <span>{savingParams ? 'Saving Parameters...' : 'Save Parameters & Update Proposal'}</span>
                    </button>
                  </div>
                </div>

                {/* Call Audio Recording */}
                {selectedLead.call?.recordings && selectedLead.call.recordings.length > 0 && (
                  <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 space-y-2">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Mic className="w-3.5 h-3.5 text-emerald-400" />
                      Source Call Audio
                    </span>
                    <audio
                      controls
                      className="w-full h-8 rounded bg-zinc-900"
                      src={`/api/v1/recordings/${selectedLead.call.recordings[0].id}/stream`}
                    />
                  </div>
                )}

                {/* Call Speech Transcript */}
                <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 space-y-2">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-indigo-400" />
                    Verbatim Call Transcript
                  </span>
                  <div className="bg-zinc-900 p-3 rounded-lg border border-zinc-800 text-xs font-mono text-zinc-300 max-h-48 overflow-y-auto whitespace-pre-line leading-relaxed">
                    {selectedLead.call?.transcriptions?.[0]?.text || '(No transcript available)'}
                  </div>
                </div>
              </div>

              {/* Right Column: Visual Itinerary & AI Revision */}
              <div className="lg:col-span-7 space-y-5">
                <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800">
                  <VisualItinerary
                    itineraryText={selectedLead.itinerary}
                    destination={selectedLead.destination}
                    leadTitle={selectedLead.title}
                    durationDays={selectedLead.durationDays}
                  />
                </div>

                {/* Prompt for Corrections & Revisions (P2-08) */}
                <div className="bg-gradient-to-br from-indigo-950/30 to-zinc-950 p-4 rounded-xl border border-indigo-500/20 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-zinc-200 flex items-center gap-1.5">
                      <Edit3 className="w-3.5 h-3.5 text-indigo-400" />
                      Revise Itinerary with AI (P2-08)
                    </span>
                    <span className="text-[10px] text-indigo-300 font-medium">Hotel Swaps & Route Changes</span>
                  </div>
                  <textarea
                    rows={2}
                    placeholder="e.g. Upgrade hotel to 5-star beachfront suite, swap day 2 museum for private catamaran cruise..."
                    value={leadRevisionNotes}
                    onChange={(e) => setLeadRevisionNotes(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500 resize-none"
                  />
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleReviseItinerary}
                      disabled={leadRevising || !leadRevisionNotes.trim()}
                      className="bg-indigo-600 hover:bg-indigo-500 text-white px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition disabled:opacity-50 cursor-pointer"
                    >
                      {leadRevising ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3 text-amber-300" />}
                      <span>{leadRevising ? 'Revising...' : 'Revise with AI'}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2 (NEXT TO ITINERARY & REVISIONS): SEND REVISED/NEW ITINERARY TO CUSTOMER & SEND TO SUPPLIER TO GET QUOTE */}
          {activeTab === 'send_itinerary' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <Mail className="w-4 h-4 text-indigo-400" />
                    Send Revised / New Itinerary to Customer & Supplier (Email with PDF Attachment)
                  </h4>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Step 1: Email the revised or newly generated Itinerary PDF to the customer for review. Step 2: Email the Itinerary PDF to a partner supplier to request their net quote.
                  </p>
                </div>
                <a
                  href={`/api/v1/leads/${selectedLead.id}/pdf?type=customer&token=${bearerToken}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-3 py-1.5 rounded-lg border border-zinc-700 flex items-center gap-1.5 transition shrink-0"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Preview Attached Itinerary PDF</span>
                </a>
              </div>

              {sendItineraryMsg && (
                <div className="p-3 bg-emerald-950/80 border border-emerald-500/40 rounded-xl text-xs text-emerald-300 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>{sendItineraryMsg}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('procurement')}
                    className="text-[11px] bg-emerald-600/30 hover:bg-emerald-600 text-emerald-200 hover:text-white px-2.5 py-1 rounded font-semibold transition shrink-0"
                  >
                    Go to Supplier Quotes &rarr;
                  </button>
                </div>
              )}

              {sendItineraryError && (
                <div className="p-3 bg-rose-950/80 border border-rose-500/40 rounded-xl text-xs text-rose-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{sendItineraryError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* STEP 1: SEND REVISED / NEW ITINERARY TO CUSTOMER */}
                <div className="bg-zinc-950 p-5 rounded-xl border border-zinc-800 flex flex-col justify-between space-y-4">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 flex items-center justify-center font-mono text-xs font-bold">
                          01
                        </div>
                        <div>
                          <div className="text-xs font-bold text-white">Send Revised / New Itinerary to Customer</div>
                          <div className="text-[11px] text-zinc-400">Dispatches email with the Itinerary PDF attached</div>
                        </div>
                      </div>
                      {selectedLead.customerSentAt && (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/50">
                          Sent {new Date(selectedLead.customerSentAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>

                    <div className="space-y-3 text-xs">
                      <div>
                        <label className="block text-[11px] text-zinc-400 mb-1 font-medium">
                          Customer Recipient Email *
                        </label>
                        <input
                          type="email"
                          value={leadCustomerEmail}
                          onChange={(e) => setLeadCustomerEmail(e.target.value)}
                          placeholder="customer@example.com"
                          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                        />
                      </div>

                      <div className="p-3 bg-zinc-900/70 rounded-lg border border-zinc-800/80 space-y-1 text-[11px] text-zinc-400">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-zinc-300">Attachment:</span>
                          <span className="font-mono text-indigo-300">
                            {(selectedLead.destination || 'Destination').replace(/[^a-zA-Z0-9]/g, '_')}_Itinerary.pdf
                          </span>
                        </div>
                        <div>
                          Includes Cover, Trip Overview, Guest Preferences, Day-by-Day Itinerary, Accommodation, Inclusions, Exclusions, and Company Details (without Sample Quotation sheet).
                        </div>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleSendItineraryToCustomer}
                    disabled={sendingToCustomer || !leadCustomerEmail.trim()}
                    className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition shadow-md shadow-indigo-600/20 disabled:opacity-50 cursor-pointer"
                  >
                    {sendingToCustomer ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Sending Itinerary PDF to Customer...</span>
                      </>
                    ) : (
                      <>
                        <Mail className="w-3.5 h-3.5" />
                        <span>Send Revised / New Itinerary to Customer (Email PDF)</span>
                      </>
                    )}
                  </button>
                </div>

                {/* STEP 2: SEND ITINERARY TO SUPPLIER TO GET QUOTE */}
                <div className="bg-zinc-950 p-5 rounded-xl border border-zinc-800 flex flex-col justify-between space-y-4">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-500/30 text-amber-400 flex items-center justify-center font-mono text-xs font-bold">
                          02
                        </div>
                        <div>
                          <div className="text-xs font-bold text-white">Send Itinerary to Supplier to Get Quote</div>
                          <div className="text-[11px] text-zinc-400">Dispatches RFQ email with the Itinerary PDF attached</div>
                        </div>
                      </div>
                      {selectedLead.supplierSentAt && (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/50">
                          RFQ Sent {new Date(selectedLead.supplierSentAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>

                    <div className="space-y-3 text-xs">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[11px] text-zinc-400 font-medium">
                            Select Partner Supplier (DMC / Hotel / Operator) *
                          </label>
                          <button
                            type="button"
                            onClick={() => setShowSupplierModal(true)}
                            className="text-[11px] text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1"
                          >
                            <Plus className="w-3 h-3" /> Add Supplier
                          </button>
                        </div>
                        <select
                          value={leadSelectedSupplierId}
                          onChange={(e) => setLeadSelectedSupplierId(e.target.value)}
                          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                        >
                          <option value="">-- Select Partner Supplier --</option>
                          {suppliersList.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name} ({s.category}) — {s.email}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="p-3 bg-zinc-900/70 rounded-lg border border-zinc-800/80 space-y-1 text-[11px] text-zinc-400">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-zinc-300">Attachment:</span>
                          <span className="font-mono text-amber-300">
                            RFQ_{(selectedLead.destination || 'Destination').replace(/[^a-zA-Z0-9]/g, '_')}_Quotation.pdf
                          </span>
                        </div>
                        <div>
                          Sends the full itinerary specification PDF to the supplier requesting net contracted rates, room availability, and booking terms.
                        </div>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleSendItineraryToSupplier}
                    disabled={sendingToSupplier || !leadSelectedSupplierId}
                    className="w-full py-2.5 px-4 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition shadow-md shadow-amber-600/20 disabled:opacity-50 cursor-pointer"
                  >
                    {sendingToSupplier ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Sending Itinerary PDF to Supplier...</span>
                      </>
                    ) : (
                      <>
                        <Building2 className="w-3.5 h-3.5" />
                        <span>Send Itinerary to Supplier to Get Quote (Email PDF)</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Combined One-Click Send to Both */}
              <div className="bg-zinc-950/90 p-4 rounded-xl border border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="text-xs text-zinc-400">
                  Want to dispatch both emails simultaneously? Click to email the revised Itinerary PDF to the customer and the RFQ Itinerary PDF to the selected supplier at once.
                </div>
                <button
                  type="button"
                  onClick={handleSendItineraryToBoth}
                  disabled={sendingToBoth || !leadCustomerEmail.trim() || !leadSelectedSupplierId}
                  className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white rounded-lg text-xs font-semibold flex items-center gap-2 transition shrink-0 disabled:opacity-50 cursor-pointer"
                >
                  {sendingToBoth ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  <span>{sendingToBoth ? 'Sending Both...' : 'Send to Both Customer & Supplier'}</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: SUPPLIER QUOTES & MATRIX (P2-01, P2-02, P2-16) */}
          {activeTab === 'procurement' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-amber-400" />
                    Supplier Quotation Management & Comparison Matrix (P2-01, P2-02)
                  </h4>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Capture inbound DMC quotes with line items, compare options side-by-side, and chase slow RFPs.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleChaseRfp}
                    className="text-xs bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 px-3 py-1.5 rounded-lg border border-amber-500/30 font-medium transition flex items-center gap-1.5"
                    title="Send automated reminders to slow-responding suppliers before SLA breach"
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>Chase Outstanding RFPs (P2-16)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAddQuoteForm(!showAddQuoteForm)}
                    className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3.5 py-1.5 rounded-lg font-semibold transition flex items-center gap-1.5 shadow-md shadow-indigo-600/20"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Supplier Quote</span>
                  </button>
                </div>
              </div>

              {/* Add Quote Inline Form */}
              {showAddQuoteForm && (
                <form onSubmit={handleAddSupplierQuote} className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 space-y-4">
                  <div className="text-xs font-bold text-white">Record New Supplier Quotation</div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] text-zinc-400 mb-1">Select Supplier *</label>
                      <select
                        required
                        value={newQuoteSupplierId}
                        onChange={(e) => setNewQuoteSupplierId(e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-xs text-white"
                      >
                        <option value="">-- Choose Supplier --</option>
                        {suppliersList.map((s) => (
                          <option key={s.id} value={s.id}>{s.name} ({s.category})</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] text-zinc-400 mb-1">Total Net Cost (₹ INR) *</label>
                      <input
                        type="number"
                        required
                        min="1"
                        value={newQuoteCost}
                        onChange={(e) => setNewQuoteCost(e.target.value)}
                        placeholder="e.g. 145000"
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-xs text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-zinc-400 mb-1">Hotel Category</label>
                      <select
                        value={newQuoteHotelTier}
                        onChange={(e) => setNewQuoteHotelTier(e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-xs text-white"
                      >
                        <option value="luxury_5star">5-Star Luxury Resort</option>
                        <option value="boutique_4star">4-Star Boutique</option>
                        <option value="chalet_villa">Private Luxury Villa</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-1">Inclusions (Comma separated)</label>
                    <input
                      type="text"
                      value={newQuoteInclusions}
                      onChange={(e) => setNewQuoteInclusions(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-xs text-white"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowAddQuoteForm(false)}
                      className="px-3 py-1.5 bg-zinc-800 text-zinc-300 text-xs rounded-lg"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-lg"
                    >
                      Save Supplier Quote
                    </button>
                  </div>
                </form>
              )}

              {/* Side-by-Side Comparison Matrix (P2-02) */}
              {comparisonMatrix?.quotes?.length > 0 ? (
                <div className="bg-zinc-950 rounded-xl border border-zinc-800 overflow-hidden">
                  <div className="p-3 bg-zinc-900/60 border-b border-zinc-800 flex items-center justify-between">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-indigo-400" />
                      Side-by-Side Quotation Comparison Matrix
                    </span>
                    <span className="text-[10px] text-zinc-400 font-mono">
                      Lowest Net: ₹{comparisonMatrix.lowestCost?.toLocaleString('en-IN')} INR
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs min-w-[700px]">
                      <thead className="bg-zinc-900 text-zinc-400 border-b border-zinc-800">
                        <tr>
                          <th className="py-2.5 px-3">Supplier Name</th>
                          <th className="py-2.5 px-3">Net Cost</th>
                          <th className="py-2.5 px-3">Cost Delta</th>
                          <th className="py-2.5 px-3">Hotel Tier</th>
                          <th className="py-2.5 px-3">Inclusions</th>
                          <th className="py-2.5 px-3 text-right">Procurement Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                        {comparisonMatrix.quotes.map((q: any) => (
                          <tr key={q.id} className={q.isLowestCost ? 'bg-emerald-950/20' : ''}>
                            <td className="py-3 px-3">
                              <div className="font-semibold text-white flex items-center gap-1.5">
                                <span>{q.supplierName}</span>
                                {q.isLowestCost && (
                                  <span className="text-[9px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded font-mono">
                                    Best Rate
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] text-zinc-500 font-mono">{q.quoteReference}</span>
                            </td>
                            <td className="py-3 px-3 font-mono font-bold text-emerald-400">
                              ₹{q.totalNetCost.toLocaleString('en-IN')}
                            </td>
                            <td className="py-3 px-3 font-mono text-[11px]">
                              {q.isLowestCost ? (
                                <span className="text-zinc-500">Baseline</span>
                              ) : (
                                <span className="text-amber-400">+₹{q.deltaFromLowest.toLocaleString('en-IN')} (+{q.deltaPercentage}%)</span>
                              )}
                            </td>
                            <td className="py-3 px-3 text-[11px] capitalize">
                              {q.hotelTier ? q.hotelTier.replace('_', ' ') : 'Standard'}
                            </td>
                            <td className="py-3 px-3 text-[11px] text-zinc-400 max-w-xs truncate">
                              {q.inclusions?.join(', ') || 'Standard package'}
                            </td>
                            <td className="py-3 px-3 text-right">
                              {q.isSelected ? (
                                <span className="text-[10px] text-emerald-400 font-semibold px-2 py-1 rounded bg-emerald-950/80 border border-emerald-800/40">
                                  Selected Winner
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleSelectWinningQuote(q.id)}
                                  className="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-2.5 py-1 rounded transition"
                                >
                                  Select Winning Quote
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="py-8 bg-zinc-950 border border-zinc-800 rounded-xl text-center text-xs text-zinc-500">
                  No supplier quotations recorded yet. Click "Add Supplier Quote" above or send RFQs.
                </div>
              )}
            </div>
          )}

          {/* TAB 3: PRICING & MARGIN ENGINE (P2-03, P2-04, P2-07, P2-09) */}
          {activeTab === 'pricing' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-emerald-400" />
                    Staff Manual Margin Entry & Real-Time Selling Price Engine (P2-03, P2-04)
                  </h4>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Dynamic calculation combining supplier net cost, manual margins, tax rates, and floor guardrail thresholds.
                  </p>
                </div>

                {supplierQuotes.length > 0 && customerQuotes.length > 0 && (
                  <a
                    href={`/api/v1/leads/${selectedLead.id}/quotation-pdf?token=${bearerToken}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3.5 py-2 rounded-lg font-semibold flex items-center gap-1.5 transition shadow-md shadow-indigo-600/20 shrink-0"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download Quote PDF (v{customerQuotes[0]?.version || 1})</span>
                  </a>
                )}
              </div>

              {supplierQuotes.length === 0 && (
                <div className="p-3.5 bg-amber-950/60 border border-amber-500/40 rounded-xl text-xs text-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>
                      Please feed a quote from a supplier in <strong>Supplier Quotes &amp; Matrix</strong> first, then click <strong>Generate Quote</strong> below to unlock the <strong>Quote PDF</strong> button.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('procurement')}
                    className="px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 rounded-lg font-semibold transition shrink-0 cursor-pointer"
                  >
                    Feed Supplier Quote &rarr;
                  </button>
                </div>
              )}

              {/* Pricing Formula Card & Calculator */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                {/* Inputs Column (6 cols) */}
                <div className="lg:col-span-6 bg-zinc-950 p-4 rounded-xl border border-zinc-800 space-y-4">
                  <div className="text-xs font-bold text-white border-b border-zinc-800/80 pb-2">
                    Adjust Pricing & Margin Parameters
                  </div>

                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-1">Supplier Procurement Net Cost (₹ INR)</label>
                    <input
                      type="number"
                      value={pricingNetCost}
                      onChange={(e) => setPricingNetCost(Number(e.target.value))}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-xs text-white font-mono"
                    />
                  </div>

                  {/* Margin Type Selector */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] text-zinc-400 mb-1">Margin Mode</label>
                      <select
                        value={marginType}
                        onChange={(e) => setMarginType(e.target.value as any)}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-xs text-white"
                      >
                        <option value="percentage">% Percentage</option>
                        <option value="fixed_dollar">₹ Fixed Amount</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] text-zinc-400 mb-1">
                        {marginType === 'percentage' ? 'Margin Value (%)' : 'Margin Amount (₹)'}
                      </label>
                      <input
                        type="number"
                        step="0.5"
                        value={marginValue}
                        onChange={(e) => setMarginValue(Number(e.target.value))}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-xs text-white font-mono"
                      />
                    </div>
                  </div>

                  {/* Tax Rate & Floor Guardrail */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] text-zinc-400 mb-1">Taxes / Fees (%)</label>
                      <input
                        type="number"
                        step="0.5"
                        value={taxPercentage}
                        onChange={(e) => setTaxPercentage(Number(e.target.value))}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-xs text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-zinc-400 mb-1">Floor Guardrail Min (%)</label>
                      <input
                        type="number"
                        step="1"
                        value={floorGuardrailMin}
                        onChange={(e) => setFloorGuardrailMin(Number(e.target.value))}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-xs text-white font-mono"
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleSaveCustomerQuote}
                    disabled={savingQuote || supplierQuotes.length === 0}
                    className="w-full py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-lg text-xs font-semibold shadow-md transition disabled:opacity-50 cursor-pointer"
                  >
                    {savingQuote
                      ? 'Generating Quote...'
                      : supplierQuotes.length === 0
                      ? 'Feed Supplier Quote First to Generate Quote'
                      : 'Generate Quote (v' + ((customerQuotes[0]?.version || 0) + 1) + ')'}
                  </button>
                </div>

                {/* Real-time Formula Breakdown Column (6 cols) */}
                <div className="lg:col-span-6 bg-zinc-950 p-4 rounded-xl border border-zinc-800 flex flex-col justify-between">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
                      <span className="text-xs font-bold text-white">Live Selling Price Breakdown (P2-04)</span>
                      {isFloorApproved ? (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                          <Check className="w-2.5 h-2.5" /> Guardrail Passed ({effectiveMarginPercent.toFixed(1)}%)
                        </span>
                      ) : (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/30 flex items-center gap-1">
                          <AlertTriangle className="w-2.5 h-2.5" /> Margin Below Floor ({effectiveMarginPercent.toFixed(1)}% &lt; {floorGuardrailMin}%)
                        </span>
                      )}
                    </div>

                    <div className="space-y-2 text-xs font-mono">
                      <div className="flex items-center justify-between py-1 text-zinc-400">
                        <span>Supplier Net Cost:</span>
                        <span>₹{pricingNetCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex items-center justify-between py-1 text-indigo-300">
                        <span>Staff Margin ({effectiveMarginPercent.toFixed(1)}%):</span>
                        <span>+₹{calcMarginAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex items-center justify-between py-1 text-zinc-400 border-t border-zinc-800/80 pt-1">
                        <span>Subtotal before Tax:</span>
                        <span>₹{calcSubtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex items-center justify-between py-1 text-zinc-400">
                        <span>Taxes & Compliance ({taxPercentage}%):</span>
                        <span>+₹{calcTaxAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-zinc-900/80 p-3 rounded-lg border border-zinc-800 mt-4 flex items-center justify-between">
                    <div>
                      <div className="text-[10px] text-zinc-400 uppercase tracking-wider font-semibold">Final Customer Selling Price</div>
                      <div className="text-xl font-bold font-mono text-emerald-400">
                        ₹{calcFinalPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })} INR
                      </div>
                    </div>
                    <span className="text-[10px] font-mono text-zinc-500">Real-time CPQ</span>
                  </div>
                </div>
              </div>

              {/* Version History & Diff Audit Log (P2-09) */}
              <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 space-y-3">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-indigo-400" />
                  Quotation Version History & Audit Log (P2-09)
                </span>
                {customerQuotes.length === 0 ? (
                  <div className="py-4 text-center text-xs text-zinc-500">No quotation versions created yet.</div>
                ) : (
                  <div className="space-y-2">
                    {customerQuotes.map((q) => (
                      <div key={q.id} className="p-3 bg-zinc-900 rounded-lg border border-zinc-800 flex items-center justify-between text-xs">
                        <div>
                          <div className="font-semibold text-white flex items-center gap-2">
                            <span>Version {q.versionLabel || `v${q.version}`}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 uppercase font-mono">
                              {q.status}
                            </span>
                          </div>
                          <div className="text-[11px] text-zinc-400 font-mono mt-0.5">
                            Net: ₹{Number(q.supplierNetTotal).toLocaleString('en-IN')} • Margin: ₹{Number(q.marginAmount).toLocaleString('en-IN')} • Tax: ₹{Number(q.taxAmount).toLocaleString('en-IN')}
                          </div>
                        </div>
                        <div className="text-right font-mono">
                          <div className="text-sm font-bold text-emerald-400">
                            ₹{Number(q.finalSellingPrice).toLocaleString('en-IN')} INR
                          </div>
                          {q.diff?.hasChanged && (
                            <div className="text-[10px] text-indigo-400">
                              Diff: {q.diff.priceDelta > 0 ? `+` : ''}₹{q.diff.priceDelta.toLocaleString('en-IN')}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: FLIGHT OPERATIONS (P2-05) */}
          {activeTab === 'flights' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <Plane className="w-4 h-4 text-sky-400" />
                    Flight Operations & GDS Schedules (P2-05)
                  </h4>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Live flight aggregator search with 1-click attachment or manual PNR / ticket cost entry.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSearchGdsFlights}
                    disabled={loadingFlights}
                    className="text-xs bg-sky-600/20 hover:bg-sky-600/30 text-sky-300 px-3 py-1.5 rounded-lg border border-sky-500/30 font-medium transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingFlights ? 'animate-spin' : ''}`} />
                    <span>Search GDS Flights</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowManualFlightForm(!showManualFlightForm)}
                    className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg font-semibold transition flex items-center gap-1.5 cursor-pointer shadow-md shadow-indigo-600/20"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{showManualFlightForm ? 'Close Manual PNR' : 'Manual PNR Entry'}</span>
                  </button>
                </div>
              </div>

              {flightActionMsg && (
                <div className="p-3 bg-emerald-950/80 border border-emerald-500/40 rounded-xl text-xs text-emerald-300 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>{flightActionMsg}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFlightActionMsg('')}
                    className="text-emerald-400 hover:text-emerald-200 text-xs font-bold"
                  >
                    &times;
                  </button>
                </div>
              )}

              {/* Manual PNR Entry Form Card */}
              {showManualFlightForm && (
                <div className="bg-gradient-to-br from-indigo-950/40 via-zinc-900 to-zinc-950 p-4 sm:p-5 rounded-xl border border-indigo-500/40 shadow-xl space-y-4">
                  <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                        <Plane className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-white flex items-center gap-2">
                          <span>Manual PNR Flight Entry & GDS Ingestion</span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-semibold">
                            P2-05 Operations
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-400 mt-0.5">
                          Enter passenger booking PNR to auto-fetch airline GDS record, or manually specify schedules and fares.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowManualFlightForm(false)}
                      className="p-1 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition cursor-pointer"
                      title="Close form"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* PNR Code & GDS Lookup Bar */}
                  <div className="bg-zinc-900/90 p-3.5 rounded-lg border border-indigo-500/30 space-y-2">
                    <label className="text-[11px] font-bold text-zinc-200 uppercase tracking-wider flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                        PNR Reservation Code (GDS / Airline Record Locator)
                      </span>
                      <span className="text-[10px] font-mono text-zinc-400 font-normal">
                        e.g. 6-character alphanumeric
                      </span>
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={manualPnr}
                        onChange={(e) => setManualPnr(e.target.value.toUpperCase())}
                        placeholder="Enter PNR code (e.g. EMR882, QR702, BA178)"
                        className="flex-1 bg-zinc-950 border border-zinc-700/80 rounded-lg px-3 py-2 text-xs font-mono font-bold tracking-wider text-emerald-400 focus:outline-none focus:border-indigo-500 uppercase"
                      />
                      <button
                        type="button"
                        onClick={() => handleLookupPnr()}
                        disabled={manualPnrSearching || !manualPnr.trim()}
                        className="px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs flex items-center gap-1.5 transition disabled:opacity-50 cursor-pointer shadow-md shrink-0"
                        title="Query GDS reservation systems to auto-fill flight details"
                      >
                        {manualPnrSearching ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>Querying GDS...</span>
                          </>
                        ) : (
                          <>
                            <Search className="w-3.5 h-3.5" />
                            <span>Lookup PNR</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Quick PNR Presets */}
                    <div className="flex items-center gap-1.5 flex-wrap pt-1 text-[10px]">
                      <span className="text-zinc-500 font-mono">Quick PNRs:</span>
                      {[
                        { code: 'EMR882', label: 'Emirates (EK 202)' },
                        { code: 'QR702', label: 'Qatar (QR 702)' },
                        { code: 'BA178', label: 'British Airways (BA 178)' },
                        { code: 'SQ25', label: 'Singapore Air (SQ 25)' },
                        { code: 'AI102', label: 'Air India (AI 102)' },
                      ].map((item) => (
                        <button
                          key={item.code}
                          type="button"
                          onClick={() => {
                            setManualPnr(item.code);
                            handleLookupPnr(item.code);
                          }}
                          className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-mono border border-zinc-700/60 transition cursor-pointer"
                        >
                          {item.code} • {item.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Flight Details Input Grid */}
                  <form onSubmit={handleSaveManualFlight} className="space-y-3.5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                      <div>
                        <label className="block text-zinc-400 text-[10px] uppercase font-bold mb-1">Airline Name</label>
                        <input
                          type="text"
                          value={manualAirline}
                          onChange={(e) => setManualAirline(e.target.value)}
                          placeholder="e.g. Emirates"
                          className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-zinc-200 font-medium focus:outline-none focus:border-indigo-500"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-zinc-400 text-[10px] uppercase font-bold mb-1">Flight Number</label>
                        <input
                          type="text"
                          value={manualFlightNo}
                          onChange={(e) => setManualFlightNo(e.target.value.toUpperCase())}
                          placeholder="e.g. EK 202"
                          className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-zinc-200 font-mono font-semibold focus:outline-none focus:border-indigo-500 uppercase"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-zinc-400 text-[10px] uppercase font-bold mb-1">Origin Airport</label>
                        <input
                          type="text"
                          value={manualOrigin}
                          onChange={(e) => setManualOrigin(e.target.value.toUpperCase())}
                          placeholder="e.g. JFK"
                          className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-zinc-200 font-mono uppercase focus:outline-none focus:border-indigo-500"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-zinc-400 text-[10px] uppercase font-bold mb-1">Destination Airport</label>
                        <input
                          type="text"
                          value={manualDest}
                          onChange={(e) => setManualDest(e.target.value.toUpperCase())}
                          placeholder="e.g. DXB"
                          className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-zinc-200 font-mono uppercase focus:outline-none focus:border-indigo-500"
                          required
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                      <div>
                        <label className="block text-zinc-400 text-[10px] uppercase font-bold mb-1">Cabin Class</label>
                        <select
                          value={manualCabin}
                          onChange={(e) => setManualCabin(e.target.value)}
                          className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-zinc-200 focus:outline-none focus:border-indigo-500"
                        >
                          <option value="economy">Economy</option>
                          <option value="premium_economy">Premium Economy</option>
                          <option value="business">Business Class</option>
                          <option value="first">First Class</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-zinc-400 text-[10px] uppercase font-bold mb-1">Ticket Cost (₹ INR)</label>
                        <input
                          type="number"
                          step="1"
                          value={manualTicketCost}
                          onChange={(e) => setManualTicketCost(e.target.value)}
                          placeholder="e.g. 38500"
                          className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-emerald-400 font-mono font-bold focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-zinc-400 text-[10px] uppercase font-bold mb-1">Departure Schedule</label>
                        <input
                          type="datetime-local"
                          value={manualDepartureDate}
                          onChange={(e) => setManualDepartureDate(e.target.value)}
                          className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-zinc-200 text-xs font-mono focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-zinc-400 text-[10px] uppercase font-bold mb-1">Arrival Schedule</label>
                        <input
                          type="datetime-local"
                          value={manualArrivalDate}
                          onChange={(e) => setManualArrivalDate(e.target.value)}
                          className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-zinc-200 text-xs font-mono focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div>
                        <label className="block text-zinc-400 text-[10px] uppercase font-bold mb-1">Baggage Allowance</label>
                        <input
                          type="text"
                          value={manualBaggage}
                          onChange={(e) => setManualBaggage(e.target.value)}
                          placeholder="e.g. 2x 32kg check-in + 14kg cabin"
                          className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-zinc-200 focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-zinc-400 text-[10px] uppercase font-bold mb-1">Fare Rules & Booking Notes</label>
                        <input
                          type="text"
                          value={manualFareRules}
                          onChange={(e) => setManualFareRules(e.target.value)}
                          placeholder="e.g. Refundable with fee, seat 12K assigned"
                          className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-zinc-200 focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                    </div>

                    {/* Submit Actions */}
                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
                      <button
                        type="button"
                        onClick={() => setShowManualFlightForm(false)}
                        className="px-3.5 py-1.5 text-xs text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={savingManualFlight}
                        className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center gap-1.5 transition shadow-lg shadow-emerald-600/20 disabled:opacity-50 cursor-pointer"
                      >
                        {savingManualFlight ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>Attaching Flight...</span>
                          </>
                        ) : (
                          <>
                            <Plane className="w-3.5 h-3.5" />
                            <span>Attach Flight with PNR ({manualPnr || 'PNR'})</span>
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Attached Flights Table */}
              <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Plane className="w-3.5 h-3.5 text-sky-400" />
                    <span>Confirmed Flights for this Trip</span>
                  </span>
                  <span className="text-[10px] font-mono text-zinc-400">
                    {tripFlights.length} flight schedule{tripFlights.length === 1 ? '' : 's'} attached
                  </span>
                </div>
                {tripFlights.length === 0 ? (
                  <div className="py-6 text-center text-xs text-zinc-500">
                    No flight schedules attached yet. Search GDS flights or enter manual PNR above.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {tripFlights.map((f) => (
                      <div key={f.id} className="p-3 bg-zinc-900 rounded-lg border border-zinc-800 flex items-center justify-between text-xs hover:border-zinc-700 transition">
                        <div>
                          <div className="font-semibold text-white flex items-center gap-2 flex-wrap">
                            <span>{f.airline} • {f.flightNumber}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 uppercase font-mono">
                              {f.cabinClass}
                            </span>
                            {f.pnr && (
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/60 font-bold">
                                PNR: {f.pnr}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-zinc-400 font-mono mt-0.5">
                            {f.origin} &rarr; {f.destination} • Dep: {new Date(f.departureTime).toLocaleDateString()} • Baggage: {f.baggageAllowance}
                          </div>
                          {f.fareRules && (
                            <div className="text-[10px] text-zinc-500 mt-0.5 italic">
                              {f.fareRules}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          {f.ticketCost && (
                            <div className="font-mono font-bold text-emerald-400">
                              ₹{Number(f.ticketCost).toLocaleString('en-IN')} INR
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDeleteFlight(f.id)}
                            className="p-1.5 text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition cursor-pointer"
                            title="Remove flight from trip"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* GDS Live Search Results */}
              {gdsSearchResults.length > 0 && (
                <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 space-y-3">
                  <span className="text-xs font-bold text-white">GDS Aggregator Live Results</span>
                  <div className="space-y-2">
                    {gdsSearchResults.map((gds, idx) => (
                      <div key={idx} className="p-3 bg-zinc-900 rounded-lg border border-zinc-800 flex items-center justify-between text-xs">
                        <div>
                          <div className="font-semibold text-white flex items-center gap-2">
                            <span>{gds.airline} • {gds.flightNumber}</span>
                            <span className="text-[10px] font-mono text-zinc-400">{gds.aircraft}</span>
                          </div>
                          <div className="text-[11px] text-zinc-400 font-mono mt-0.5">
                            {gds.origin} &rarr; {gds.destination} • {gds.duration} • {gds.baggageAllowance}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-mono font-bold text-emerald-400 text-sm">
                            ₹{gds.ticketCost.toLocaleString('en-IN')}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleAttachFlight(gds)}
                            className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded text-xs font-medium transition"
                          >
                            Attach to Trip
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 5: DISPATCH & EMAIL DRIPS (P2-11 - P2-15) */}
          {activeTab === 'dispatch' && (
            <div className="space-y-6">
              <div>
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <Send className="w-4 h-4 text-violet-400" />
                  Email Quotation Dispatch & Automated Drip Cadences (P2-11 - P2-15)
                </h4>
                <p className="text-xs text-zinc-400 mt-0.5">
                  1-click delivery via Email with PDF attachment + automated follow-up drips (Day 1, 3, 5).
                </p>
              </div>

              {dispatchSuccessMsg && (
                <div className="p-3 bg-emerald-950/80 border border-emerald-500/40 rounded-xl text-xs text-emerald-300 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>{dispatchSuccessMsg}</span>
                </div>
              )}

              {/* Dispatch Controls */}
              <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 space-y-4">
                <div className="text-xs font-bold text-white border-b border-zinc-800/80 pb-2">
                  One-Click Email Quotation Delivery
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="p-3 rounded-lg border border-zinc-800 bg-zinc-900 flex items-center gap-2 cursor-pointer hover:border-zinc-700">
                    <input
                      type="checkbox"
                      checked={sendEmail}
                      onChange={(e) => setSendEmail(e.target.checked)}
                      className="rounded text-indigo-600"
                    />
                    <div>
                      <div className="text-xs font-semibold text-white">Two-Way Email (P2-11)</div>
                      <div className="text-[10px] text-zinc-400">Proposal PDF attachment</div>
                    </div>
                  </label>

                  <label className="p-3 rounded-lg border border-zinc-800 bg-zinc-900 flex items-center gap-2 cursor-pointer hover:border-zinc-700">
                    <input
                      type="checkbox"
                      checked={scheduleFollowUps}
                      onChange={(e) => setScheduleFollowUps(e.target.checked)}
                      className="rounded text-indigo-600"
                    />
                    <div>
                      <div className="text-xs font-semibold text-white">Automated Drips (P2-13)</div>
                      <div className="text-[10px] text-zinc-400">Scheduled Day 1, 3, 5 cadences</div>
                    </div>
                  </label>
                </div>

                <button
                  type="button"
                  onClick={handleDispatchQuotation}
                  disabled={dispatching || !sendEmail}
                  className="w-full py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white rounded-lg text-xs font-semibold shadow-lg shadow-indigo-600/20 transition flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {dispatching ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Dispatching via Email...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      <span>Send Quotation via Email</span>
                    </>
                  )}
                </button>
              </div>

              {/* Automation Logs & Scheduled Cadences */}
              <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 space-y-3">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-indigo-400" />
                  Scheduled & Dispatched Follow-Up Automations (P2-14, P2-15)
                </span>
                {automationLogs.length === 0 ? (
                  <div className="py-4 text-center text-xs text-zinc-500">
                    No automation logs yet. Dispatching a quote will automatically schedule Day 1, 3, 5 cadences.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {automationLogs.map((log) => (
                      <div key={log.id} className="p-2.5 bg-zinc-900 rounded-lg border border-zinc-800 flex items-center justify-between text-xs">
                        <div>
                          <div className="font-semibold text-white flex items-center gap-1.5">
                            <span className="capitalize">{log.type.replace(/_/g, ' ')}</span>
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-800 text-indigo-300 font-mono uppercase">
                              {log.channel}
                            </span>
                          </div>
                          <div className="text-[10px] text-zinc-400 font-mono">
                            Recipient: {log.recipient} • Scheduled: {new Date(log.scheduledFor).toLocaleDateString()}
                          </div>
                        </div>
                        <span className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                          log.status === 'sent' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/40' : 'bg-amber-950 text-amber-400 border border-amber-800/40'
                        }`}>
                          {log.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 6: LIFECYCLE & FULFILLMENT (P2-18 - P2-23) */}
          {activeTab === 'lifecycle' && (
            <div className="space-y-6">
              <div>
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <HeartHandshake className="w-4 h-4 text-emerald-400" />
                  Booking Handover, Payments, Visa & Retention (P2-18 - P2-23)
                </h4>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Convert accepted quotes to confirmed bookings, track payment milestones, verify visa documents, and trigger pre/post-trip cadences.
                </p>
              </div>

              {lifecycleSuccessMsg && (
                <div className="p-3 bg-emerald-950/80 border border-emerald-500/40 rounded-xl text-xs text-emerald-300 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>{lifecycleSuccessMsg}</span>
                </div>
              )}

              {/* 1. Booking Confirmation & Handover (P2-18) */}
              <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-white">Booking Confirmation & Operational Handover (P2-18)</div>
                  <div className="text-[11px] text-zinc-400">
                    Status: {selectedLead.bookingReference ? `Confirmed (${selectedLead.bookingReference})` : 'Pending Acceptance'}
                  </div>
                </div>
                {!selectedLead.bookingReference ? (
                  <button
                    type="button"
                    onClick={handleConfirmBooking}
                    disabled={confirmingBooking}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-xs font-semibold shadow-md transition disabled:opacity-50"
                  >
                    {confirmingBooking ? 'Confirming...' : 'Confirm Booking & Handover'}
                  </button>
                ) : (
                  <span className="bg-emerald-950 text-emerald-400 border border-emerald-800/60 px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Booking Confirmed ({selectedLead.bookingReference})</span>
                  </span>
                )}
              </div>

              {/* 2. Payment Milestones (P2-19) */}
              <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 space-y-3">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                  Payment Milestones & Automated Reminder Links (P2-19)
                </span>
                {paymentMilestones.length === 0 ? (
                  <div className="py-4 text-center text-xs text-zinc-500">
                    Milestones will generate automatically upon booking confirmation (30% deposit, 70% balance).
                  </div>
                ) : (
                  <div className="space-y-2">
                    {paymentMilestones.map((m) => (
                      <div key={m.id} className="p-3 bg-zinc-900 rounded-lg border border-zinc-800 flex items-center justify-between text-xs">
                        <div>
                          <div className="font-semibold text-white">{m.title}</div>
                          <div className="text-[10px] text-zinc-400 font-mono">
                            Due: {new Date(m.dueDate).toLocaleDateString()} • Reminders sent: {m.reminderSentCount || 0}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-mono font-bold text-emerald-400">
                            ₹{Number(m.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </span>
                          <span className={`text-[10px] px-2 py-0.5 rounded font-mono uppercase ${
                            m.status === 'paid' ? 'bg-emerald-950 text-emerald-400' : 'bg-amber-950 text-amber-400'
                          }`}>
                            {m.status}
                          </span>
                          {m.status !== 'paid' && (
                            <button
                              type="button"
                              onClick={() => handleSendPaymentReminder(m.id)}
                              className="text-xs bg-indigo-600/30 hover:bg-indigo-600 text-indigo-300 hover:text-white px-2.5 py-1 rounded transition"
                            >
                              Remind
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 3. Visa Checklist (P2-20) */}
              <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 space-y-3">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
                  Visa Document Checklist & Verification (P2-20)
                </span>
                <div className="space-y-2">
                  {visaChecklist.map((doc) => (
                    <div key={doc.id} className="p-2.5 bg-zinc-900 rounded-lg border border-zinc-800 flex items-center justify-between text-xs">
                      <div>
                        <div className="font-semibold text-white">{doc.documentName}</div>
                        <div className="text-[10px] text-zinc-400">{doc.description}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleToggleVisaStatus(doc.id, doc.status)}
                        className={`text-[10px] font-mono px-2.5 py-1 rounded transition uppercase ${
                          doc.status === 'verified'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : doc.status === 'submitted'
                            ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                            : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                        }`}
                      >
                        {doc.status} (Click to toggle)
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* 4. Pre/Post-Trip Cadences & Loyalty (P2-21, P2-22, P2-23) */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-zinc-950 p-3.5 rounded-xl border border-zinc-800 space-y-2">
                  <div className="text-xs font-bold text-white">Pre-Departure (P2-21)</div>
                  <p className="text-[10px] text-zinc-400">Weather, packing guide, 24/7 hotline</p>
                  <div className="flex gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => handleSendPreDeparture('T-7')}
                      className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs rounded transition flex-1"
                    >
                      Send T-7
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSendPreDeparture('T-3')}
                      className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs rounded transition flex-1"
                    >
                      Send T-3
                    </button>
                  </div>
                </div>

                <div className="bg-zinc-950 p-3.5 rounded-xl border border-zinc-800 space-y-2">
                  <div className="text-xs font-bold text-white">Post-Trip CSAT (P2-22)</div>
                  <p className="text-[10px] text-zinc-400">Ratings, reviews, testimonial permissions</p>
                  <button
                    type="button"
                    onClick={handleSendCsat}
                    className="w-full mt-1 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-amber-300 text-xs rounded transition"
                  >
                    Send CSAT Survey (T+1)
                  </button>
                </div>

                <div className="bg-zinc-950 p-3.5 rounded-xl border border-zinc-800 space-y-2">
                  <div className="text-xs font-bold text-white">Loyalty & Retention (P2-23)</div>
                  <p className="text-[10px] text-zinc-400">$500 anniversary credit & recommendations</p>
                  <button
                    type="button"
                    onClick={handleSendLoyalty}
                    className="w-full mt-1 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-emerald-300 text-xs rounded transition"
                  >
                    Trigger Anniversary Offer
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
