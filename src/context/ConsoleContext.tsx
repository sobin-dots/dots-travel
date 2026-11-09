'use client';

import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { CallToneGenerator } from '@/lib/call-tones';
import { patchPlivoSDK, createNoiseSuppressionShim, getLiveMicrophoneStream } from '@/lib/telephony/plivo-shim';

interface ConsoleContextType {
  bearerToken: string;
  setBearerToken: (token: string) => void;
  currentUser: any;
  currentOrg: any;
  settings: any;
  setSettings: (settings: any) => void;
  systemMode: 'live';
  loading: boolean;
  fetchData: () => Promise<void>;
  handleSignOut: () => void;
  authFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

  // Organizations & Multi-tenancy
  organizationsList: any[];
  setOrganizationsList: React.Dispatch<React.SetStateAction<any[]>>;
  showOrgModal: boolean;
  setShowOrgModal: (show: boolean) => void;
  creatingOrg: boolean;
  handleSwitchOrganization: (orgId: string) => Promise<void>;
  handleCreateOrganization: (name: string) => Promise<void>;
  integrationsSummary: any;
  setIntegrationsSummary: React.Dispatch<React.SetStateAction<any>>;
  fetchIntegrations: () => Promise<void>;

  // Telephony data
  numbers: any[];
  setNumbers: React.Dispatch<React.SetStateAction<any[]>>;
  calls: any[];
  setCalls: React.Dispatch<React.SetStateAction<any[]>>;
  threads: any[];
  setThreads: React.Dispatch<React.SetStateAction<any[]>>;
  activeThreadId: string | null;
  setActiveThreadId: (id: string | null) => void;
  activeThreadMessages: any[];
  setActiveThreadMessages: React.Dispatch<React.SetStateAction<any[]>>;
  recordings: any[];
  setRecordings: React.Dispatch<React.SetStateAction<any[]>>;
  transcripts: any[];
  setTranscripts: React.Dispatch<React.SetStateAction<any[]>>;
  auditLogs: any[];
  setAuditLogs: React.Dispatch<React.SetStateAction<any[]>>;
  staffList: any[];
  setStaffList: React.Dispatch<React.SetStateAction<any[]>>;
  contactsList: any[];
  setContactsList: React.Dispatch<React.SetStateAction<any[]>>;
  leadsList: any[];
  setLeadsList: React.Dispatch<React.SetStateAction<any[]>>;
  suppliersList: any[];
  setSuppliersList: React.Dispatch<React.SetStateAction<any[]>>;

  // In-Browser Web Phone
  webPhoneStatus: 'idle' | 'logging_in' | 'ready' | 'calling' | 'ringing' | 'connected' | 'ended' | 'error';
  setWebPhoneStatus: (status: any) => void;
  webPhoneMuted: boolean;
  webPhoneDuration: number;
  webPhoneError: string | null;
  setWebPhoneError: (err: string | null) => void;
  formatCallTimer: (sec: number) => string;
  initWebPhone: () => Promise<void>;
  handleStartBrowserCall: () => Promise<void>;
  handleToggleMute: () => void;
  handleHangupBrowserCall: () => void;

  // Incoming Call handling (Live WebRTC incoming only)
  incomingCall: { callerId: string; extraHeaders?: any } | null;
  setIncomingCall: (call: any | null) => void;
  handleAnswerIncomingCall: () => Promise<void>;
  handleRejectIncomingCall: () => void;

  // New call modal state & actions
  showCallModal: boolean;
  setShowCallModal: (show: boolean) => void;
  callDestination: string;
  setCallDestination: (dest: string) => void;
  callFromNumber: string;
  setCallFromNumber: (num: string) => void;
  callMode: 'browser' | 'bridge' | 'xml' | 'forward' | 'voicemail';
  setCallMode: (mode: any) => void;
  callForwardTo: string;
  setCallForwardTo: (num: string) => void;
  callRecord: boolean;
  setCallRecord: (rec: boolean) => void;
  callTranscribe: boolean;
  setCallTranscribe: (tra: boolean) => void;
  callLoading: boolean;
  handlePlaceCall: () => Promise<void>;

  // Call detail drawer
  selectedCallDetail: any | null;
  setSelectedCallDetail: (call: any | null) => void;
  callDetailSyncing: boolean;
  refreshCallDetail: (callId: string, retry?: boolean) => Promise<void>;
  transcribingRecId: string | null;
  setTranscribingRecId: (id: string | null) => void;
  transcribingProvider: 'openai' | null;
  setTranscribingProvider: (provider: 'openai' | null) => void;
  handleTriggerTranscription: (recordingId: string, provider?: 'openai', model?: string, silent?: boolean) => Promise<void>;
  handleTriggerCallTranscription: (callId: string, provider?: 'openai', model?: string, silent?: boolean) => Promise<void>;
  handleGenerateItinerary: (callId: string) => Promise<void>;
  generatingItineraryCallId: string | null;
  hangingUpCallId: string | null;
  sendingDtmfDigits: string | null;
  handleHangupLiveCall: (callId: string) => Promise<void>;
  handleSendDtmf: (callId: string, digits: string) => Promise<void>;

  // Itinerary Intake Modal
  showItineraryIntakeModal: boolean;
  setShowItineraryIntakeModal: (show: boolean) => void;
  intakeCallTarget: any | null;
  setIntakeCallTarget: (call: any | null) => void;
  openItineraryIntakeModal: (call: any) => void;
  handleGenerateItineraryWithParams: (callId: string, params: any) => Promise<void>;

  // Leads & AI Itinerary review drawer
  selectedLead: any | null;
  setSelectedLead: (lead: any | null) => void;
  selectingLeadId: string | null;
  leadRevisionNotes: string;
  setLeadRevisionNotes: (notes: string) => void;
  leadCustomerEmail: string;
  setLeadCustomerEmail: (email: string) => void;
  leadSelectedSupplierId: string;
  setLeadSelectedSupplierId: (id: string) => void;
  leadRevising: boolean;
  leadSending: boolean;
  showSendConfirmModal: boolean;
  setShowSendConfirmModal: (show: boolean) => void;
  handleSelectLead: (leadId: string) => Promise<void>;
  handleUpdateLeadStatus: (leadId: string, newStatus: string) => Promise<void>;
  handleReviseItinerary: () => Promise<void>;
  handleApproveAndSendItinerary: () => Promise<void>;
  resolveCustomerEmailForLead: (lead: any, contacts?: any[]) => { email: string; contactName?: string };

  // Supplier modal
  showSupplierModal: boolean;
  setShowSupplierModal: (show: boolean) => void;
  supplierName: string;
  setSupplierName: (name: string) => void;
  supplierCategory: 'hotels' | 'flights' | 'transport' | 'activities' | 'packages';
  setSupplierCategory: (cat: any) => void;
  supplierEmail: string;
  setSupplierEmail: (email: string) => void;
  supplierPhone: string;
  setSupplierPhone: (phone: string) => void;
  supplierContactPerson: string;
  setSupplierContactPerson: (person: string) => void;
  supplierNotes: string;
  setSupplierNotes: (notes: string) => void;
  supplierLoading: boolean;
  deletingSupplierId: string | null;
  handleCreateSupplier: (e: React.FormEvent) => Promise<void>;
  handleDeleteSupplier: (supplierId: string) => Promise<void>;

  // Staff modal
  showStaffModal: boolean;
  setShowStaffModal: (show: boolean) => void;
  staffName: string;
  setStaffName: (name: string) => void;
  staffEmail: string;
  setStaffEmail: (email: string) => void;
  staffPassword: string;
  setStaffPassword: (pass: string) => void;
  staffRole: 'operator' | 'admin' | 'viewer';
  setStaffRole: (role: any) => void;
  staffLoading: boolean;
  handleCreateStaff: (e: React.FormEvent) => Promise<void>;

  // Contact modal
  showContactModal: boolean;
  setShowContactModal: (show: boolean) => void;
  contactName: string;
  setContactName: (name: string) => void;
  contactPhone: string;
  setContactPhone: (phone: string) => void;
  contactEmail: string;
  setContactEmail: (email: string) => void;
  contactCompany: string;
  setContactCompany: (comp: string) => void;
  contactNotes: string;
  setContactNotes: (notes: string) => void;
  contactLoading: boolean;
  deletingContactId: string | null;
  handleCreateContact: (e: React.FormEvent) => Promise<void>;
  handleDeleteContact: (contactId: string) => Promise<void>;

