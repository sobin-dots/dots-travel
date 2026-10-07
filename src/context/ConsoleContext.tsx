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
  refreshCallDetail: (callId: string) => Promise<void>;
  transcribingRecId: string | null;
  setTranscribingRecId: (id: string | null) => void;
  handleTriggerTranscription: (recordingId: string, provider?: 'openai' | 'plivo') => Promise<void>;
  handleGenerateItinerary: (callId: string) => Promise<void>;
  generatingItineraryCallId: string | null;
  handleHangupLiveCall: (callId: string) => Promise<void>;
  handleSendDtmf: (callId: string, digits: string) => Promise<void>;

  // Leads & AI Itinerary review drawer
  selectedLead: any | null;
  setSelectedLead: (lead: any | null) => void;
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
  handleCreateContact: (e: React.FormEvent) => Promise<void>;
  handleDeleteContact: (contactId: string) => Promise<void>;

  // Buy Number modal
  showBuyModal: boolean;
  setShowBuyModal: (show: boolean) => void;
  searchIso: string;
  setSearchIso: (iso: string) => void;
  availableNumbers: any[];
  searchingNumbers: boolean;
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
  const [settings, setSettings] = useState<any>(null);
  const [systemMode] = useState<'live'>('live');
  const [loading, setLoading] = useState<boolean>(true);

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
  const [generatingItineraryCallId, setGeneratingItineraryCallId] = useState<string | null>(null);
  const [leadRevisionNotes, setLeadRevisionNotes] = useState<string>('');
  const [leadCustomerEmail, setLeadCustomerEmail] = useState<string>('');
  const [leadSelectedSupplierId, setLeadSelectedSupplierId] = useState<string>('');
  const [leadRevising, setLeadRevising] = useState<boolean>(false);
  const [leadSending, setLeadSending] = useState<boolean>(false);
  const [showSendConfirmModal, setShowSendConfirmModal] = useState<boolean>(false);

  // Supplier modal state
  const [showSupplierModal, setShowSupplierModal] = useState<boolean>(false);
  const [supplierName, setSupplierName] = useState<string>('');
  const [supplierCategory, setSupplierCategory] = useState<'hotels' | 'flights' | 'transport' | 'activities' | 'packages'>('hotels');
  const [supplierEmail, setSupplierEmail] = useState<string>('');
  const [supplierPhone, setSupplierPhone] = useState<string>('');
  const [supplierContactPerson, setSupplierContactPerson] = useState<string>('');
  const [supplierNotes, setSupplierNotes] = useState<string>('');
  const [supplierLoading, setSupplierLoading] = useState<boolean>(false);

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
  const [selectedCallDetail, setSelectedCallDetail] = useState<any | null>(null);
  const [callDetailSyncing, setCallDetailSyncing] = useState<boolean>(false);
  const [transcribingRecId, setTranscribingRecId] = useState<string | null>(null);

  // In-Browser Web Phone (WebRTC) state
  const [webPhoneStatus, setWebPhoneStatus] = useState<'idle' | 'logging_in' | 'ready' | 'calling' | 'ringing' | 'connected' | 'ended' | 'error'>('idle');
  const [webPhoneMuted, setWebPhoneMuted] = useState(false);
  const [webPhoneDuration, setWebPhoneDuration] = useState(0);
  const [webPhoneError, setWebPhoneError] = useState<string | null>(null);
  const [endpointConfig, setEndpointConfig] = useState<any>(null);
  const [incomingCall, setIncomingCall] = useState<{ callerId: string; extraHeaders?: any } | null>(null);

  const plivoClientRef = useRef<any>(null);
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

  // SMS composer state
  const [smsDestination, setSmsDestination] = useState('+14155550199');
  const [smsText, setSmsText] = useState('Hello from Plivo Operations Console!');
  const [smsSending, setSmsSending] = useState(false);

  // Search & Buy Number state
  const [showBuyModal, setShowBuyModal] = useState(false);
  const [searchIso, setSearchIso] = useState('US');
  const [availableNumbers, setAvailableNumbers] = useState<any[]>([]);
  const [searchingNumbers, setSearchingNumbers] = useState(false);

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



  // Strict Auth Gate: MUST be accessed ONLY by login
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const localToken = localStorage.getItem('plivo_access_token');
      const localUser = localStorage.getItem('plivo_user');
      const localOrg = localStorage.getItem('plivo_org');
      if (localToken) {
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

  // Fetch Console Data when Bearer Token is ready (with auto-refresh on 401)
  const fetchData = async () => {
    let token: string = bearerToken || (typeof window !== 'undefined' ? localStorage.getItem('plivo_access_token') || '' : '');
    if (!token) return;
    setLoading(true);

    const executeFetch = async (authToken: string) => {
      const headers = {
        Authorization: `Bearer ${authToken}`,
        'ngrok-skip-browser-warning': 'true',
      };
      return Promise.all([
        fetch('/api/v1/numbers', { headers }).then((r) => r.json()),
        fetch('/api/v1/calls', { headers }).then((r) => r.json()),
        fetch('/api/v1/messages/threads', { headers }).then((r) => r.json()),
        fetch('/api/v1/recordings', { headers }).then((r) => r.json()),
        fetch('/api/v1/transcriptions', { headers }).then((r) => r.json()),
        fetch('/api/v1/settings', { headers }).then((r) => r.json()),
        fetch('/api/v1/audit', { headers }).then((r) => r.json()),
        fetch('/api/v1/users', { headers }).then((r) => r.json()),
        fetch('/api/v1/contacts', { headers }).then((r) => r.json()),
        fetch('/api/v1/leads', { headers }).then((r) => r.json()),
        fetch('/api/v1/suppliers', { headers }).then((r) => r.json()),
      ]);
    };

    try {
      let results = await executeFetch(token);

      // If token expired (401 auth_err), attempt seamless token refresh
      if (results[0]?.api_id === 'auth_err' || results[5]?.api_id === 'auth_err') {
        const refreshToken = localStorage.getItem('plivo_refresh_token');
        if (refreshToken) {
          try {
            const refreshRes = await fetch('/api/v1/auth/refresh', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'ngrok-skip-browser-warning': 'true',
              },
              body: JSON.stringify({ refreshToken }),
            });
            const refreshData = await refreshRes.json();
            if (refreshRes.ok && refreshData.accessToken) {
              token = refreshData.accessToken;
              localStorage.setItem('plivo_access_token', token);
              if (refreshData.refreshToken) {
                localStorage.setItem('plivo_refresh_token', refreshData.refreshToken);
              }
              setBearerToken(token);
              results = await executeFetch(token);
            } else {
              handleSignOut();
              return;
            }
          } catch {
            handleSignOut();
            return;
          }
        } else {
          handleSignOut();
          return;
        }
      }

      const [numRes, callRes, threadRes, recRes, transRes, setRes, auditRes, staffRes, contactRes, leadRes, suppRes] = results;

      if (numRes.objects) {
        setNumbers(numRes.objects);
        if (numRes.objects[0] && !callFromNumber) {
          setCallFromNumber(numRes.objects[0].id);
        }
      }
      if (callRes.objects) setCalls(callRes.objects);
      if (threadRes.objects) {
        setThreads(threadRes.objects);
        if (threadRes.objects[0] && !activeThreadId) {
          setActiveThreadId(threadRes.objects[0].id);
        }
      }
      if (recRes.objects) setRecordings(recRes.objects);
      if (transRes.objects) setTranscripts(transRes.objects);
      if (setRes.organization) setSettings(setRes);
      if (auditRes.objects) setAuditLogs(auditRes.objects);
      if (staffRes.objects) setStaffList(staffRes.objects);
      if (contactRes.objects) {
        setContactsList(contactRes.objects);
        if (contactRes.objects.length > 0 && !callDestination) {
          setCallDestination(contactRes.objects[0].phone);
        }
      }
      if (leadRes.objects) setLeadsList(leadRes.objects);
      if (suppRes.objects) {
        setSuppliersList(suppRes.objects);
        if (suppRes.objects.length > 0 && !leadSelectedSupplierId) {
          setLeadSelectedSupplierId(suppRes.objects[0].id);
        }
      }
    } catch (err) {
      console.error('Data fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (bearerToken) fetchData();
  }, [bearerToken]);

  // Fetch active thread messages
  useEffect(() => {
    if (!bearerToken || !activeThreadId) return;
    fetch(`/api/v1/messages/threads/${activeThreadId}`, {
      headers: { Authorization: `Bearer ${bearerToken}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.thread?.messages) {
          setActiveThreadMessages(data.thread.messages);
        }
      });
  }, [bearerToken, activeThreadId]);

  // Refresh single call details
  const refreshCallDetail = async (callId: string) => {
    if (!callId) return;
    const token = bearerToken || (typeof window !== 'undefined' ? localStorage.getItem('plivo_access_token') : null);
    if (!token) return;
    setCallDetailSyncing(true);
    try {
      const res = await fetch(`/api/v1/calls/${callId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedCallDetail(data.call);
      }
    } catch {}
    finally {
      setCallDetailSyncing(false);
    }
  };

  // Auto-polling for Call Details drawer when recording or transcription is processing
  useEffect(() => {
    if (!selectedCallDetail) return;
    const token = bearerToken || (typeof window !== 'undefined' ? localStorage.getItem('plivo_access_token') : null);
    if (!token) return;

    const hasRecordings = Boolean(selectedCallDetail.recordings && selectedCallDetail.recordings.length > 0);
    const hasTranscriptions = Boolean(selectedCallDetail.transcriptions && selectedCallDetail.transcriptions.length > 0);

    if (!hasRecordings || !hasTranscriptions || selectedCallDetail.status === 'in-progress' || selectedCallDetail.isRecordingProcessing || selectedCallDetail.isTranscriptionProcessing) {
      const interval = setInterval(async () => {
        try {
          const res = await fetch(`/api/v1/calls/${selectedCallDetail.id}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const data = await res.json();
            setSelectedCallDetail(data.call);
          }
        } catch {}
      }, 2500);

      return () => clearInterval(interval);
    }
  }, [selectedCallDetail?.id, selectedCallDetail?.recordings?.length, selectedCallDetail?.transcriptions?.length, selectedCallDetail?.status, bearerToken]);

  // Initialize In-Browser Web Phone
  const initWebPhone = async () => {
    const token = bearerToken || (typeof window !== 'undefined' ? localStorage.getItem('plivo_access_token') : null);
    if (!token) return;
    try {
      const res = await fetch('/api/v1/telephony/endpoint', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok && data.username) {
        setEndpointConfig(data);
        if (typeof window !== 'undefined' && (window as any).Plivo) {
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
              console.log('[WebPhone] SIP registered successfully with Plivo');
              setWebPhoneStatus('ready');
              setWebPhoneError(null);
            });
            clientInstance.on('onLoginFailed', (cause: any) => {
              console.error('[WebPhone] SIP registration failed:', cause);
              setWebPhoneStatus('error');
              setWebPhoneError(`SIP Auth Failed: ${cause?.message || cause || 'Check credentials'}`);
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

            clientInstance.login(data.username, data.password);
            plivoClientRef.current = clientInstance;
            if (typeof window !== 'undefined') {
              (window as any).plivoClient = clientInstance;
            }
          } else {
            setWebPhoneStatus('ready');
          }
        } else {
          setWebPhoneStatus('ready');
        }
      }
    } catch (e: any) {
      console.warn('Web phone init notice:', e.message);
    }
  };

  useEffect(() => {
    if (bearerToken) {
      initWebPhone();
    }
  }, [bearerToken]);

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
        plivoClientRef.current.call(cleanDestination, { 'X-PH-callerId': callerId });
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
      const res = await fetch('/api/v1/calls', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${bearerToken}`,
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
          const detailRes = await fetch(`/api/v1/calls/${data.call.id}`, {
            headers: { Authorization: `Bearer ${bearerToken}` },
          });
          if (detailRes.ok) {
            const detailData = await detailRes.json();
            setSelectedCallDetail(detailData.call);
          }
        }
      } else {
        alert(data.error || 'Failed to place call');
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setCallLoading(false);
    }
  };

  // Send SMS Handler
  const handleSendSms = async () => {
    if (!smsText || !smsDestination || numbers.length === 0) return;
    setSmsSending(true);
    try {
      const fromNumberId = numbers[0].id;
      const res = await fetch('/api/v1/messages/send', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${bearerToken}`,
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
  };

  // Search Available Numbers
  const handleSearchNumbers = async () => {
    setSearchingNumbers(true);
    try {
      const res = await fetch(`/api/v1/numbers/search?country_iso=${searchIso}`, {
        headers: { Authorization: `Bearer ${bearerToken}` },
      });
      const data = await res.json();
      if (data.objects) {
        setAvailableNumbers(data.objects);
      }
    } catch (err) {
      console.error('Search numbers error:', err);
    } finally {
      setSearchingNumbers(false);
    }
  };

  // Buy Number Handler
  const handleBuyNumber = async (number: string) => {
    try {
      const res = await fetch('/api/v1/numbers/buy', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${bearerToken}`,
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
    }
  };

  // Hangup Live Call
  const handleHangupLiveCall = async (callId: string) => {
    try {
      await fetch(`/api/v1/calls/${callId}/live`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${bearerToken}` },
      });
      const res = await fetch(`/api/v1/calls/${callId}`, {
        headers: { Authorization: `Bearer ${bearerToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedCallDetail(data.call);
      }
      fetchData();
    } catch (err: any) {
      console.error('Hangup error:', err);
    }
  };

  // Create Staff
  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setStaffLoading(true);
    try {
      const res = await fetch('/api/v1/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${bearerToken}`,
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
  };

  // Create Contact
  const handleCreateContact = async (e: React.FormEvent) => {
    e.preventDefault();
    setContactLoading(true);
    try {
      const res = await fetch('/api/v1/contacts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${bearerToken}`,
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
  };

  const handleDeleteContact = async (contactId: string) => {
    if (!confirm('Are you sure you want to delete this contact?')) return;
    try {
      const res = await fetch(`/api/v1/contacts/${contactId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${bearerToken}` },
      });
      if (res.ok) {
        fetchData();
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleSendDtmf = async (callId: string, digits: string) => {
    await fetch(`/api/v1/calls/${callId}/live/dtmf`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${bearerToken}`,
      },
      body: JSON.stringify({ digits }),
    });
    alert(`Sent DTMF digits ${digits}`);
  };

  const handleTriggerTranscription = async (recordingId: string, provider: 'openai' | 'plivo' = 'openai') => {
    setTranscribingRecId(recordingId);
    try {
      const res = await fetch(`/api/v1/recordings/${recordingId}/transcribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${bearerToken}`,
        },
        body: JSON.stringify({ provider }),
      });
      const data = await res.json();
      if (res.ok) {
        alert(data.message || 'Transcription generated successfully with OpenAI Whisper!');
        fetchData();
        if (selectedCallDetail) {
          refreshCallDetail(selectedCallDetail.id);
        }
      } else {
        alert(data.error || 'Failed to transcribe recording');
      }
    } catch (err: any) {
      alert(err.message || 'Transcription request failed');
    } finally {
      setTranscribingRecId(null);
    }
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
    setGeneratingItineraryCallId(callId);
    try {
      const res = await fetch('/api/v1/leads/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${bearerToken}`,
        },
        body: JSON.stringify({ callId }),
      });
      const data = await res.json();
      if (res.ok && data.lead) {
        await fetchData();
        const leadDetailRes = await fetch(`/api/v1/leads/${data.lead.id}`, {
          headers: { Authorization: `Bearer ${bearerToken}` },
        });
        if (leadDetailRes.ok) {
          const detailData = await leadDetailRes.json();
          setSelectedLead(detailData.lead);
          const resolved = resolveCustomerEmailForLead(detailData.lead, contactsList);
          setLeadCustomerEmail(resolved.email);
          setLeadSelectedSupplierId(detailData.lead.selectedSupplierId || (suppliersList[0]?.id || ''));
          setLeadRevisionNotes(detailData.lead.revisionNotes || '');
        } else {
          setSelectedLead(data.lead);
          const resolved = resolveCustomerEmailForLead(data.lead, contactsList);
          setLeadCustomerEmail(resolved.email);
        }
        setSelectedCallDetail(null);
      } else {
        alert(data.error || 'Failed to generate itinerary');
      }
    } catch (err: any) {
      alert(err.message || 'Error communicating with itinerary service');
    } finally {
      setGeneratingItineraryCallId(null);
    }
  };

  // Select Lead Details
  const handleSelectLead = async (leadId: string) => {
    try {
      const res = await fetch(`/api/v1/leads/${leadId}`, {
        headers: { Authorization: `Bearer ${bearerToken}` },
      });
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
    }
  };

  // Update Lead Status
  const handleUpdateLeadStatus = async (leadId: string, newStatus: string) => {
    setLeadsList((prev) =>
      prev.map((l) => (l.id === leadId ? { ...l, status: newStatus } : l))
    );
    if (selectedLead && selectedLead.id === leadId) {
      setSelectedLead((prev: any) => ({ ...prev, status: newStatus }));
    }

    try {
      const res = await fetch(`/api/v1/leads/${leadId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${bearerToken}`,
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
  };

  // Revise Itinerary
  const handleReviseItinerary = async () => {
    if (!selectedLead) return;
    if (!leadRevisionNotes.trim()) {
      alert('Please enter your revision notes or corrections before submitting.');
      return;
    }
    setLeadRevising(true);
    try {
      const res = await fetch(`/api/v1/leads/${selectedLead.id}/revise`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${bearerToken}`,
        },
        body: JSON.stringify({ revisionNotes: leadRevisionNotes }),
      });
      const data = await res.json();
      if (res.ok) {
        setSelectedLead((prev: any) => ({
          ...prev,
          itinerary: data.itinerary,
          revisionNotes: data.revisionNotes,
          status: 'revision_requested',
        }));
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
  };

  // Approve and Send Itinerary
  const handleApproveAndSendItinerary = async () => {
    if (!selectedLead) return;
    if (!leadCustomerEmail || !leadCustomerEmail.includes('@')) {
      alert('Please enter a valid customer email address so we can dispatch the itinerary.');
      return;
    }
    setLeadSending(true);
    try {
      const res = await fetch(`/api/v1/leads/${selectedLead.id}/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${bearerToken}`,
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
  };

  // Create Supplier
  const handleCreateSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    setSupplierLoading(true);
    try {
      const res = await fetch('/api/v1/suppliers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${bearerToken}`,
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
  };

  const handleDeleteSupplier = async (supplierId: string) => {
    if (!confirm('Are you sure you want to delete this supplier?')) return;
    try {
      const res = await fetch(`/api/v1/suppliers/${supplierId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${bearerToken}` },
      });
      if (res.ok) {
        fetchData();
      }
    } catch (err: any) {
      alert(err.message);
    }
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
        handleTriggerTranscription,
        handleGenerateItinerary,
        generatingItineraryCallId,
        handleHangupLiveCall,
        handleSendDtmf,
        selectedLead,
        setSelectedLead,
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
        handleCreateContact,
        handleDeleteContact,
        showBuyModal,
        setShowBuyModal,
        searchIso,
        setSearchIso,
        availableNumbers,
        searchingNumbers,
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