  // Buy Number modal
  showBuyModal: boolean;
  setShowBuyModal: (show: boolean) => void;
  searchIso: string;
  setSearchIso: (iso: string) => void;
  availableNumbers: any[];
  searchingNumbers: boolean;
  buyingNumberE164: string | null;
  handleSearchNumbers: () => Promise<void>;
  handleBuyNumber: (number: string) => Promise<void>;

  // SMS
  smsDestination: string;
  setSmsDestination: (dest: string) => void;
  smsText: string;
  setSmsText: (txt: string) => void;
  smsSending: boolean;
  handleSendSms: () => Promise<void>;

  // Misc
  playingAudioId: string | null;
  setPlayingAudioId: (id: string | null) => void;
  transcriptSearch: string;
  setTranscriptSearch: (query: string) => void;
  isMobileMenuOpen: boolean;
  setIsMobileMenuOpen: (open: boolean) => void;
}

const ConsoleContext = createContext<ConsoleContextType | null>(null);

export function ConsoleProvider({ children }: { children: ReactNode }) {
  const [bearerToken, setBearerToken] = useState<string>('');
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [currentOrg, setCurrentOrg] = useState<any>(null);
  const [organizationsList, setOrganizationsList] = useState<any[]>([]);
  const [showOrgModal, setShowOrgModal] = useState<boolean>(false);
  const [creatingOrg, setCreatingOrg] = useState<boolean>(false);
  const [integrationsSummary, setIntegrationsSummary] = useState<any>(null);
  const [settings, setSettings] = useState<any>(null);
  const [systemMode] = useState<'live'>('live');
  const [loading, setLoading] = useState<boolean>(true);

  const tokenRef = useRef<string>('');
  const refreshPromiseRef = useRef<Promise<string | null> | null>(null);
  const inFlightActionsRef = useRef<Set<string>>(new Set());
  const hasBootstrappedDataRef = useRef<boolean>(false);

  const runExclusive = async (key: string, fn: () => Promise<void>) => {
    if (inFlightActionsRef.current.has(key)) return;
    inFlightActionsRef.current.add(key);
    try {
      await fn();
    } finally {
      inFlightActionsRef.current.delete(key);
    }
  };

  // Data states
  const [numbers, setNumbers] = useState<any[]>([]);
  const [calls, setCalls] = useState<any[]>([]);
  const [threads, setThreads] = useState<any[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [activeThreadMessages, setActiveThreadMessages] = useState<any[]>([]);
  const [recordings, setRecordings] = useState<any[]>([]);
  const [transcripts, setTranscripts] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [contactsList, setContactsList] = useState<any[]>([]);
  const [leadsList, setLeadsList] = useState<any[]>([]);
  const [suppliersList, setSuppliersList] = useState<any[]>([]);

  // Leads & AI Itinerary state
  const [selectedLead, setSelectedLead] = useState<any | null>(null);
  const [selectingLeadId, setSelectingLeadId] = useState<string | null>(null);
  const [generatingItineraryCallId, setGeneratingItineraryCallId] = useState<string | null>(null);
  const [hangingUpCallId, setHangingUpCallId] = useState<string | null>(null);
  const [sendingDtmfDigits, setSendingDtmfDigits] = useState<string | null>(null);
  const [leadRevisionNotes, setLeadRevisionNotes] = useState<string>('');
  const [leadCustomerEmail, setLeadCustomerEmail] = useState<string>('');
  const [leadSelectedSupplierId, setLeadSelectedSupplierId] = useState<string>('');
  const [leadRevising, setLeadRevising] = useState<boolean>(false);
  const [leadSending, setLeadSending] = useState<boolean>(false);
  const [showSendConfirmModal, setShowSendConfirmModal] = useState<boolean>(false);

  // Itinerary Intake Modal state
  const [showItineraryIntakeModal, setShowItineraryIntakeModal] = useState<boolean>(false);
  const [intakeCallTarget, setIntakeCallTarget] = useState<any | null>(null);

  const openItineraryIntakeModal = (call: any) => {
    setIntakeCallTarget(call);
    setShowItineraryIntakeModal(true);
  };

  // Supplier modal state
  const [showSupplierModal, setShowSupplierModal] = useState<boolean>(false);
  const [supplierName, setSupplierName] = useState<string>('');
  const [supplierCategory, setSupplierCategory] = useState<'hotels' | 'flights' | 'transport' | 'activities' | 'packages'>('hotels');
  const [supplierEmail, setSupplierEmail] = useState<string>('');
  const [supplierPhone, setSupplierPhone] = useState<string>('');
  const [supplierContactPerson, setSupplierContactPerson] = useState<string>('');
  const [supplierNotes, setSupplierNotes] = useState<string>('');
  const [supplierLoading, setSupplierLoading] = useState<boolean>(false);
  const [deletingSupplierId, setDeletingSupplierId] = useState<string | null>(null);

  // Audio player state
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);

  // Outbound call modal state
  const [showCallModal, setShowCallModal] = useState(false);
  const [callDestination, setCallDestination] = useState('');
  const [callFromNumber, setCallFromNumber] = useState('');
  const [callMode, setCallMode] = useState<'browser' | 'bridge' | 'xml' | 'forward' | 'voicemail'>('browser');
  const [callForwardTo, setCallForwardTo] = useState('');
  const [callRecord, setCallRecord] = useState(true);
  const [callTranscribe, setCallTranscribe] = useState(true);
  const [callLoading, setCallLoading] = useState(false);

  // Call detail drawer state
  const [selectedCallDetail, setSelectedCallDetailState] = useState<any | null>(null);
  const selectedCallIdRef = useRef<string | null>(null);
  const setSelectedCallDetail = (call: any | null) => {
    selectedCallIdRef.current = call?.id || null;
    setSelectedCallDetailState(call);
  };
  const [callDetailSyncing, setCallDetailSyncing] = useState<boolean>(false);
  const [transcribingRecId, setTranscribingRecId] = useState<string | null>(null);
  const [transcribingProvider, setTranscribingProvider] = useState<'openai' | null>(null);

  // In-Browser Web Phone (WebRTC) state
  const [webPhoneStatus, setWebPhoneStatus] = useState<'idle' | 'logging_in' | 'ready' | 'calling' | 'ringing' | 'connected' | 'ended' | 'error'>('idle');
  const [webPhoneMuted, setWebPhoneMuted] = useState(false);
  const [webPhoneDuration, setWebPhoneDuration] = useState(0);
  const [webPhoneError, setWebPhoneError] = useState<string | null>(null);
  const [endpointConfig, setEndpointConfig] = useState<any>(null);
  const [incomingCall, setIncomingCall] = useState<{ callerId: string; extraHeaders?: any } | null>(null);

  const plivoClientRef = useRef<any>(null);
  const webPhoneUsernameRef = useRef<string | null>(null);
  const isInitializingWebPhoneRef = useRef<boolean>(false);
  const callTimerRef = useRef<any>(null);
  const toneGenRef = useRef<CallToneGenerator | null>(null);

  // Staff creation state
  const [showStaffModal, setShowStaffModal] = useState(false);
  const [staffName, setStaffName] = useState('');
  const [staffEmail, setStaffEmail] = useState('');
  const [staffPassword, setStaffPassword] = useState('');
  const [staffRole, setStaffRole] = useState<'operator' | 'admin' | 'viewer'>('operator');
  const [staffLoading, setStaffLoading] = useState(false);

  // Contact creation state
  const [showContactModal, setShowContactModal] = useState(false);
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactCompany, setContactCompany] = useState('');
  const [contactNotes, setContactNotes] = useState('');
  const [contactLoading, setContactLoading] = useState(false);
  const [deletingContactId, setDeletingContactId] = useState<string | null>(null);

  // SMS composer state
  const [smsDestination, setSmsDestination] = useState('+14155550199');
  const [smsText, setSmsText] = useState('Hello from Plivo Operations Console!');
  const [smsSending, setSmsSending] = useState(false);

  // Search & Buy Number state
  const [showBuyModal, setShowBuyModal] = useState(false);
  const [searchIso, setSearchIso] = useState('US');
  const [availableNumbers, setAvailableNumbers] = useState<any[]>([]);
  const [searchingNumbers, setSearchingNumbers] = useState(false);
  const [buyingNumberE164, setBuyingNumberE164] = useState<string | null>(null);

  // Search transcript query
  const [transcriptSearch, setTranscriptSearch] = useState('');

  const formatCallTimer = (sec: number) => {
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // Initialize tone generator on client mount
  useEffect(() => {
    toneGenRef.current = new CallToneGenerator();
    return () => {
      toneGenRef.current?.stop();
    };
  }, []);

  // Reactive audio tones for call progression
  useEffect(() => {
    if (webPhoneStatus === 'calling') {
      toneGenRef.current?.startConnectingTune();
    } else if (webPhoneStatus === 'ringing') {
      toneGenRef.current?.startRingingTune();
    } else {
      toneGenRef.current?.stop();
    }
  }, [webPhoneStatus]);



  // Keep tokenRef synchronized with bearerToken
  useEffect(() => {
    if (bearerToken) {
      tokenRef.current = bearerToken;
    }
  }, [bearerToken]);

  // Strict Auth Gate: MUST be accessed ONLY by login
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const localToken = localStorage.getItem('plivo_access_token');
      const localUser = localStorage.getItem('plivo_user');
      const localOrg = localStorage.getItem('plivo_org');
      if (localToken) {
        tokenRef.current = localToken;
        setBearerToken(localToken);
        if (localUser) {
          try { setCurrentUser(JSON.parse(localUser)); } catch {}
        }
        if (localOrg) {
          try { setCurrentOrg(JSON.parse(localOrg)); } catch {}
        }
      } else {
        window.location.href = '/login';
      }
    }
  }, []);

  const handleSignOut = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('plivo_access_token');
      localStorage.removeItem('plivo_refresh_token');
      localStorage.removeItem('plivo_user');
      localStorage.removeItem('plivo_org');
      window.location.href = '/login';
    }
  };

  // Singleton token refresh mutex so concurrent 401s share a single /api/v1/auth/refresh request
  const refreshAccessToken = async (): Promise<string | null> => {
    if (typeof window === 'undefined') return null;
    if (refreshPromiseRef.current) {
      return refreshPromiseRef.current;
    }

    const doRefresh = async (): Promise<string | null> => {
      const refreshToken = localStorage.getItem('plivo_refresh_token');
      if (!refreshToken) {
        handleSignOut();
        return null;
      }

      try {
        const refreshRes = await fetch('/api/v1/auth/refresh', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'ngrok-skip-browser-warning': 'true',
          },
          body: JSON.stringify({ refreshToken }),
        });

        if (refreshRes.ok) {
          const refreshData = await refreshRes.json();
          if (refreshData.accessToken) {
            const newToken = refreshData.accessToken;
            tokenRef.current = newToken;
            localStorage.setItem('plivo_access_token', newToken);
            if (refreshData.refreshToken) {
              localStorage.setItem('plivo_refresh_token', refreshData.refreshToken);
            }
            setBearerToken(newToken);
            return newToken;
          }
        }

        // Only sign out if server explicitly rejected the refresh token (401/403)
        if (refreshRes.status === 401 || refreshRes.status === 403) {
          handleSignOut();
        }
        return null;
      } catch (err) {
        // Transient network hiccup — do NOT sign out the user!
        console.warn('Transient token refresh network warning:', err);
        return null;
      } finally {
        refreshPromiseRef.current = null;
      }
    };

    refreshPromiseRef.current = doRefresh();
    return refreshPromiseRef.current;
  };

  // Universal authenticated fetch wrapper with automatic 401 token refresh retry
  const authFetch = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const activeToken =
      tokenRef.current ||
      bearerToken ||
      (typeof window !== 'undefined' ? localStorage.getItem('plivo_access_token') || '' : '');

    const buildHeaders = (tkn: string) => {
      const h = new Headers(init.headers || {});
      if (tkn) h.set('Authorization', `Bearer ${tkn}`);
      h.set('ngrok-skip-browser-warning', 'true');
      return h;
    };

    let res = await fetch(input, {
      ...init,
      headers: buildHeaders(activeToken),
    });

    if (res.status === 401) {
      const refreshedToken = await refreshAccessToken();
      if (refreshedToken) {
        res = await fetch(input, {
          ...init,
          headers: buildHeaders(refreshedToken),
        });
      }
    }

    return res;
  };

  // Proactive background silent token refresh every 10 minutes while console is open
  useEffect(() => {
    if (!bearerToken) return;
    const interval = setInterval(() => {
      refreshAccessToken().catch(() => {});
    }, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, [Boolean(bearerToken)]);

  // Helper to apply console state results uniformly while preserving active user form selections
  const applyFetchResults = (results: any[]) => {
    const [numRes, callRes, threadRes, recRes, transRes, setRes, auditRes, staffRes, contactRes, leadRes, suppRes, orgsRes, integRes] = results;

    if (numRes?.objects) {
      setNumbers(numRes.objects);
      setCallFromNumber((prev) =>
        prev && numRes.objects.some((n: any) => n.id === prev)
          ? prev
          : numRes.objects[0]?.id || ''
      );
    } else if (numRes && numRes.api_id !== 'auth_err') {
      setNumbers([]);
      setCallFromNumber('');
    }

    if (callRes?.objects) setCalls(callRes.objects);

    if (threadRes?.objects) {
      setThreads(threadRes.objects);
      setActiveThreadId((prev) =>
        prev && threadRes.objects.some((t: any) => t.id === prev)
          ? prev
          : threadRes.objects[0]?.id || null
      );
    } else if (threadRes && threadRes.api_id !== 'auth_err') {
      setThreads([]);
      setActiveThreadId(null);
    }

    if (recRes?.objects) setRecordings(recRes.objects);
    if (transRes?.objects) setTranscripts(transRes.objects);

    if (setRes?.organization) {
      setSettings(setRes);
      setCurrentOrg(setRes.organization);
    }

    if (auditRes?.objects) setAuditLogs(auditRes.objects);
    if (staffRes?.objects) setStaffList(staffRes.objects);

    if (contactRes?.objects) {
      setContactsList(contactRes.objects);
      setCallDestination((prev) => prev || contactRes.objects[0]?.phone || '');
    } else if (contactRes && contactRes.api_id !== 'auth_err') {
      setContactsList([]);
    }

    if (leadRes?.objects) setLeadsList(leadRes.objects);

    if (suppRes?.objects) {
      setSuppliersList(suppRes.objects);
      setLeadSelectedSupplierId((prev) =>
        prev && suppRes.objects.some((s: any) => s.id === prev)
          ? prev
          : suppRes.objects[0]?.id || ''
      );
    } else if (suppRes && suppRes.api_id !== 'auth_err') {
      setSuppliersList([]);
      setLeadSelectedSupplierId('');
    }

    if (orgsRes?.organizations) {
      setOrganizationsList(orgsRes.organizations);
    }

    if (integRes && integRes.api_id !== 'auth_err' && integRes.api_id !== 'server_err') {
      setIntegrationsSummary(integRes);
    }
  };

  const executeFetchWithToken = async (authToken: string) => {
    const headers = {
      Authorization: `Bearer ${authToken}`,
      'ngrok-skip-browser-warning': 'true',
    };
    const safeJson = (url: string) =>
      fetch(url, { headers })
        .then((r) => r.json())
        .catch(() => ({}));

    const results = await Promise.all([
      safeJson('/api/v1/numbers'),
      safeJson('/api/v1/calls'),
      safeJson('/api/v1/messages/threads'),
      safeJson('/api/v1/recordings'),
      safeJson('/api/v1/transcriptions'),
      safeJson('/api/v1/settings'),
      safeJson('/api/v1/audit'),
      safeJson('/api/v1/users'),
      safeJson('/api/v1/contacts'),
      safeJson('/api/v1/leads'),
      safeJson('/api/v1/suppliers'),
      safeJson('/api/v1/organizations'),
      safeJson('/api/v1/settings/integrations'),
    ]);
    applyFetchResults(results);
    return results;
  };

  // Fetch Console Data when Bearer Token is ready (with singleton auto-refresh on 401)
  const fetchData = async () => {
    let token: string =
      tokenRef.current ||
      bearerToken ||
      (typeof window !== 'undefined' ? localStorage.getItem('plivo_access_token') || '' : '');
    if (!token) return;
    setLoading(true);

    try {
      const results = await executeFetchWithToken(token);

      // If token expired (401 auth_err), use singleton refresh mutex
      if (results.some((r: any) => r?.api_id === 'auth_err')) {
        const refreshed = await refreshAccessToken();
        if (refreshed) {
          await executeFetchWithToken(refreshed);
        }
      }
    } catch (err) {
      console.error('Data fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchIntegrations = async () => {
    try {
      const res = await authFetch('/api/v1/settings/integrations');
      if (res.ok) {
        const data = await res.json();
        setIntegrationsSummary(data);
      }
    } catch (err) {
      console.error('Failed to refresh integrations:', err);
    }
  };

  const handleSwitchOrganization = async (orgId: string) => {
    await runExclusive(`switch-org:${orgId}`, async () => {
      try {
        setLoading(true);

        // Instantly clear out old tenant state to guarantee complete isolation during switch
        setNumbers([]);
        setCalls([]);
        setThreads([]);
        setActiveThreadId(null);
        setActiveThreadMessages([]);
        setRecordings([]);
        setTranscripts([]);
        setAuditLogs([]);
        setStaffList([]);
        setContactsList([]);
        setLeadsList([]);
        setSuppliersList([]);
        setSettings(null);
        setIntegrationsSummary(null);

        const res = await authFetch('/api/v1/organizations/switch', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ organizationId: orgId }),
        });

        const data = await res.json();
        if (res.ok && data.accessToken) {
          tokenRef.current = data.accessToken;
          localStorage.setItem('plivo_access_token', data.accessToken);
          if (data.refreshToken) {
            localStorage.setItem('plivo_refresh_token', data.refreshToken);
          }
          if (data.organization) {
            localStorage.setItem('plivo_org', JSON.stringify(data.organization));
            setCurrentOrg(data.organization);
          }
          if (data.user) {
            localStorage.setItem('plivo_user', JSON.stringify(data.user));
            setCurrentUser(data.user);
          }
          setBearerToken(data.accessToken);

          // Immediately load new organization's data with the new access token
          await executeFetchWithToken(data.accessToken);
          await initWebPhone();
        } else {
          alert(data.error || 'Failed to switch organization');
        }
      } catch (err: any) {
        alert(err.message || 'Error switching organization');
      } finally {
        setLoading(false);
      }
    });
  };

  const handleCreateOrganization = async (name: string) => {
    await runExclusive('create-org', async () => {
      try {
        setCreatingOrg(true);
        setLoading(true);
        const res = await authFetch('/api/v1/organizations', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ name }),
        });

        const data = await res.json();
        if (res.ok && data.organization) {
          setShowOrgModal(false);
          await handleSwitchOrganization(data.organization.id);
        } else {
          alert(data.error || 'Failed to create organization');
        }
      } catch (err: any) {
        alert(err.message || 'Error creating organization');
      } finally {
        setCreatingOrg(false);
        setLoading(false);
      }
    });
  };

  useEffect(() => {
    if (bearerToken && !hasBootstrappedDataRef.current) {
      hasBootstrappedDataRef.current = true;
      fetchData();
      initWebPhone();
    }
  }, [bearerToken]);

  // Fetch active thread messages
  useEffect(() => {
    if (!bearerToken || !activeThreadId) return;
    authFetch(`/api/v1/messages/threads/${activeThreadId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.thread?.messages) {
          setActiveThreadMessages(data.thread.messages);
        }
      })
      .catch(() => {});
  }, [bearerToken, activeThreadId]);

  // Refresh single call details (never reopens the drawer if the user closed it)
  const refreshCallDetail = async (callId: string, retry = false) => {
    if (!callId) return;
    setCallDetailSyncing(true);
    try {
      const query = retry ? '?retry=true' : '';
      const res = await authFetch(`/api/v1/calls/${callId}${query}`);
      if (res.ok && selectedCallIdRef.current === callId) {
        const data = await res.json();
        setSelectedCallDetailState(data.call);
      }
    } catch {}
    finally {
      setCallDetailSyncing(false);
    }
  };

  // Auto-polling for Call Details drawer ONLY when call is actively in-progress or explicitly processing
  useEffect(() => {
    if (!selectedCallDetail?.id) return;
    const activeCallId = selectedCallDetail.id;

    const shouldPoll =
      selectedCallDetail.status === 'in-progress' ||
      Boolean(selectedCallDetail.isRecordingProcessing) ||
      Boolean(selectedCallDetail.isTranscriptionProcessing);

    if (!shouldPoll || selectedCallDetail.recordingError || selectedCallDetail.transcriptionError) {
      return;
    }

    let cancelled = false;
    const interval = setInterval(async () => {
      if (cancelled || selectedCallIdRef.current !== activeCallId) return;
      try {
        const res = await authFetch(`/api/v1/calls/${activeCallId}`);
        if (res.ok && !cancelled && selectedCallIdRef.current === activeCallId) {
          const data = await res.json();
          setSelectedCallDetailState(data.call);
        }
      } catch {}
    }, 3000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [
    selectedCallDetail?.id,
    selectedCallDetail?.status,
    selectedCallDetail?.isRecordingProcessing,
    selectedCallDetail?.isTranscriptionProcessing,
    selectedCallDetail?.recordingError,
    selectedCallDetail?.transcriptionError,
  ]);

  // Initialize In-Browser Web Phone (concurrency-safe, auto-retries if SDK script still loading, and auto-reconnects)
  const initWebPhone = async () => {
    if (typeof window === 'undefined') return;
    const activeToken = tokenRef.current || bearerToken || localStorage.getItem('plivo_access_token') || '';
    if (!activeToken) return;

    if (isInitializingWebPhoneRef.current) return;
    isInitializingWebPhoneRef.current = true;

    try {
      const res = await authFetch('/api/v1/telephony/endpoint');
      const data = await res.json();
      if (res.ok && data.username && data.password) {
        setEndpointConfig(data);

        if (!(window as any).Plivo) {
          // Plivo SDK script is still loading in layout.tsx — retry once it finishes loading
          setTimeout(() => {
            isInitializingWebPhoneRef.current = false;
            initWebPhone();
          }, 600);
          return;
        }

        // If already initialized for this exact SIP endpoint username, simply ensure it is logged in
        if (plivoClientRef.current && webPhoneUsernameRef.current === data.username) {
          if (!plivoClientRef.current.isLoggedIn) {
            try {
              plivoClientRef.current.login(data.username, data.password);
            } catch {}
          }
          return;
        }

        // Clean up any previous client instance from another org/endpoint before creating a new one
        if (plivoClientRef.current) {
          try {
            if (typeof plivoClientRef.current.logout === 'function') {
              plivoClientRef.current.logout();
            }
          } catch {}
          plivoClientRef.current = null;
          webPhoneUsernameRef.current = null;
        }

        const PlivoClass = (window as any).Plivo;
        patchPlivoSDK(PlivoClass);
        let clientInstance: any = null;

        try {
          const plivoSdk = new PlivoClass({ debug: 'INFO', permOnClick: true, enableNoiseReduction: false });
          clientInstance = plivoSdk.client || plivoSdk;
        } catch {
          try {
            clientInstance = new PlivoClass.Client({ enableNoiseReduction: false });
          } catch {}
        }

        if (clientInstance) {
          patchPlivoSDK(PlivoClass, clientInstance);
          if (!clientInstance.noiseSuppresion) {
            clientInstance.noiseSuppresion = createNoiseSuppressionShim(clientInstance);
          }
          if (!clientInstance.noiseSuppression) {
            clientInstance.noiseSuppression = clientInstance.noiseSuppresion;
          }
          clientInstance.on('onLogin', () => {
            console.log('[WebPhone] SIP registered successfully with Plivo:', data.username);
            setWebPhoneStatus('ready');
            setWebPhoneError(null);
          });
          clientInstance.on('onLoginFailed', (cause: any) => {
            console.error('[WebPhone] SIP registration failed:', cause);
            setWebPhoneStatus('error');
            setWebPhoneError(`SIP Auth Failed: ${cause?.message || cause || 'Check credentials'}`);
          });
          clientInstance.on('onLogout', () => {
            console.log('[WebPhone] SIP logged out — scheduling auto-reconnect if session active');
            if (tokenRef.current) {
              setTimeout(() => {
                try {
                  clientInstance.login(data.username, data.password);
                } catch {}
              }, 1500);
            }
          });
          clientInstance.on('onConnectionChange', (obj: any) => {
            const state = String(obj?.state || obj || '').toLowerCase();
            if ((state === 'disconnected' || state === 'closed') && tokenRef.current) {
              setTimeout(() => {
                try {
                  clientInstance.login(data.username, data.password);
                } catch {}
              }, 2000);
            }
          });
          clientInstance.on('onCalling', () => setWebPhoneStatus('calling'));
          clientInstance.on('onCallRemoteRinging', () => setWebPhoneStatus('ringing'));
          clientInstance.on('onCallAnswered', () => {
            toneGenRef.current?.stop();
            setWebPhoneStatus('connected');
          });
          clientInstance.on('onCallConnected', () => {
            toneGenRef.current?.stop();
            setWebPhoneStatus('connected');
          });
          clientInstance.on('onCallTerminated', () => {
            toneGenRef.current?.stop();
            setIncomingCall(null);
            setWebPhoneStatus('ended');
            fetchData();
          });
          clientInstance.on('onCallFailed', (cause: any) => {
            toneGenRef.current?.stop();
            setIncomingCall(null);
            setWebPhoneStatus('error');
            setWebPhoneError(cause?.message || 'Call failed');
          });
          const handleIncoming = (callerId: any, extraHeaders: any) => {
            console.log('[WebPhone] Incoming call received from:', callerId);
            const rawId = typeof callerId === 'string'
              ? callerId.replace('@phone.plivo.com', '')
              : (callerId?.callerId || callerId?.callerName || callerId?.src || 'Inbound Caller');
            toneGenRef.current?.startIncomingRingtone();
            setIncomingCall({
              callerId: rawId,
              extraHeaders,
            });
            setWebPhoneStatus('ringing');
          };

          const handleIncomingCanceled = () => {
            console.log('[WebPhone] Inbound caller hung up / canceled');
            toneGenRef.current?.stop();
            setIncomingCall(null);
            setWebPhoneStatus('ended');
          };

          clientInstance.on('onIncomingCall', handleIncoming);
          clientInstance.on('incomingCall', handleIncoming);
          clientInstance.on('onIncomingCallHangup', handleIncomingCanceled);
          clientInstance.on('onIncomingCallCanceled', handleIncomingCanceled);
          clientInstance.on('incomingCallHangup', handleIncomingCanceled);
          clientInstance.on('incomingCallCanceled', handleIncomingCanceled);

          webPhoneUsernameRef.current = data.username;
          plivoClientRef.current = clientInstance;
          if (typeof window !== 'undefined') {
            (window as any).plivoClient = clientInstance;
          }
          clientInstance.login(data.username, data.password);
        }
      }
    } catch (e: any) {
      console.warn('Web phone init notice:', e.message);
    } finally {
      isInitializingWebPhoneRef.current = false;
    }
  };

  // Periodic SIP registration keepalive & tab wake recovery so WebPhone never drops registration after a few minutes
  useEffect(() => {
    if (!bearerToken) return;

    const ensureSipRegistered = () => {
      if (
        webPhoneStatus === 'calling' ||
        webPhoneStatus === 'ringing' ||
        webPhoneStatus === 'connected'
      ) {
        return;
      }
      if (!plivoClientRef.current) {
        initWebPhone();
        return;
      }
      if (
        endpointConfig?.username &&
        endpointConfig?.password &&
        (!plivoClientRef.current.isLoggedIn || webPhoneStatus === 'error' || webPhoneStatus === 'idle')
      ) {
        try {
          plivoClientRef.current.login(endpointConfig.username, endpointConfig.password);
        } catch {}
      }
    };

    const interval = setInterval(ensureSipRegistered, 60 * 1000);
    const onVisibilityOrOnline = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        ensureSipRegistered();
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('online', onVisibilityOrOnline);
      document.addEventListener('visibilitychange', onVisibilityOrOnline);
    }

    return () => {
      clearInterval(interval);
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', onVisibilityOrOnline);
        document.removeEventListener('visibilitychange', onVisibilityOrOnline);
      }
    };
  }, [bearerToken, endpointConfig?.username, endpointConfig?.password, webPhoneStatus]);

  // Call duration counter
  useEffect(() => {
    if (webPhoneStatus === 'connected') {
      callTimerRef.current = setInterval(() => {
        setWebPhoneDuration((p) => p + 1);
      }, 1000);
    } else if (webPhoneStatus === 'ended' || webPhoneStatus === 'idle') {
      if (callTimerRef.current) clearInterval(callTimerRef.current);
    }
    return () => {
      if (callTimerRef.current) clearInterval(callTimerRef.current);
    };
  }, [webPhoneStatus]);

  const handleStartBrowserCall = async () => {
    if (!callDestination) {
      alert('You must select or add a verified contact before placing a call.');
      return;
    }
    toneGenRef.current?.startConnectingTune();
    setWebPhoneStatus('calling');
    setWebPhoneError(null);
    setWebPhoneDuration(0);

    try {
      const micStream = await getLiveMicrophoneStream();
      if (typeof window !== 'undefined' && micStream) {
        (window as any).localStream = micStream;
      }

      if (!plivoClientRef.current && typeof window !== 'undefined' && (window as any).Plivo && endpointConfig) {
        try {
          const PlivoClass = (window as any).Plivo;
          patchPlivoSDK(PlivoClass);
          const plivoSdk = new PlivoClass({ debug: 'INFO', permOnClick: true, enableNoiseReduction: false });
          const clientInstance = plivoSdk.client || plivoSdk;
          if (clientInstance) {
            patchPlivoSDK(PlivoClass, clientInstance);
            if (!clientInstance.noiseSuppresion) {
              clientInstance.noiseSuppresion = createNoiseSuppressionShim(clientInstance);
            }
            if (!clientInstance.noiseSuppression) {
              clientInstance.noiseSuppression = clientInstance.noiseSuppresion;
            }
            clientInstance.login(endpointConfig.username, endpointConfig.password);
            plivoClientRef.current = clientInstance;
          }
        } catch {}
      }

      if (plivoClientRef.current && endpointConfig) {
        patchPlivoSDK((window as any).Plivo, plivoClientRef.current);
        if (!plivoClientRef.current.noiseSuppresion) {
          plivoClientRef.current.noiseSuppresion = createNoiseSuppressionShim(plivoClientRef.current);
        }
        if (!plivoClientRef.current.noiseSuppression) {
          plivoClientRef.current.noiseSuppression = plivoClientRef.current.noiseSuppresion;
        }
        const cleanDestination = callDestination.trim().replace(/[^\d+]/g, '');
        const callerId = endpointConfig.callerId || '+918065531234';
        console.log('[WebPhone] Placing outgoing call to:', cleanDestination, 'from callerId:', callerId);
        const sipHeaders: Record<string, string> = { 'X-PH-callerId': callerId };
        if (currentUser?.id) sipHeaders['X-PH-actorUserId'] = String(currentUser.id);
        if (currentUser?.email) sipHeaders['X-PH-actorEmail'] = String(currentUser.email);
        if (currentUser?.name) sipHeaders['X-PH-actorName'] = String(currentUser.name);
        plivoClientRef.current.call(cleanDestination, sipHeaders);
        setTimeout(() => setWebPhoneStatus((c) => (c === 'calling' ? 'ringing' : c)), 2600);
      } else {
        throw new Error('Plivo Web Phone client is not registered with carrier. Please refresh or verify Plivo credentials.');
      }
    } catch (err: any) {
      toneGenRef.current?.stop();
      setWebPhoneError(err.message || 'Microphone access denied or call initiation failed.');
      setWebPhoneStatus('error');
    }
  };

  const handleToggleMute = () => {
    if (plivoClientRef.current) {
      if (webPhoneMuted) {
        try { plivoClientRef.current.unmute(); } catch {}
        setWebPhoneMuted(false);
      } else {
        try { plivoClientRef.current.mute(); } catch {}
        setWebPhoneMuted(true);
      }
    } else {
      setWebPhoneMuted(!webPhoneMuted);
    }
  };

  const handleHangupBrowserCall = () => {
    toneGenRef.current?.stop();
    setIncomingCall(null);
    if (plivoClientRef.current) {
      try { plivoClientRef.current.hangup(); } catch {}
    }
    setWebPhoneStatus('ended');
    if (callTimerRef.current) clearInterval(callTimerRef.current);
    setTimeout(() => {
      fetchData();
    }, 1500);
  };

  const handleAnswerIncomingCall = async () => {
    toneGenRef.current?.stop();
    const caller = incomingCall?.callerId || 'Customer';
    setCallDestination(caller);
    setIncomingCall(null);
    setWebPhoneStatus('connected');
    setWebPhoneDuration(0);
    setShowCallModal(true);

    if (plivoClientRef.current) {
      try {
        // Guarantee live microphone audio tracks are active before answering
        const micStream = await getLiveMicrophoneStream();
        if (typeof window !== 'undefined' && micStream) {
          (window as any).localStream = micStream;
        }

        patchPlivoSDK((window as any).Plivo, plivoClientRef.current);
        if (!plivoClientRef.current.noiseSuppresion) {
          plivoClientRef.current.noiseSuppresion = createNoiseSuppressionShim(plivoClientRef.current);
        }
        if (!plivoClientRef.current.noiseSuppression) {
          plivoClientRef.current.noiseSuppression = plivoClientRef.current.noiseSuppresion;
        }

        if (typeof plivoClientRef.current.answer === 'function') {
          plivoClientRef.current.answer();
        }

        // Guarantee Plivo WebRTC stream is unmuted and transmitting audio
        setTimeout(() => {
          try {
            if (typeof plivoClientRef.current.unmute === 'function') {
              plivoClientRef.current.unmute();
            }
          } catch {}
          setWebPhoneMuted(false);
        }, 400);
      } catch (err: any) {
        console.warn('Plivo answer notice:', err.message);
      }
    }
  };

  const handleRejectIncomingCall = () => {
    toneGenRef.current?.stop();
    if (plivoClientRef.current) {
      try {
        if (typeof plivoClientRef.current.reject === 'function') {
          plivoClientRef.current.reject();
        } else if (typeof plivoClientRef.current.hangup === 'function') {
          plivoClientRef.current.hangup();
        }
      } catch (err: any) {
        console.warn('Plivo reject notice:', err.message);
      }
    }
    setIncomingCall(null);
    setWebPhoneStatus('ended');
  };

  // Place Call Handler
  const handlePlaceCall = async () => {
    await runExclusive('place-call', async () => {
      if (!callDestination) {
        alert('You must select or add a verified contact before placing a call.');
        return;
      }
      if (!callFromNumber) {
        alert('Please select an active line to call from.');
        return;
      }
      if ((callMode === 'bridge' || callMode === 'forward') && !callForwardTo) {
        alert('Please enter your Staff / Agent phone number to bridge into the conversation.');
        return;
      }
      setCallLoading(true);
      try {
        const res = await authFetch('/api/v1/calls', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            phoneNumberId: callFromNumber,
            to: callDestination,
            mode: callMode,
            forwardTo: (callMode === 'bridge' || callMode === 'forward') ? callForwardTo : undefined,
            record: callRecord,
            transcribe: callTranscribe,
          }),
        });
        const data = await res.json();
        if (res.ok) {
          setShowCallModal(false);
          fetchData();
          if (data.call?.id) {
            setSelectedCallDetail(data.call);
            refreshCallDetail(data.call.id);
          }
        } else {
          alert(data.error || 'Failed to place call');
        }
      } catch (err: any) {
        alert(err.message);
      } finally {
        setCallLoading(false);
      }
    });
  };

  // Send SMS Handler
  const handleSendSms = async () => {
    await runExclusive('send-sms', async () => {
      if (!smsText || !smsDestination || numbers.length === 0) return;
      setSmsSending(true);
      try {
        const fromNumberId = numbers[0].id;
        const res = await authFetch('/api/v1/messages/send', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            phoneNumberId: fromNumberId,
            to: [smsDestination],
            text: smsText,
          }),
        });
        if (res.ok) {
          setSmsText('');
          fetchData();
        }
      } catch (err) {
        console.error('Send SMS error:', err);
      } finally {
        setSmsSending(false);
      }
    });
  };

  // Search Available Numbers
  const handleSearchNumbers = async () => {
    await runExclusive('search-numbers', async () => {
      setSearchingNumbers(true);
      try {
        const res = await authFetch(`/api/v1/numbers/search?country_iso=${searchIso}`);
        const data = await res.json();
        if (data.objects) {
          setAvailableNumbers(data.objects);
        }
      } catch (err) {
        console.error('Search numbers error:', err);
      } finally {
        setSearchingNumbers(false);
      }
    });
  };

  // Buy Number Handler
  const handleBuyNumber = async (number: string) => {
    await runExclusive(`buy-number:${number}`, async () => {
      setBuyingNumberE164(number);
      try {
        const res = await authFetch('/api/v1/numbers/buy', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            countryIso: searchIso,
            e164: number,
          }),
        });
        const data = await res.json();
        if (res.ok) {
          alert(`Successfully purchased ${number}!`);
          setShowBuyModal(false);
          fetchData();
        } else {
          alert(data.error || 'Purchase failed');
        }
      } catch (err: any) {
        alert(err.message);
      } finally {
        setBuyingNumberE164(null);
      }
    });
  };

  // Hangup Live Call
  const handleHangupLiveCall = async (callId: string) => {
    await runExclusive(`hangup-call:${callId}`, async () => {
      setHangingUpCallId(callId);
      try {
        await authFetch(`/api/v1/calls/${callId}/live`, {
          method: 'DELETE',
        });
        const res = await authFetch(`/api/v1/calls/${callId}?fast=true`);
        if (res.ok && selectedCallIdRef.current === callId) {
          const data = await res.json();
          setSelectedCallDetailState(data.call);
        }
        fetchData();
      } catch (err: any) {
        console.error('Hangup error:', err);
      } finally {
        setHangingUpCallId(null);
      }
    });
  };

  // Create Staff
  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    await runExclusive('create-staff', async () => {
      setStaffLoading(true);
      try {
        const res = await authFetch('/api/v1/users', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: staffName,
            email: staffEmail,
            password: staffPassword,
            role: staffRole,
          }),
        });
        const data = await res.json();
        if (res.ok) {
          alert(`Staff member ${staffName} created successfully!`);
          setShowStaffModal(false);
          setStaffName('');
          setStaffEmail('');
          setStaffPassword('');
          setStaffRole('operator');
          fetchData();
        } else {
          alert(data.error || 'Failed to create staff member');
        }
      } catch (err: any) {
        alert(err.message);
      } finally {
        setStaffLoading(false);
      }
    });
  };

  // Create Contact
  const handleCreateContact = async (e: React.FormEvent) => {
    e.preventDefault();
    await runExclusive('create-contact', async () => {
      setContactLoading(true);
      try {
        const res = await authFetch('/api/v1/contacts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: contactName,
            phone: contactPhone,
            email: contactEmail,
            company: contactCompany,
            notes: contactNotes,
          }),
        });
        const data = await res.json();
        if (res.ok) {
          alert(`Contact ${contactName} added successfully!`);
          setShowContactModal(false);
          setCallDestination(contactPhone);
          setContactName('');
          setContactPhone('');
          setContactEmail('');
          setContactCompany('');
          setContactNotes('');
          fetchData();
        } else {
          alert(data.error || 'Failed to add contact');
        }
      } catch (err: any) {
        alert(err.message);
      } finally {
        setContactLoading(false);
      }
    });
  };

  const handleDeleteContact = async (contactId: string) => {
    await runExclusive(`delete-contact:${contactId}`, async () => {
      if (!confirm('Are you sure you want to delete this contact?')) return;
      setDeletingContactId(contactId);
      try {
        const res = await authFetch(`/api/v1/contacts/${contactId}`, {
          method: 'DELETE',
        });
        if (res.ok) {
          setContactsList((prev) => prev.filter((c) => c.id !== contactId));
          fetchData();
        }
      } catch (err: any) {
        alert(err.message);
      } finally {
        setDeletingContactId(null);
      }
    });
  };

  const handleSendDtmf = async (callId: string, digits: string) => {
    await runExclusive(`dtmf:${callId}:${digits}`, async () => {
      setSendingDtmfDigits(digits);
      try {
        await authFetch(`/api/v1/calls/${callId}/live/dtmf`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({ digits }),
        });
        alert(`Sent DTMF digits ${digits}`);
      } finally {
        setSendingDtmfDigits(null);
      }
    });
  };

  const handleTriggerTranscription = async (
    recordingId: string,
    _provider: 'openai' = 'openai',
    model?: string,
    silent = false
  ) => {
    await runExclusive(`transcribe-rec:${recordingId}`, async () => {
      setTranscribingRecId(recordingId);
      setTranscribingProvider('openai');
      try {
        const targetModel =
          model ||
          integrationsSummary?.integrations?.find((i: any) => i.provider === 'openai')?.metadata?.model;

        const res = await authFetch(`/api/v1/recordings/${recordingId}/transcribe`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            provider: 'openai',
            ...(targetModel ? { model: targetModel } : {}),
          }),
        });
        const data = await res.json();
        if (res.ok) {
          if (!silent) {
            alert(
              data.message ||
                `Transcription generated successfully with OpenAI (${data.model || targetModel || 'primary model'})!`
            );
          }
          await fetchData();
          if (selectedCallIdRef.current) {
            await refreshCallDetail(selectedCallIdRef.current, true);
          }
        } else if (!silent) {
          alert(data.error || 'Failed to transcribe recording');
        }
      } catch (err: any) {
        if (!silent) {
          alert(err.message || 'Transcription request failed');
        }
      } finally {
        setTranscribingRecId(null);
        setTranscribingProvider(null);
      }
    });
  };

  const handleTriggerCallTranscription = async (
    callId: string,
    _provider: 'openai' = 'openai',
    model?: string,
    silent = false
  ) => {
    await runExclusive(`transcribe-call:${callId}`, async () => {
      setTranscribingProvider('openai');
      try {
        const targetModel =
          model ||
          integrationsSummary?.integrations?.find((i: any) => i.provider === 'openai')?.metadata?.model;

        const res = await authFetch(`/api/v1/calls/${callId}/transcribe`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            provider: 'openai',
            ...(targetModel ? { model: targetModel } : {}),
          }),
        });
        const data = await res.json();
        if (res.ok) {
          if (!silent) {
            alert(
              data.message ||
                `Transcription generated successfully with OpenAI (${data.model || targetModel || 'primary model'})!`
            );
          }
          await fetchData();
          if (selectedCallIdRef.current === callId) {
            await refreshCallDetail(callId, true);
          }
        } else if (!silent) {
          alert(data.error || 'Failed to trigger call transcription');
        }
      } catch (err: any) {
        if (!silent) {
          alert(err.message || 'Call transcription request failed');
        }
      } finally {
        setTranscribingProvider(null);
      }
    });
  };

  // Helper to resolve customer email from lead record, linked contact, or call counterpart phone
  const resolveCustomerEmailForLead = (lead: any, contacts: any[] = contactsList): { email: string; contactName?: string } => {
    if (!lead) return { email: '' };
    if (lead.customerEmail && lead.customerEmail.includes('@')) {
      return { email: lead.customerEmail, contactName: lead.contact?.name };
    }
    if (lead.contact?.email && lead.contact.email.includes('@')) {
      return { email: lead.contact.email, contactName: lead.contact.name };
    }
    const customerPhone = lead.call
      ? (lead.call.direction === 'outbound' ? lead.call.to : lead.call.from)
      : (lead.contact?.phone || null);

    if (customerPhone && contacts && contacts.length > 0) {
      const cleanTarget = customerPhone.replace(/\D/g, '');
      const matched = contacts.find((c: any) => {
        if (!c.phone) return false;
        const cClean = c.phone.replace(/\D/g, '');
        return c.phone === customerPhone || (cleanTarget && cClean === cleanTarget);
      });
      if (matched?.email && matched.email.includes('@')) {
        return { email: matched.email, contactName: matched.name };
      }
    }
    return { email: '', contactName: lead.contact?.name };
  };

  // Generate Itinerary from Call Transcription
  const handleGenerateItinerary = async (callId: string) => {
    await runExclusive(`gen-itinerary:${callId}`, async () => {
      setGeneratingItineraryCallId(callId);
      try {
        const res = await authFetch('/api/v1/leads/generate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ callId }),
        });
        const data = await res.json();
        if (res.ok && data.lead) {
          setSelectedLead(data.lead);
          const resolved = resolveCustomerEmailForLead(data.lead, contactsList);
          setLeadCustomerEmail(resolved.email);
          setLeadSelectedSupplierId(data.lead.selectedSupplierId || (suppliersList[0]?.id || ''));
          setLeadRevisionNotes(data.lead.revisionNotes || '');
          setSelectedCallDetail(null);
          fetchData();
        } else {
          alert(data.error || 'Failed to generate itinerary');
        }
      } catch (err: any) {
        alert(err.message || 'Error communicating with itinerary service');
      } finally {
        setGeneratingItineraryCallId(null);
      }
    });
  };

  // Generate Itinerary with Customized Intake Parameters
  const handleGenerateItineraryWithParams = async (callId: string, params: any) => {
    await runExclusive(`gen-itinerary:${callId}`, async () => {
      setGeneratingItineraryCallId(callId);
      try {
        const res = await authFetch('/api/v1/leads/generate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ callId, ...params }),
        });
        const data = await res.json();
        if (res.ok && data.lead) {
          setShowItineraryIntakeModal(false);
          setIntakeCallTarget(null);
          setSelectedLead(data.lead);
          const resolved = resolveCustomerEmailForLead(data.lead, contactsList);
          setLeadCustomerEmail(resolved.email);
          setLeadSelectedSupplierId(data.lead.selectedSupplierId || (suppliersList[0]?.id || ''));
          setLeadRevisionNotes(data.lead.revisionNotes || '');
          setSelectedCallDetail(null);
          fetchData();
        } else {
          alert(data.error || 'Failed to generate itinerary');
        }
      } catch (err: any) {
        alert(err.message || 'Error communicating with itinerary service');
      } finally {
        setGeneratingItineraryCallId(null);
      }
    });
  };

  // Select Lead Details (Instant 0ms optimistic drawer open + background full load)
  const handleSelectLead = async (leadId: string) => {
    await runExclusive(`select-lead:${leadId}`, async () => {
      setSelectingLeadId(leadId);
      const cachedLead = leadsList.find((l) => l.id === leadId);
      if (cachedLead) {
        setSelectedLead(cachedLead);
        const resolved = resolveCustomerEmailForLead(cachedLead, contactsList);
        setLeadCustomerEmail(resolved.email);
        setLeadSelectedSupplierId(cachedLead.selectedSupplierId || (suppliersList[0]?.id || ''));
        setLeadRevisionNotes(cachedLead.revisionNotes || '');
      }
      try {
        const res = await authFetch(`/api/v1/leads/${leadId}`);
        if (res.ok) {
          const data = await res.json();
          setSelectedLead(data.lead);
          const resolved = resolveCustomerEmailForLead(data.lead, contactsList);
          setLeadCustomerEmail(resolved.email);
          setLeadSelectedSupplierId(data.lead.selectedSupplierId || (suppliersList[0]?.id || ''));
          setLeadRevisionNotes(data.lead.revisionNotes || '');
        }
      } catch (err: any) {
        console.error('Error fetching lead detail:', err);
      } finally {
        setSelectingLeadId(null);
      }
    });
  };

  // Update Lead Status
  const handleUpdateLeadStatus = async (leadId: string, newStatus: string) => {
    await runExclusive(`update-lead-status:${leadId}`, async () => {
      setLeadsList((prev) =>
        prev.map((l) => (l.id === leadId ? { ...l, status: newStatus } : l))
      );
      if (selectedLead && selectedLead.id === leadId) {
        setSelectedLead((prev: any) => ({ ...prev, status: newStatus }));
      }

      try {
        const res = await authFetch(`/api/v1/leads/${leadId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ status: newStatus }),
        });
        if (!res.ok) {
          const data = await res.json();
          alert(data.error || 'Failed to update lead status');
          fetchData();
        }
      } catch (err: any) {
        console.error('Update lead status error:', err);
        fetchData();
      }
    });
  };

  // Revise Itinerary
  const handleReviseItinerary = async () => {
    if (!selectedLead) return;
    if (!leadRevisionNotes.trim()) {
      alert('Please enter your revision notes or corrections before submitting.');
      return;
    }
    await runExclusive(`revise-lead:${selectedLead.id}`, async () => {
      setLeadRevising(true);
      try {
        const res = await authFetch(`/api/v1/leads/${selectedLead.id}/revise`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ revisionNotes: leadRevisionNotes }),
        });
        const data = await res.json();
        if (res.ok) {
          const revisedLead = data.lead;
          const newItinerary = revisedLead?.itinerary || data.itinerary || selectedLead.itinerary || '';
          const newRevisionNotes = revisedLead?.revisionNotes || data.revisionNotes || selectedLead.revisionNotes || '';

          setSelectedLead((prev: any) => ({
            ...(prev || {}),
            ...(revisedLead || {}),
            itinerary: newItinerary,
            revisionNotes: newRevisionNotes,
            status: revisedLead?.status || 'revision_requested',
          }));
          setLeadRevisionNotes('');
          fetchData();
          alert('Itinerary revised successfully!');
        } else {
          alert(data.error || 'Failed to revise itinerary');
        }
      } catch (err: any) {
        alert(err.message);
      } finally {
        setLeadRevising(false);
      }
    });
  };

  // Approve and Send Itinerary
  const handleApproveAndSendItinerary = async () => {
    if (!selectedLead) return;
    if (!leadCustomerEmail || !leadCustomerEmail.includes('@')) {
      alert('Please enter a valid customer email address so we can dispatch the itinerary.');
      return;
    }
    await runExclusive(`send-lead:${selectedLead.id}`, async () => {
      setLeadSending(true);
      try {
        const res = await authFetch(`/api/v1/leads/${selectedLead.id}/send`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            customerEmail: leadCustomerEmail,
            supplierId: leadSelectedSupplierId || undefined,
          }),
        });
        const data = await res.json();
        if (res.ok) {
          setSelectedLead((prev: any) => ({
            ...prev,
            status: 'approved',
            customerEmail: leadCustomerEmail,
            customerSentAt: new Date().toISOString(),
            supplierSentAt: leadSelectedSupplierId ? new Date().toISOString() : null,
            selectedSupplierId: leadSelectedSupplierId,
          }));
          fetchData();
          alert(`Success! Itinerary approved.\n\n• Customer PDF dispatched to ${leadCustomerEmail}\n• Supplier RFQ PDF quotation request dispatched.`);
        } else {
          alert(data.error || 'Failed to send itinerary');
        }
      } catch (err: any) {
        alert(err.message);
      } finally {
        setLeadSending(false);
      }
    });
  };

  // Create Supplier
  const handleCreateSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    await runExclusive('create-supplier', async () => {
      setSupplierLoading(true);
      try {
        const res = await authFetch('/api/v1/suppliers', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: supplierName,
            category: supplierCategory,
            email: supplierEmail,
            phone: supplierPhone,
            contactPerson: supplierContactPerson,
            notes: supplierNotes,
          }),
        });
        const data = await res.json();
        if (res.ok) {
          alert(`Supplier ${supplierName} added successfully!`);
          setShowSupplierModal(false);
          setSupplierName('');
          setSupplierEmail('');
          setSupplierPhone('');
          setSupplierContactPerson('');
          setSupplierNotes('');
          fetchData();
        } else {
          alert(data.error || 'Failed to create supplier');
        }
      } catch (err: any) {
        alert(err.message);
      } finally {
        setSupplierLoading(false);
      }
    });
  };

  const handleDeleteSupplier = async (supplierId: string) => {
    await runExclusive(`delete-supplier:${supplierId}`, async () => {
      if (!confirm('Are you sure you want to delete this supplier?')) return;
      setDeletingSupplierId(supplierId);
      try {
        const res = await authFetch(`/api/v1/suppliers/${supplierId}`, {
          method: 'DELETE',
        });
        if (res.ok) {
          setSuppliersList((prev) => prev.filter((s) => s.id !== supplierId));
          fetchData();
        }
      } catch (err: any) {
        alert(err.message);
      } finally {
        setDeletingSupplierId(null);
      }
    });
  };

  return (
    <ConsoleContext.Provider
      value={{
        bearerToken,
        setBearerToken,
        currentUser,
        currentOrg,
        settings,
        setSettings,
        systemMode,
        loading,
        fetchData,
        handleSignOut,
        authFetch,
        numbers,
        setNumbers,
        calls,
        setCalls,
        threads,
        setThreads,
        activeThreadId,
        setActiveThreadId,
        activeThreadMessages,
        setActiveThreadMessages,
        recordings,
        setRecordings,
        transcripts,
        setTranscripts,
        auditLogs,
        setAuditLogs,
        staffList,
        setStaffList,
        contactsList,
        setContactsList,
        leadsList,
        setLeadsList,
        suppliersList,
        setSuppliersList,
        webPhoneStatus,
        setWebPhoneStatus,
        webPhoneMuted,
        webPhoneDuration,
        webPhoneError,
        setWebPhoneError,
        formatCallTimer,
        handleStartBrowserCall,
        handleToggleMute,
        handleHangupBrowserCall,
        showCallModal,
        setShowCallModal,
        callDestination,
        setCallDestination,
        callFromNumber,
        setCallFromNumber,
        callMode,
        setCallMode,
        callForwardTo,
        setCallForwardTo,
        callRecord,
        setCallRecord,
        callTranscribe,
        setCallTranscribe,
        callLoading,
        handlePlaceCall,
        selectedCallDetail,
        setSelectedCallDetail,
        callDetailSyncing,
        refreshCallDetail,
        transcribingRecId,
        setTranscribingRecId,
        transcribingProvider,
        setTranscribingProvider,
        handleTriggerTranscription,
        handleTriggerCallTranscription,
        handleGenerateItinerary,
        generatingItineraryCallId,
        hangingUpCallId,
        sendingDtmfDigits,
        showItineraryIntakeModal,
        setShowItineraryIntakeModal,
        intakeCallTarget,
        setIntakeCallTarget,
        openItineraryIntakeModal,
        handleGenerateItineraryWithParams,
        handleHangupLiveCall,
        handleSendDtmf,
        selectedLead,
        setSelectedLead,
        selectingLeadId,
        leadRevisionNotes,
        setLeadRevisionNotes,
        leadCustomerEmail,
        setLeadCustomerEmail,
        leadSelectedSupplierId,
        setLeadSelectedSupplierId,
        leadRevising,
        leadSending,
        showSendConfirmModal,
        setShowSendConfirmModal,
        handleSelectLead,
        handleUpdateLeadStatus,
        handleReviseItinerary,
        handleApproveAndSendItinerary,
        resolveCustomerEmailForLead,
        showSupplierModal,
        setShowSupplierModal,
        supplierName,
        setSupplierName,
        supplierCategory,
        setSupplierCategory,
        supplierEmail,
        setSupplierEmail,
        supplierPhone,
        setSupplierPhone,
        supplierContactPerson,
        setSupplierContactPerson,
        supplierNotes,
        setSupplierNotes,
        supplierLoading,
        deletingSupplierId,
        handleCreateSupplier,
        handleDeleteSupplier,
        showStaffModal,
        setShowStaffModal,
        staffName,
        setStaffName,
        staffEmail,
        setStaffEmail,
        staffPassword,
        setStaffPassword,
        staffRole,
        setStaffRole,
        staffLoading,
        handleCreateStaff,
        showContactModal,
        setShowContactModal,
        contactName,
        setContactName,
        contactPhone,
        setContactPhone,
        contactEmail,
        setContactEmail,
        contactCompany,
        setContactCompany,
        contactNotes,
        setContactNotes,
        contactLoading,
        deletingContactId,
        handleCreateContact,
        handleDeleteContact,
        showBuyModal,
        setShowBuyModal,
        searchIso,
        setSearchIso,
        availableNumbers,
        searchingNumbers,
        buyingNumberE164,
        handleSearchNumbers,
        handleBuyNumber,
        smsDestination,
        setSmsDestination,
        smsText,
        setSmsText,
        smsSending,
        handleSendSms,
        playingAudioId,
        setPlayingAudioId,
        transcriptSearch,
        setTranscriptSearch,
        initWebPhone,
        isMobileMenuOpen,
        setIsMobileMenuOpen,
        incomingCall,
        setIncomingCall,
        handleAnswerIncomingCall,
        handleRejectIncomingCall,
        organizationsList,
        setOrganizationsList,
        showOrgModal,
        setShowOrgModal,
        creatingOrg,
        handleSwitchOrganization,
        handleCreateOrganization,
        integrationsSummary,
        setIntegrationsSummary,
        fetchIntegrations,
      }}
    >
      {children}
    </ConsoleContext.Provider>
  );
}

export function useConsole() {
  const context = useContext(ConsoleContext);
  if (!context) {
    throw new Error('useConsole must be used within a ConsoleProvider');
  }
  return context;
}
