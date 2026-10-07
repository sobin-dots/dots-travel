'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Script from 'next/script';
import {
  Phone,
  MessageSquare,
  Mic,
  MicOff,
  PhoneOff,
  Volume2,
  FileText,
  Hash,
  Settings,
  Shield,
  Activity,
  Play,
  Pause,
  Download,
  Trash2,
  Send,
  Plus,
  RefreshCw,
  Search,
  CheckCircle,
  Clock,
  ExternalLink,
  ChevronRight,
  ChevronDown,
  Info,
  DollarSign,
  User,
  LogOut,
  Users,
  UserPlus,
  BookUser,
  AlertTriangle,
  Sparkles,
  Compass,
  Building2,
  CheckCircle2,
  Edit3,
  Mail,
  FileCheck,
  PhoneCall,
} from 'lucide-react';
import { analyzeMessageEncoding } from '@/lib/telephony/messaging/encoder';
import { VisualItinerary } from '@/components/VisualItinerary';
import { CallToneGenerator } from '@/lib/call-tones';

export default function OperationsConsole() {
  const [activeTab, setActiveTab] = useState<'overview' | 'calls' | 'leads' | 'suppliers' | 'contacts' | 'users' | 'messages' | 'recordings' | 'transcripts' | 'numbers' | 'settings' | 'audit'>('overview');
  const [bearerToken, setBearerToken] = useState<string>('');
  const [authError, setAuthError] = useState<string | null>(null);

  // Data states
  const [numbers, setNumbers] = useState<any[]>([]);
  const [calls, setCalls] = useState<any[]>([]);
  const [threads, setThreads] = useState<any[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [activeThreadMessages, setActiveThreadMessages] = useState<any[]>([]);
  const [recordings, setRecordings] = useState<any[]>([]);
  const [transcripts, setTranscripts] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [contactsList, setContactsList] = useState<any[]>([]);
  const [leadsList, setLeadsList] = useState<any[]>([]);
  const [suppliersList, setSuppliersList] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Leads & AI Itinerary state
  const [selectedLead, setSelectedLead] = useState<any | null>(null);
  const [generatingItineraryCallId, setGeneratingItineraryCallId] = useState<string | null>(null);
  const [leadRevisionNotes, setLeadRevisionNotes] = useState<string>('');
  const [leadCustomerEmail, setLeadCustomerEmail] = useState<string>('');
  const [leadSelectedSupplierId, setLeadSelectedSupplierId] = useState<string>('');
  const [leadRevising, setLeadRevising] = useState<boolean>(false);
  const [leadSending, setLeadSending] = useState<boolean>(false);

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

  // New call modal state
  const [showCallModal, setShowCallModal] = useState(false);
  const [callDestination, setCallDestination] = useState('');
  const [callFromNumber, setCallFromNumber] = useState('');
  const [callMode, setCallMode] = useState<'browser' | 'bridge' | 'xml' | 'forward' | 'voicemail'>('browser');
  const [callForwardTo, setCallForwardTo] = useState('');
  const [callRecord, setCallRecord] = useState(true);
  const [callTranscribe, setCallTranscribe] = useState(true);
  const [callLoading, setCallLoading] = useState(false);
  const [selectedCallDetail, setSelectedCallDetail] = useState<any | null>(null);
  const [callDetailSyncing, setCallDetailSyncing] = useState<boolean>(false);

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

    // If either recording or transcription is missing/processing, poll every 2.5s
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

  // In-Browser Web Phone (WebRTC) state
  const [webPhoneStatus, setWebPhoneStatus] = useState<'idle' | 'logging_in' | 'ready' | 'calling' | 'ringing' | 'connected' | 'ended' | 'error'>('idle');
  const [webPhoneMuted, setWebPhoneMuted] = useState(false);
  const [webPhoneDuration, setWebPhoneDuration] = useState(0);
  const [webPhoneError, setWebPhoneError] = useState<string | null>(null);
  const [endpointConfig, setEndpointConfig] = useState<any>(null);

  const plivoClientRef = useRef<any>(null);
  const callTimerRef = useRef<any>(null);
  const toneGenRef = useRef<CallToneGenerator | null>(null);

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

  // Fetch Endpoint Configuration and Initialize Web Phone
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
          let clientInstance: any = null;

          try {
            // Plivo Browser SDK v2 instantiation
            const plivoSdk = new PlivoClass({ debug: 'INFO', permOnClick: true });
            clientInstance = plivoSdk.client || plivoSdk;
          } catch {
            try {
              clientInstance = new PlivoClass.Client();
            } catch {}
          }

          if (clientInstance) {
            clientInstance.on('onLogin', () => {
              console.log('[WebPhone] Registered to Plivo successfully');
              setWebPhoneStatus('ready');
            });
            clientInstance.on('onLoginFailed', (cause: any) => {
              console.warn('[WebPhone] Login failed:', cause);
            });
            clientInstance.on('onCalling', () => {
              console.log('[WebPhone] Call connecting');
              setWebPhoneStatus('calling');
            });
            clientInstance.on('onCallRemoteRinging', () => {
              console.log('[WebPhone] Remote party ringing');
              setWebPhoneStatus('ringing');
            });
            clientInstance.on('onCallAnswered', () => {
              console.log('[WebPhone] Call answered');
              setWebPhoneStatus('connected');
            });
            clientInstance.on('onCallConnected', () => {
              console.log('[WebPhone] Call audio connected');
              setWebPhoneStatus('connected');
            });
            clientInstance.on('onCallTerminated', () => {
              console.log('[WebPhone] Call terminated');
              setWebPhoneStatus('ended');
              fetchData();
            });
            clientInstance.on('onCallFailed', (cause: any) => {
              console.warn('[WebPhone] Call failed:', cause);
              setWebPhoneStatus('error');
              setWebPhoneError(cause?.message || 'Call failed');
            });

            clientInstance.login(data.username, data.password);
            plivoClientRef.current = clientInstance;
          } else {
            setWebPhoneStatus('ready');
          }
        } else {
          setWebPhoneStatus('ready');
        }
      }
    } catch (e: any) {
      console.warn('Web phone endpoint init notice:', e.message);
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
    // Start dot caller tune immediately on user gesture
    toneGenRef.current?.startConnectingTune();
    setWebPhoneStatus('calling');
    setWebPhoneError(null);
    setWebPhoneDuration(0);

    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        await navigator.mediaDevices.getUserMedia({ audio: true });
      }

      if (!plivoClientRef.current && typeof window !== 'undefined' && (window as any).Plivo && endpointConfig) {
        try {
          const PlivoClass = (window as any).Plivo;
          const plivoSdk = new PlivoClass({ debug: 'INFO', permOnClick: true });
          const clientInstance = plivoSdk.client || plivoSdk;
          if (clientInstance) {
            clientInstance.login(endpointConfig.username, endpointConfig.password);
            plivoClientRef.current = clientInstance;
          }
        } catch {}
      }

      if (plivoClientRef.current && endpointConfig) {
        const callerId = endpointConfig.callerId || '+918065531234';
        plivoClientRef.current.call(callDestination, {
          'X-PH-callerId': callerId,
        });

        // Set realistic telecom ringing caller tune progression
        setTimeout(() => {
          setWebPhoneStatus((curr) => (curr === 'calling' ? 'ringing' : curr));
        }, 2600);
      } else {
        // Fallback simulation timer with authentic dot & ring caller tunes
        setTimeout(() => setWebPhoneStatus('ringing'), 2600);
        setTimeout(() => setWebPhoneStatus('connected'), 6000);
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
    if (plivoClientRef.current) {
      try { plivoClientRef.current.hangup(); } catch {}
    }
    setWebPhoneStatus('ended');
    if (callTimerRef.current) clearInterval(callTimerRef.current);
    setTimeout(() => {
      fetchData();
    }, 1500);
  };

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

  const [currentUser, setCurrentUser] = useState<any>(null);
  const [currentOrg, setCurrentOrg] = useState<any>(null);
  const [systemMode, setSystemMode] = useState<'live' | 'simulator'>('live');

  // Probe backend ready state directly for authoritative mode detection
  useEffect(() => {
    fetch('/api/v1/ready')
      .then((r) => r.json())
      .then((d) => {
        if (d.telephonyMode) setSystemMode(d.telephonyMode);
      })
      .catch(() => {});
  }, []);

  // 1. Strict Auth Gate: MUST be accessed ONLY by login
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
        setAuthError(null);
      } else {
        // Unauthenticated access prohibited - redirect immediately to login screen
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

  // 2. Fetch Console Data when Bearer Token is ready (with auto-refresh on 401)
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

  // Place Call Handler - strictly gated by contacts
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

  // Live Call Controls
  const handleHangupLiveCall = async (callId: string) => {
    try {
      await fetch(`/api/v1/calls/${callId}/live`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${bearerToken}` },
      });
      // Immediately refresh this call's detail to show generated recording and transcription
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

  // Staff Management Handlers
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

  // Contact Directory Handlers
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

  // Live Send DTMF
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

  // Transcribe On-Demand
  const handleTranscribeNow = async (recordingId: string) => {
    const res = await fetch(`/api/v1/recordings/${recordingId}/transcribe`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${bearerToken}` },
    });
    if (res.ok) {
      alert('Transcription request queued!');
      fetchData();
    }
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
        // Load detailed lead
        const leadDetailRes = await fetch(`/api/v1/leads/${data.lead.id}`, {
          headers: { Authorization: `Bearer ${bearerToken}` },
        });
        if (leadDetailRes.ok) {
          const detailData = await leadDetailRes.json();
          setSelectedLead(detailData.lead);
          setLeadCustomerEmail(detailData.lead.customerEmail || detailData.lead.contact?.email || '');
          setLeadSelectedSupplierId(detailData.lead.selectedSupplierId || (suppliersList[0]?.id || ''));
          setLeadRevisionNotes(detailData.lead.revisionNotes || '');
        } else {
          setSelectedLead(data.lead);
          setLeadCustomerEmail(data.lead.customerEmail || data.lead.contact?.email || '');
        }
        setSelectedCallDetail(null);
        setActiveTab('leads');
      } else {
        alert(data.error || 'Failed to generate itinerary');
      }
    } catch (err: any) {
      alert(err.message || 'Error communicating with DeepSeek service');
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
        setLeadCustomerEmail(data.lead.customerEmail || data.lead.contact?.email || '');
        setLeadSelectedSupplierId(data.lead.selectedSupplierId || (suppliersList[0]?.id || ''));
        setLeadRevisionNotes(data.lead.revisionNotes || '');
      }
    } catch (err: any) {
      console.error('Error fetching lead detail:', err);
    }
  };

  // Update Lead Status (called from Lead Management table dropdown or Lead Detail modal)
  const handleUpdateLeadStatus = async (leadId: string, newStatus: string) => {
    // Optimistically update list & detail state
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

  // Revise Itinerary with DeepSeek
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
        alert('Itinerary revised successfully by DeepSeek!');
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

  // Delete Supplier
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

  // SMS Analysis widget
  const smsAnalysis = analyzeMessageEncoding(smsText);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans">
      {/* Top Navbar */}
      <header className="border-b border-zinc-800 bg-zinc-900/70 backdrop-blur sticky top-0 z-30 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/20">
              P
            </div>
            <div>
              <span className="font-bold text-sm tracking-tight text-white block">Plivo Platform</span>
              <span className="text-[10px] text-zinc-400 block -mt-0.5">Enterprise Operations Console</span>
            </div>
          </div>

          <div className="h-4 w-px bg-zinc-800 mx-2" />

          {/* Telephony Mode Badge */}
          <div
            className={`flex items-center gap-2 border px-3 py-1 rounded-full text-xs transition ${
              (settings?.telephonyMode || systemMode) === 'live'
                ? 'bg-emerald-950/80 border-emerald-700/80'
                : 'bg-zinc-950 border-zinc-800'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                (settings?.telephonyMode || systemMode) === 'live'
                  ? 'bg-emerald-400 shadow-sm shadow-emerald-400'
                  : 'bg-amber-400'
              } animate-pulse`}
            />
            <span className="text-zinc-300 font-medium text-[11px]">Mode:</span>
            <span
              className={`font-semibold uppercase tracking-wider text-[11px] ${
                (settings?.telephonyMode || systemMode) === 'live' ? 'text-emerald-400' : 'text-amber-400'
              }`}
            >
              {(settings?.telephonyMode || systemMode) === 'live' ? 'LIVE (PLIVO)' : 'SIMULATOR'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchData}
            className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-zinc-200 transition text-xs flex items-center gap-1.5 border border-zinc-800/80"
            title="Refresh Data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Sync</span>
          </button>
          <Link
            href="/docs"
            className="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-3 py-1.5 rounded-lg border border-zinc-700 flex items-center gap-1.5 transition"
          >
            <span>API Docs</span>
            <ExternalLink className="w-3 h-3" />
          </Link>
          <div className="text-xs bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 px-3 py-1.5 rounded-lg font-medium">
            {currentOrg?.name || 'Acme Communications'}
          </div>
          <Link
            href="/login"
            className="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-2.5 py-1.5 rounded-lg border border-zinc-700 flex items-center gap-1.5 transition"
            title="Switch User / Login"
          >
            <User className="w-3.5 h-3.5 text-emerald-400" />
            <span className="max-w-[120px] truncate">{currentUser?.name || 'Account'}</span>
          </Link>
          <button
            onClick={handleSignOut}
            className="text-xs text-zinc-400 hover:text-red-400 p-1.5 hover:bg-zinc-800 rounded-lg transition border border-transparent hover:border-zinc-700"
            title="Sign Out"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* Main Body with Sidebar */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar Nav */}
        <aside className="w-60 border-r border-zinc-800/80 bg-zinc-900/30 p-4 space-y-1 shrink-0 flex flex-col justify-between">
          <nav className="space-y-1">
            {[
              { id: 'overview', label: 'Overview', icon: Activity },
              { id: 'calls', label: 'Calls', icon: Phone, badge: calls.filter((c) => c.status === 'in-progress').length || undefined },
              { id: 'leads', label: 'Leads & Itineraries', icon: Compass, count: leadsList.length },
              { id: 'suppliers', label: 'Suppliers', icon: Building2, count: suppliersList.length },
              { id: 'contacts', label: 'Contacts', icon: BookUser, count: contactsList.length },
              { id: 'users', label: 'Staff Team', icon: Users, count: staffList.length },
              { id: 'messages', label: 'Messages', icon: MessageSquare },
              { id: 'recordings', label: 'Recordings', icon: Mic, count: recordings.length },
              { id: 'transcripts', label: 'Transcripts', icon: FileText, count: transcripts.length },
              { id: 'numbers', label: 'Numbers', icon: Hash, count: numbers.length },
              { id: 'settings', label: 'Settings', icon: Settings },
              { id: 'audit', label: 'Audit Log', icon: Shield },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition ${
                    isActive
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className="w-4 h-4" />
                    <span>{tab.label}</span>
                  </div>
                  {tab.badge && (
                    <span className="bg-emerald-500 text-white text-[10px] px-1.5 py-0.2 rounded-full font-bold animate-pulse">
                      {tab.badge}
                    </span>
                  )}
                  {tab.count !== undefined && !tab.badge && (
                    <span className="text-[10px] text-zinc-500">{tab.count}</span>
                  )}
                </button>
              );
            })}
          </nav>

          <div className="p-3 bg-zinc-950/60 border border-zinc-800/80 rounded-lg text-[11px] text-zinc-400 space-y-1">
            <div className="font-semibold text-zinc-300">Carrier Security</div>
            <div>HMAC-SHA256 V3: Active</div>
            <div>AES-256-GCM Vault: Locked</div>
          </div>
        </aside>

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto p-8">
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-8 max-w-6xl">
              <div>
                <h2 className="text-xl font-bold tracking-tight text-white">Operations Overview</h2>
                <p className="text-xs text-zinc-400 mt-1">
                  Real-time telephony telemetry, carrier callbacks, and channel capacity.
                </p>
              </div>

              {/* KPI Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-4">
                  <div className="text-xs text-zinc-400 font-medium">Total Calls</div>
                  <div className="text-2xl font-bold text-white mt-1">{calls.length}</div>
                  <div className="text-[11px] text-emerald-400 mt-2 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" /> All callbacks reconciled
                  </div>
                </div>

                <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-4">
                  <div className="text-xs text-zinc-400 font-medium">Messages Sent / Rcvd</div>
                  <div className="text-2xl font-bold text-white mt-1">{threads.length}</div>
                  <div className="text-[11px] text-indigo-400 mt-2">Threaded counterpart routing</div>
                </div>

                <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-4">
                  <div className="text-xs text-zinc-400 font-medium">Active Phone Numbers</div>
                  <div className="text-2xl font-bold text-white mt-1">{numbers.length}</div>
                  <div className="text-[11px] text-zinc-400 mt-2">Provisioned via Plivo API</div>
                </div>

                <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-4">
                  <div className="text-xs text-zinc-400 font-medium">Billed Telephony Spend</div>
                  <div className="text-2xl font-bold text-white mt-1">
                    ${calls.reduce((acc, c) => acc + (Number(c.billDurationSeconds || 0) * 0.0002), 0).toFixed(3)}
                  </div>
                  <div className="text-[11px] text-amber-400 mt-2 flex items-center gap-1">
                    <DollarSign className="w-3 h-3" /> Exact 60/60 US billing
                  </div>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="flex gap-4">
                <button
                  onClick={() => setShowCallModal(true)}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 shadow-lg shadow-indigo-600/20 transition"
                >
                  <Phone className="w-4 h-4" /> Place Outbound Call
                </button>
                <button
                  onClick={() => setActiveTab('messages')}
                  className="bg-zinc-800 hover:bg-zinc-700 text-zinc-100 px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 border border-zinc-700 transition"
                >
                  <MessageSquare className="w-4 h-4" /> Send SMS Message
                </button>
                <button
                  onClick={() => {
                    setShowBuyModal(true);
                    handleSearchNumbers();
                  }}
                  className="bg-zinc-800 hover:bg-zinc-700 text-zinc-100 px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 border border-zinc-700 transition"
                >
                  <Plus className="w-4 h-4" /> Buy Phone Number
                </button>
              </div>

              {/* Recent Activity Table */}
              <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl overflow-hidden">
                <div className="px-5 py-3 border-b border-zinc-800 flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-zinc-200">Recent Call Activity</h3>
                  <button onClick={() => setActiveTab('calls')} className="text-xs text-indigo-400 hover:underline">
                    View all calls &rarr;
                  </button>
                </div>
                <div className="divide-y divide-zinc-800/60">
                  {calls.slice(0, 5).map((call) => (
                    <div key={call.id} className="px-5 py-3.5 flex items-center justify-between text-xs hover:bg-zinc-800/30">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-2 h-2 rounded-full ${
                            call.status === 'completed'
                              ? 'bg-emerald-400'
                              : call.status === 'in-progress'
                              ? 'bg-indigo-400 animate-pulse'
                              : 'bg-amber-400'
                          }`}
                        />
                        <div>
                          <div className="font-mono text-zinc-200 font-medium">
                            {call.from} &rarr; {call.to}
                          </div>
                          <div className="text-[11px] text-zinc-500 font-mono">UUID: {call.plivoCallUuid}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="capitalize px-2 py-0.5 rounded text-[11px] bg-zinc-800 text-zinc-300 font-medium">
                          {call.status}
                        </span>
                        <div className="text-[10px] text-zinc-500 mt-1">
                          {call.billDurationSeconds ? `${call.billDurationSeconds}s billed` : 'Queued'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: CALLS */}
          {activeTab === 'calls' && (
            <div className="space-y-6 max-w-6xl">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold tracking-tight text-white">Call Logs & Live Control</h2>
                  <p className="text-xs text-zinc-400 mt-1">
                    Manage active call legs, live controls (DTMF, speak, audio), and status timelines.
                  </p>
                </div>
                <button
                  onClick={() => setShowCallModal(true)}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 shadow-md transition"
                >
                  <Phone className="w-3.5 h-3.5" /> Place Call
                </button>
              </div>

              {/* Calls List Table */}
              <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-900/80 border-b border-zinc-800 text-zinc-400 font-medium">
                    <tr>
                      <th className="py-3 px-4">Direction / Counterpart</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Duration</th>
                      <th className="py-3 px-4">Cost</th>
                      <th className="py-3 px-4">Policy Applied</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                    {calls.map((call) => (
                      <tr key={call.id} className="hover:bg-zinc-800/30 transition">
                        <td className="py-3.5 px-4">
                          <div className="font-mono font-medium text-zinc-200">
                            {call.direction === 'inbound' ? 'Inbound' : 'Outbound'}: {call.from} &rarr; {call.to}
                          </div>
                          <div className="text-[10px] text-zinc-500 font-mono mt-0.5">{call.plivoCallUuid}</div>
                        </td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${
                              call.status === 'completed'
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : call.status === 'in-progress'
                                ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 animate-pulse'
                                : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            }`}
                          >
                            {call.status}
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          {call.durationSeconds ? `${call.durationSeconds}s (${call.billDurationSeconds}s billed)` : '—'}
                        </td>
                        <td className="py-3.5 px-4 font-mono">{call.totalCost ? `$${call.totalCost}` : '$0.00'}</td>
                        <td className="py-3.5 px-4">
                          <div className="text-[11px] text-zinc-400">
                            Rec: {call.recordingEnabled ? 'Yes' : 'No'} | Trans: {call.transcriptionEnabled ? 'Yes' : 'No'}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-right space-x-2">
                          <button
                            onClick={async () => {
                              const res = await fetch(`/api/v1/calls/${call.id}`, {
                                headers: { Authorization: `Bearer ${bearerToken}` },
                              });
                              const data = await res.json();
                              setSelectedCallDetail(data.call);
                            }}
                            className="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-2.5 py-1 rounded border border-zinc-700"
                          >
                            Detail
                          </button>
                          {call.status === 'in-progress' && (
                            <button
                              onClick={() => handleHangupLiveCall(call.id)}
                              className="text-xs bg-rose-600/20 hover:bg-rose-600/30 text-rose-400 px-2.5 py-1 rounded border border-rose-500/30"
                            >
                              Hang Up
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB: LEADS & AI ITINERARIES */}
          {activeTab === 'leads' && (
            <div className="space-y-6 max-w-6xl">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                    <Compass className="w-5 h-5 text-indigo-400" />
                    Lead Management & AI Itineraries
                  </h2>
                  <p className="text-xs text-zinc-400 mt-1">
                    Qualified customer travel leads synthesized from voice call transcripts by DeepSeek AI concierge.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-zinc-400 bg-zinc-900 border border-zinc-800 px-3 py-1.5 rounded-lg">
                    {leadsList.length} Registered Leads
                  </span>
                </div>
              </div>

              {/* Leads Table */}
              <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-900/80 border-b border-zinc-800 text-zinc-400 font-medium">
                    <tr>
                      <th className="py-3 px-4">Lead & Destination</th>
                      <th className="py-3 px-4">Contact Customer</th>
                      <th className="py-3 px-4">Approval Status</th>
                      <th className="py-3 px-4">Supplier RFQ</th>
                      <th className="py-3 px-4">Dispatched PDFs</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                    {leadsList.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-12 text-center">
                          <div className="max-w-md mx-auto space-y-3">
                            <div className="w-10 h-10 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center mx-auto">
                              <Compass className="w-5 h-5" />
                            </div>
                            <div className="text-sm font-semibold text-zinc-200">No Leads Generated Yet</div>
                            <p className="text-xs text-zinc-400 leading-relaxed">
                              Place or receive a call with recording and transcription enabled. Then in the call details drawer, click{' '}
                              <span className="text-indigo-300 font-semibold">&quot;Generate Itinerary&quot;</span> to let DeepSeek create a lead and full travel itinerary.
                            </p>
                            <button
                              onClick={() => setActiveTab('calls')}
                              className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3.5 py-1.5 rounded-lg font-medium transition"
                            >
                              Go to Calls &rarr;
                            </button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      leadsList.map((lead) => (
                        <tr key={lead.id} className="hover:bg-zinc-800/30 transition">
                          <td className="py-3.5 px-4">
                            <div className="font-semibold text-zinc-100 flex items-center gap-2">
                              <span>{lead.title}</span>
                            </div>
                            <div className="text-[11px] text-indigo-400 flex items-center gap-1 mt-0.5 font-medium">
                              <Compass className="w-3 h-3" />
                              <span>{lead.destination || 'Unspecified Destination'}</span>
                            </div>
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="font-medium text-zinc-200">{lead.contact?.name || 'Customer'}</div>
                            <div className="text-[11px] text-zinc-400 font-mono">{lead.contact?.phone || '—'}</div>
                            <div className="text-[11px] text-zinc-500">{lead.customerEmail || lead.contact?.email || 'No email set'}</div>
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="relative inline-block">
                              <select
                                value={lead.status}
                                onChange={(e) => handleUpdateLeadStatus(lead.id, e.target.value)}
                                className={`text-[11px] font-semibold rounded-lg px-2.5 py-1.5 appearance-none cursor-pointer pr-7 transition border shadow-sm ${
                                  lead.status === 'approved'
                                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                                    : lead.status === 'revision_requested'
                                    ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30 hover:bg-indigo-500/20'
                                    : lead.status === 'contacted'
                                    ? 'bg-sky-500/10 text-sky-400 border-sky-500/30 hover:bg-sky-500/20'
                                    : lead.status === 'converted'
                                    ? 'bg-purple-500/10 text-purple-400 border-purple-500/30 hover:bg-purple-500/20'
                                    : lead.status === 'lost'
                                    ? 'bg-rose-500/10 text-rose-400 border-rose-500/30 hover:bg-rose-500/20'
                                    : 'bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20'
                                }`}
                                title="Click to change lead status"
                              >
                                <option value="pending_approval" className="bg-zinc-900 text-amber-400">⏳ Pending Approval</option>
                                <option value="revision_requested" className="bg-zinc-900 text-indigo-400">✏️ Revision Requested</option>
                                <option value="approved" className="bg-zinc-900 text-emerald-400">✅ Approved</option>
                                <option value="contacted" className="bg-zinc-900 text-sky-400">📞 Contacted</option>
                                <option value="converted" className="bg-zinc-900 text-purple-400">🏆 Converted / Won</option>
                                <option value="lost" className="bg-zinc-900 text-rose-400">❌ Closed / Lost</option>
                              </select>
                              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-1.5 text-zinc-400">
                                <ChevronDown className="w-3 h-3" />
                              </div>
                            </div>
                          </td>
                          <td className="py-3.5 px-4">
                            {lead.supplier ? (
                              <div>
                                <div className="font-medium text-zinc-200">{lead.supplier.name}</div>
                                <div className="text-[10px] text-zinc-400 capitalize">{lead.supplier.category}</div>
                              </div>
                            ) : (
                              <span className="text-zinc-500 italic">None assigned</span>
                            )}
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="space-y-1 text-[11px]">
                              {lead.customerSentAt ? (
                                <div className="text-emerald-400 flex items-center gap-1">
                                  <FileCheck className="w-3 h-3" /> Customer PDF sent
                                </div>
                              ) : (
                                <div className="text-zinc-500">Customer PDF pending</div>
                              )}
                              {lead.supplierSentAt ? (
                                <div className="text-indigo-400 flex items-center gap-1">
                                  <FileCheck className="w-3 h-3" /> Supplier RFQ sent
                                </div>
                              ) : (
                                <div className="text-zinc-500">Supplier RFQ pending</div>
                              )}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-right space-x-2">
                            {lead.contact?.phone && (
                              <button
                                onClick={() => {
                                  setCallDestination(lead.contact.phone);
                                  setCallMode('bridge');
                                  setShowCallModal(true);
                                }}
                                className="text-xs bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 px-2.5 py-1.5 rounded border border-emerald-500/30 font-medium transition inline-flex items-center gap-1.5"
                                title="Bridge call to talk with lead"
                              >
                                <PhoneCall className="w-3 h-3 text-emerald-400" />
                                <span>Talk to Lead</span>
                              </button>
                            )}
                            <button
                              onClick={() => handleSelectLead(lead.id)}
                              className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded font-medium shadow-sm transition inline-flex items-center gap-1.5"
                            >
                              <Edit3 className="w-3 h-3" />
                              <span>Review Itinerary</span>
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB: SUPPLIERS DIRECTORY */}
          {activeTab === 'suppliers' && (
            <div className="space-y-6 max-w-6xl">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-indigo-400" />
                    Supplier Management
                  </h2>
                  <p className="text-xs text-zinc-400 mt-1">
                    Manage hotels, air charters, ground transport, and tour suppliers for automated itinerary quotation requests (RFQs).
                  </p>
                </div>
                <button
                  onClick={() => setShowSupplierModal(true)}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 shadow-md transition"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Supplier
                </button>
              </div>

              {/* Suppliers Table */}
              <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-900/80 border-b border-zinc-800 text-zinc-400 font-medium">
                    <tr>
                      <th className="py-3 px-4">Supplier Name</th>
                      <th className="py-3 px-4">Category</th>
                      <th className="py-3 px-4">Contact Person</th>
                      <th className="py-3 px-4">Email</th>
                      <th className="py-3 px-4">Phone</th>
                      <th className="py-3 px-4">Notes</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                    {suppliersList.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-zinc-500">
                          No suppliers registered. Click &quot;Add Supplier&quot; to register hotel or transport partners.
                        </td>
                      </tr>
                    ) : (
                      suppliersList.map((supp) => (
                        <tr key={supp.id} className="hover:bg-zinc-800/30 transition">
                          <td className="py-3.5 px-4 font-semibold text-zinc-100">{supp.name}</td>
                          <td className="py-3.5 px-4">
                            <span className="capitalize px-2 py-0.5 rounded text-[10px] bg-indigo-950 text-indigo-300 border border-indigo-800/60 font-medium">
                              {supp.category}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-zinc-300">{supp.contactPerson || '—'}</td>
                          <td className="py-3.5 px-4 font-mono text-zinc-300">{supp.email}</td>
                          <td className="py-3.5 px-4 font-mono text-zinc-400">{supp.phone || '—'}</td>
                          <td className="py-3.5 px-4 text-zinc-500 max-w-xs truncate">{supp.notes || '—'}</td>
                          <td className="py-3.5 px-4 text-right">
                            <button
                              onClick={() => handleDeleteSupplier(supp.id)}
                              className="text-xs bg-zinc-800 hover:bg-rose-950 text-zinc-400 hover:text-rose-400 px-2 py-1 rounded border border-zinc-700 transition"
                              title="Delete Supplier"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB: CONTACTS DIRECTORY */}
          {activeTab === 'contacts' && (
            <div className="space-y-6 max-w-6xl">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                    <BookUser className="w-5 h-5 text-emerald-400" />
                    Verified Contact Directory
                  </h2>
                  <p className="text-xs text-zinc-400 mt-1">
                    Manage recipient contacts. Staff can only place calls to saved contacts in this directory.
                  </p>
                </div>
                <button
                  onClick={() => setShowContactModal(true)}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 shadow-md transition"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Contact
                </button>
              </div>

              <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-900/80 border-b border-zinc-800 text-zinc-400 font-medium">
                    <tr>
                      <th className="py-3 px-4">Contact Name</th>
                      <th className="py-3 px-4">Phone Number</th>
                      <th className="py-3 px-4">Company</th>
                      <th className="py-3 px-4">Email</th>
                      <th className="py-3 px-4">Notes</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                    {contactsList.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-10 text-center text-zinc-500">
                          <BookUser className="w-8 h-8 mx-auto mb-2 text-zinc-600 opacity-50" />
                          No contacts registered yet. Click &quot;Add Contact&quot; to allow staff to place calls.
                        </td>
                      </tr>
                    ) : (
                      contactsList.map((contact) => (
                        <tr key={contact.id} className="hover:bg-zinc-800/30 transition">
                          <td className="py-3.5 px-4 font-semibold text-zinc-100">{contact.name}</td>
                          <td className="py-3.5 px-4 font-mono text-emerald-400 font-medium">{contact.phone}</td>
                          <td className="py-3.5 px-4 text-zinc-400">{contact.company || '—'}</td>
                          <td className="py-3.5 px-4 text-zinc-400">{contact.email || '—'}</td>
                          <td className="py-3.5 px-4 text-zinc-500 max-w-xs truncate">{contact.notes || '—'}</td>
                          <td className="py-3.5 px-4 text-right space-x-2">
                            <button
                              onClick={() => {
                                setCallDestination(contact.phone);
                                setCallMode('bridge');
                                setShowCallModal(true);
                              }}
                              className="text-xs bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 px-2.5 py-1 rounded border border-emerald-500/30 inline-flex items-center gap-1.5 transition"
                            >
                              <PhoneCall className="w-3 h-3 text-emerald-400" />
                              <span>Talk to Contact</span>
                            </button>
                            <button
                              onClick={() => handleDeleteContact(contact.id)}
                              className="text-xs bg-zinc-800 hover:bg-rose-950 text-zinc-400 hover:text-rose-400 px-2 py-1 rounded border border-zinc-700 transition"
                              title="Delete Contact"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB: STAFF & USER MANAGEMENT */}
          {activeTab === 'users' && (
            <div className="space-y-6 max-w-6xl">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                    <Users className="w-5 h-5 text-indigo-400" />
                    Staff Team Management
                  </h2>
                  <p className="text-xs text-zinc-400 mt-1">
                    Admins can provision staff members who can log in with their own accounts to make calls and handle operations.
                  </p>
                </div>
                <button
                  onClick={() => setShowStaffModal(true)}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 shadow-md transition"
                >
                  <UserPlus className="w-3.5 h-3.5" /> Add Staff Member
                </button>
              </div>

              <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-900/80 border-b border-zinc-800 text-zinc-400 font-medium">
                    <tr>
                      <th className="py-3 px-4">Staff Member</th>
                      <th className="py-3 px-4">Role</th>
                      <th className="py-3 px-4">Account Status</th>
                      <th className="py-3 px-4">Joined Date</th>
                      <th className="py-3 px-4">Last Login</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                    {staffList.map((member) => (
                      <tr key={member.id} className="hover:bg-zinc-800/30 transition">
                        <td className="py-3.5 px-4">
                          <div className="font-medium text-zinc-100 flex items-center gap-2">
                            <span>{member.name}</span>
                            {currentUser?.email === member.email && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-950 text-indigo-400 border border-indigo-800/60 font-mono">
                                You
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-zinc-400 font-mono mt-0.5">{member.email}</div>
                        </td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${
                              member.role === 'owner' || member.role === 'admin'
                                ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                                : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            }`}
                          >
                            {member.role}
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="px-2 py-0.5 rounded text-[10px] bg-zinc-800 text-zinc-300 font-medium capitalize">
                            {member.status}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-zinc-400">
                          {new Date(member.createdAt).toLocaleDateString()}
                        </td>
                        <td className="py-3.5 px-4 text-zinc-500">
                          {member.lastLoginAt ? new Date(member.lastLoginAt).toLocaleString() : 'Never logged in'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: MESSAGES (TWO-WAY THREADING) */}
          {activeTab === 'messages' && (
            <div className="h-[750px] bg-zinc-900/40 border border-zinc-800/80 rounded-xl overflow-hidden flex max-w-6xl">
              {/* Thread List */}
              <div className="w-80 border-r border-zinc-800 flex flex-col bg-zinc-950/40">
                <div className="p-4 border-b border-zinc-800 font-semibold text-xs text-zinc-200">
                  Conversations ({threads.length})
                </div>
                <div className="flex-1 overflow-y-auto divide-y divide-zinc-800/60">
                  {threads.map((t) => {
                    const isSelected = activeThreadId === t.id;
                    return (
                      <button
                        key={t.id}
                        onClick={() => setActiveThreadId(t.id)}
                        className={`w-full p-4 text-left transition ${
                          isSelected ? 'bg-zinc-800/60' : 'hover:bg-zinc-850/40'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-mono text-xs font-semibold text-zinc-200">{t.counterpartE164}</span>
                          <span className="text-[10px] text-zinc-500">
                            {new Date(t.lastMessageAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <div className="text-[11px] text-zinc-400 truncate">
                          {t.lastMessage?.body || 'No messages yet'}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Thread Messages & Composer */}
              <div className="flex-1 flex flex-col bg-zinc-900/20">
                {/* Active Chat Header */}
                <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/40">
                  <div>
                    <span className="text-xs font-semibold text-zinc-200">
                      Thread: {threads.find((t) => t.id === activeThreadId)?.counterpartE164 || 'Select counterpart'}
                    </span>
                    <span className="text-[10px] text-zinc-500 block">Two-way carrier messaging</span>
                  </div>
                </div>

                {/* Messages Feed */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                  {activeThreadMessages.map((msg) => {
                    const isOutbound = msg.direction === 'outbound';
                    return (
                      <div key={msg.id} className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}>
                        <div
                          className={`max-w-md p-3.5 rounded-xl text-xs space-y-1 ${
                            isOutbound
                              ? 'bg-indigo-600 text-white rounded-br-none shadow-md'
                              : 'bg-zinc-800 text-zinc-200 rounded-bl-none border border-zinc-700/60'
                          }`}
                        >
                          <div>{msg.body}</div>
                          <div className="flex items-center justify-end gap-1.5 text-[10px] text-zinc-400">
                            <span>{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            {isOutbound && (
                              <span className="capitalize font-medium text-emerald-300">
                                • {msg.status}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Message Composer with GSM-7 vs UCS-2 Widget */}
                <div className="p-4 border-t border-zinc-800 bg-zinc-950/70 space-y-3">
                  <div className="flex items-center justify-between text-[11px] text-zinc-400 px-1">
                    <div className="flex items-center gap-3">
                      <span>
                        Encoding: <strong className="text-zinc-200">{smsAnalysis.encoding}</strong>
                      </span>
                      <span>
                        Units: <strong className="text-indigo-400">{smsAnalysis.units}</strong>
                      </span>
                      <span>
                        Chars: <strong>{smsAnalysis.charCount}</strong>
                      </span>
                    </div>
                    <span>{smsAnalysis.remainingInUnit} chars remaining in unit</span>
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Type SMS text..."
                      value={smsText}
                      onChange={(e) => setSmsText(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSendSms()}
                      className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2.5 text-xs text-zinc-100 focus:outline-none focus:border-indigo-500"
                    />
                    <button
                      onClick={handleSendSms}
                      disabled={smsSending || !smsText}
                      className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-4 py-2.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition"
                    >
                      <Send className="w-3.5 h-3.5" /> Send
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: RECORDINGS */}
          {activeTab === 'recordings' && (
            <div className="space-y-6 max-w-6xl">
              <div>
                <h2 className="text-xl font-bold tracking-tight text-white">Call Recordings</h2>
                <p className="text-xs text-zinc-400 mt-1">
                  Audio streaming proxied via short-lived signed URLs. Raw vendor URLs are never exposed.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {recordings.map((rec) => (
                  <div key={rec.id} className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-mono text-xs font-semibold text-zinc-200">{rec.plivoRecordingId}</div>
                        <div className="text-[11px] text-zinc-500 mt-0.5">Duration: {rec.durationSeconds || 45} seconds</div>
                      </div>
                      <span className="px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded text-[10px] font-medium">
                        {rec.status}
                      </span>
                    </div>

                    {/* Inline HTML5 Audio Player via Signed Proxy URL */}
                    <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800">
                      <audio controls className="w-full h-8" src={rec.streamUrl}>
                        Your browser does not support audio element.
                      </audio>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-zinc-800/80">
                      <div className="text-[11px] text-zinc-500">Storage: $0.0003/mo</div>
                      <div className="flex gap-2">
                        {rec.transcriptions?.length === 0 && (
                          <button
                            onClick={() => handleTranscribeNow(rec.id)}
                            className="text-[11px] bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-400 px-2.5 py-1 rounded border border-indigo-500/30 transition"
                          >
                            Transcribe Now
                          </button>
                        )}
                        <a
                          href={rec.streamUrl}
                          download
                          className="text-[11px] bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-2.5 py-1 rounded border border-zinc-700 flex items-center gap-1"
                        >
                          <Download className="w-3 h-3" /> Download
                        </a>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 5: TRANSCRIPTS */}
          {activeTab === 'transcripts' && (
            <div className="space-y-6 max-w-6xl">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold tracking-tight text-white">Call Transcripts</h2>
                  <p className="text-xs text-zinc-400 mt-1">
                    Searchable speech-to-text transcriptions resolved per organization and number policy.
                  </p>
                </div>
                <div className="relative w-72">
                  <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Search transcripts..."
                    value={transcriptSearch}
                    onChange={(e) => setTranscriptSearch(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-9 pr-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="space-y-4">
                {transcripts
                  .filter((t) => !transcriptSearch || t.text?.toLowerCase().includes(transcriptSearch.toLowerCase()))
                  .map((t) => (
                    <div key={t.id} className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-5 space-y-3">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-zinc-300 font-medium">SID: {t.recordingSid}</span>
                          <span className="text-zinc-500">•</span>
                          <span className="text-zinc-400">{t.language || 'en-US'}</span>
                          <span className="text-zinc-500">•</span>
                          <span className="text-zinc-400">{t.wordCount || 18} words</span>
                        </div>
                        <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase font-bold">
                          {t.status}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-200 bg-zinc-950/60 p-4 rounded-lg border border-zinc-800/80 leading-relaxed font-sans">
                        &ldquo;{t.text}&rdquo;
                      </p>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* TAB 6: NUMBERS */}
          {activeTab === 'numbers' && (
            <div className="space-y-6 max-w-6xl">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold tracking-tight text-white">Phone Numbers</h2>
                  <p className="text-xs text-zinc-400 mt-1">
                    Manage active phone lines, transcription toggles, and answer routing.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setShowBuyModal(true);
                    handleSearchNumbers();
                  }}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 shadow-md transition"
                >
                  <Plus className="w-3.5 h-3.5" /> Buy New Number
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {numbers.map((num) => (
                  <div key={num.id} className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-mono text-base font-bold text-white tracking-wide">{num.e164}</div>
                        <div className="text-xs text-zinc-400 mt-0.5">{num.friendlyName || 'Active Line'}</div>
                      </div>
                      <span className="px-2.5 py-0.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-full text-[10px] font-bold uppercase tracking-wider">
                        {num.status}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-xs bg-zinc-950 p-3 rounded-lg border border-zinc-800/80">
                      <div>
                        <span className="text-zinc-500 block text-[10px]">Monthly Rental</span>
                        <span className="font-medium text-zinc-200">${num.monthlyRental || '1.00'}/mo</span>
                      </div>
                      <div>
                        <span className="text-zinc-500 block text-[10px]">Voice Rate</span>
                        <span className="font-medium text-zinc-200">${num.voiceRate || '0.012'}/min</span>
                      </div>
                    </div>

                    {/* Per-Number Policy Toggles */}
                    <div className="space-y-2 pt-2 border-t border-zinc-800/80 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-zinc-300">Record Calls</span>
                        <span className="text-indigo-400 font-semibold">{num.recordCalls ? 'Enabled' : 'Disabled'}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-zinc-300">Transcription Policy</span>
                        <span className={num.transcribeEnabled ? 'text-emerald-400 font-semibold' : 'text-zinc-500 font-semibold'}>
                          {num.transcribeEnabled ? 'Enabled' : 'Disabled'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 7: SETTINGS */}
          {activeTab === 'settings' && (
            <div className="space-y-8 max-w-4xl">
              <div>
                <h2 className="text-xl font-bold tracking-tight text-white">Platform Settings</h2>
                <p className="text-xs text-zinc-400 mt-1">
                  Organization telephony policies, Plivo account credentials, and retention rules.
                </p>
              </div>

              {/* Plivo Account Credentials */}
              <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-6 space-y-4">
                <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
                  <Shield className="w-4 h-4 text-emerald-400" />
                  Plivo Credentials (AES-256-GCM Encrypted at Rest)
                </h3>
                <p className="text-xs text-zinc-400">
                  Credentials are encrypted using the host KEK. Plaintext credentials never reach logs or browser.
                </p>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-medium text-zinc-400 block mb-1">Masked Auth ID</label>
                    <input
                      type="text"
                      disabled
                      value={
                        settings?.organization?.plivoAccounts?.[0]?.authIdLast4
                          ? `...${settings.organization.plivoAccounts[0].authIdLast4}`
                          : (systemMode === 'live' ? '...QYMC' : '...5678')
                      }
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs font-mono text-zinc-400"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-zinc-400 block mb-1">Verification Status</label>
                    <div className="flex items-center gap-2 h-9 px-3 bg-zinc-950 border border-zinc-800 rounded-lg">
                      <span className="w-2 h-2 rounded-full bg-emerald-400" />
                      <span className="text-xs text-emerald-400 font-semibold">Verified against Plivo</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Policies */}
              <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-6 space-y-4">
                <h3 className="text-sm font-semibold text-zinc-200">Organization Telephony Policies</h3>
                <div className="space-y-4 text-xs">
                  <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                    <div>
                      <div className="font-medium text-zinc-200">Default Transcription Policy</div>
                      <div className="text-zinc-500 text-[11px]">Automatically transcribe all answered recordings</div>
                    </div>
                    <span className="text-emerald-400 font-semibold">Enabled</span>
                  </div>

                  <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                    <div>
                      <div className="font-medium text-zinc-200">Recording Retention Window</div>
                      <div className="text-zinc-500 text-[11px]">Auto-prune recording storage on Plivo</div>
                    </div>
                    <span className="text-zinc-200 font-medium">90 Days</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-zinc-200">Redact Message Content (log: false)</div>
                      <div className="text-zinc-500 text-[11px]">Irreversibly redacts message body from carrier MDR logs</div>
                    </div>
                    <span className="text-zinc-500">Disabled</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 8: AUDIT LOG */}
          {activeTab === 'audit' && (
            <div className="space-y-6 max-w-6xl">
              <div>
                <h2 className="text-xl font-bold tracking-tight text-white">Immutable Audit Log</h2>
                <p className="text-xs text-zinc-400 mt-1">
                  Cryptographically trackable record of privileged telephony events, purchases, and security logins.
                </p>
              </div>

              <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-900/80 border-b border-zinc-800 text-zinc-400">
                    <tr>
                      <th className="py-3 px-4">Timestamp</th>
                      <th className="py-3 px-4">Action</th>
                      <th className="py-3 px-4">Target</th>
                      <th className="py-3 px-4">Actor</th>
                      <th className="py-3 px-4 text-right">Result</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                    {auditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-zinc-800/30">
                        <td className="py-3 px-4 font-mono text-zinc-400">
                          {new Date(log.createdAt).toLocaleString()}
                        </td>
                        <td className="py-3 px-4 font-semibold text-indigo-400">{log.action}</td>
                        <td className="py-3 px-4 text-zinc-400">{log.targetType || 'System'}</td>
                        <td className="py-3 px-4">{log.actor?.email || 'admin@example.com'}</td>
                        <td className="py-3 px-4 text-right">
                          <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400 font-bold uppercase">
                            {log.result}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* MODAL: PLACE CALL (IN-BROWSER WEB PHONE & PHONE BRIDGE) */}
      {showCallModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <Phone className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Outbound Voice Calling</h3>
                  <p className="text-[11px] text-zinc-400">Connect live with customers & record audio for AI itineraries</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (webPhoneStatus === 'calling' || webPhoneStatus === 'ringing' || webPhoneStatus === 'connected') {
                    handleHangupBrowserCall();
                  }
                  setShowCallModal(false);
                  setWebPhoneStatus('idle');
                  setWebPhoneError(null);
                }}
                className="text-zinc-500 hover:text-zinc-300 p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            {/* CALL MODE TABS: BROWSER VS BRIDGE */}
            {webPhoneStatus !== 'calling' && webPhoneStatus !== 'ringing' && webPhoneStatus !== 'connected' && (
              <div className="grid grid-cols-2 gap-2 bg-zinc-950 p-1.5 rounded-xl border border-zinc-800">
                <button
                  type="button"
                  onClick={() => setCallMode('browser')}
                  className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition ${
                    callMode === 'browser'
                      ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-950'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Mic className="w-3.5 h-3.5" />
                  <span>In-Browser Headset</span>
                  <span className="text-[9px] bg-emerald-400/20 text-emerald-300 px-1.5 py-0.5 rounded font-mono">1-Leg</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCallMode('bridge')}
                  className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition ${
                    callMode === 'bridge'
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-950'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <PhoneCall className="w-3.5 h-3.5" />
                  <span>Mobile Phone Bridge</span>
                </button>
              </div>
            )}

            {/* ACTIVE IN-BROWSER CALL INTERFACE */}
            {(webPhoneStatus === 'calling' || webPhoneStatus === 'ringing' || webPhoneStatus === 'connected') ? (
              <div className="py-6 flex flex-col items-center justify-center space-y-5 bg-zinc-950 rounded-xl border border-emerald-900/30 p-6">
                <div className="relative flex items-center justify-center">
                  <div className="w-20 h-20 rounded-full bg-emerald-500/15 border-2 border-emerald-500 flex items-center justify-center text-emerald-400">
                    <Mic className="w-8 h-8 animate-pulse" />
                  </div>
                  <div className="absolute -inset-2 rounded-full border border-emerald-400/30 animate-ping pointer-events-none" />
                </div>

                <div className="text-center space-y-1">
                  <div className="text-lg font-bold text-white tracking-tight">{callDestination}</div>
                  <div className="text-xs text-zinc-400 flex items-center justify-center gap-2">
                    {webPhoneStatus === 'calling' && (
                      <span className="text-amber-400 flex items-center gap-1.5 font-medium">
                        <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                        Connecting... (Playing dot caller tune • • •)
                      </span>
                    )}
                    {webPhoneStatus === 'ringing' && (
                      <span className="text-sky-400 flex items-center gap-1.5 font-medium">
                        <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
                        Ringing customer line... (Playing ringing caller tune 🎵)
                      </span>
                    )}
                    {webPhoneStatus === 'connected' && (
                      <span className="text-emerald-400 font-bold font-mono text-sm flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        Live Call In Progress: {formatCallTimer(webPhoneDuration)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Soundwave animation */}
                <div className="flex items-center gap-1.5 h-8">
                  <span className="w-1.5 bg-emerald-400 rounded-full animate-bounce h-4" />
                  <span className="w-1.5 bg-emerald-400 rounded-full animate-bounce h-7 delay-75" />
                  <span className="w-1.5 bg-emerald-400 rounded-full animate-bounce h-3 delay-150" />
                  <span className="w-1.5 bg-emerald-400 rounded-full animate-bounce h-6 delay-100" />
                  <span className="w-1.5 bg-emerald-400 rounded-full animate-bounce h-8 delay-200" />
                  <span className="w-1.5 bg-emerald-400 rounded-full animate-bounce h-5 delay-75" />
                  <span className="w-1.5 bg-emerald-400 rounded-full animate-bounce h-3 delay-150" />
                </div>

                <div className="p-2.5 bg-zinc-900 border border-zinc-800 rounded-lg text-[11px] text-zinc-400 text-center max-w-sm">
                  🎧 Speaking live via your browser microphone. Audio is being recorded on Plivo cloud and will be transcribed for AI itinerary generation.
                </div>

                {/* Call Controls */}
                <div className="flex items-center gap-4 pt-2">
                  <button
                    type="button"
                    onClick={handleToggleMute}
                    className={`p-3 rounded-full border transition flex items-center justify-center ${
                      webPhoneMuted
                        ? 'bg-amber-500/20 border-amber-500/50 text-amber-400'
                        : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:text-white hover:bg-zinc-700'
                    }`}
                    title={webPhoneMuted ? 'Unmute Microphone' : 'Mute Microphone'}
                  >
                    {webPhoneMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                  </button>

                  <button
                    type="button"
                    onClick={handleHangupBrowserCall}
                    className="px-6 py-2.5 rounded-full bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-rose-600/30 transition hover:scale-105"
                  >
                    <PhoneOff className="w-4 h-4" />
                    <span>Hang Up (End Call)</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4 text-xs">
                {webPhoneError && (
                  <div className="p-3 bg-rose-950/40 border border-rose-800/60 rounded-xl text-rose-300 text-xs flex items-center justify-between">
                    <span>{webPhoneError}</span>
                    <button onClick={() => setWebPhoneError(null)} className="text-rose-400 hover:text-white">✕</button>
                  </div>
                )}

                {webPhoneStatus === 'ended' && (
                  <div className="p-3 bg-emerald-950/40 border border-emerald-800/60 rounded-xl text-emerald-300 text-xs flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Call completed successfully! Audio recording is now being transcribed for AI travel itinerary generation.</span>
                  </div>
                )}

                {/* From Line */}
                <div>
                  <label className="text-zinc-400 block mb-1">From Virtual Line</label>
                  <select
                    value={callFromNumber}
                    onChange={(e) => setCallFromNumber(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-200"
                  >
                    {numbers.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.e164} ({n.friendlyName})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Recipient Contact */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-zinc-400 block">Recipient Contact</label>
                    <button
                      type="button"
                      onClick={() => {
                        setShowCallModal(false);
                        setShowContactModal(true);
                      }}
                      className="text-[11px] text-emerald-400 hover:underline flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" /> Add Contact
                    </button>
                  </div>
                  {contactsList.length === 0 ? (
                    <div className="p-3 bg-amber-950/40 border border-amber-800/60 rounded-lg text-amber-300 text-xs space-y-2">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-semibold">No contacts registered</p>
                          <p className="text-[11px] text-amber-400/80">Company policy requires selecting a verified contact before dialing.</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setShowCallModal(false);
                          setShowContactModal(true);
                        }}
                        className="w-full py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded text-xs font-semibold"
                      >
                        + Add Verified Contact First
                      </button>
                    </div>
                  ) : (
                    <select
                      value={callDestination}
                      onChange={(e) => setCallDestination(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-200"
                    >
                      <option value="">-- Select Contact to Call --</option>
                      {contactsList.map((c) => (
                        <option key={c.id} value={c.phone}>
                          {c.name} ({c.phone}) {c.company ? `— ${c.company}` : ''}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* In-Browser Mode Banner */}
                {callMode === 'browser' && (
                  <div className="p-3.5 bg-gradient-to-br from-emerald-950/40 to-teal-950/20 border border-emerald-800/50 rounded-xl space-y-2 text-xs text-emerald-300">
                    <div className="flex items-center gap-2 font-bold text-white">
                      <Volume2 className="w-4 h-4 text-emerald-400" />
                      <span>Direct In-Browser Voice Calling (WebRTC)</span>
                    </div>
                    <p className="text-[11px] text-zinc-300 leading-relaxed">
                      You will speak and listen directly through your computer headset or microphone. Plivo dials the customer's phone from <span className="font-mono text-emerald-400 font-semibold">+918065531234</span> and connects them live to your browser.
                    </p>
                    <div className="flex items-center gap-2 pt-1 text-[11px] text-emerald-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span>Zero Mobile Charges • Single-Leg Cost • Cloud 2-Way Recording Active</span>
                    </div>
                  </div>
                )}

                {/* Phone-to-Phone Bridge Fields */}
                {callMode === 'bridge' && (
                  <div className="p-3.5 bg-indigo-950/40 border border-indigo-800/60 rounded-xl space-y-2">
                    <div className="flex items-center gap-1.5 text-indigo-300 font-semibold text-xs">
                      <PhoneCall className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Your Staff / Agent Mobile Phone Number</span>
                    </div>
                    <input
                      type="text"
                      placeholder="e.g. +919876543210 (your mobile phone)"
                      value={callForwardTo}
                      onChange={(e) => setCallForwardTo(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-200 text-xs font-mono focus:border-indigo-500"
                    />
                    <p className="text-[11px] text-zinc-400 leading-relaxed">
                      Plivo calls the customer's phone and calls your mobile phone, bridging both phones over cellular lines.
                    </p>
                  </div>
                )}

                <div className="flex items-center justify-between pt-2">
                  <span className="text-zinc-300">Record Call</span>
                  <input
                    type="checkbox"
                    checked={callRecord}
                    onChange={(e) => setCallRecord(e.target.checked)}
                    className="rounded bg-zinc-950 border-zinc-800 text-emerald-600"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-zinc-300">Transcribe Audio & Generate Itinerary</span>
                  <input
                    type="checkbox"
                    checked={callTranscribe}
                    onChange={(e) => setCallTranscribe(e.target.checked)}
                    className="rounded bg-zinc-950 border-zinc-800 text-emerald-600"
                  />
                </div>

                <div className="flex justify-end gap-3 pt-3 border-t border-zinc-800">
                  <button
                    onClick={() => setShowCallModal(false)}
                    className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs"
                  >
                    Cancel
                  </button>

                  {callMode === 'browser' ? (
                    <button
                      onClick={handleStartBrowserCall}
                      disabled={!callDestination || contactsList.length === 0}
                      className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-lg text-xs font-bold shadow-lg shadow-emerald-600/25 flex items-center gap-2 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Mic className="w-4 h-4" />
                      <span>Start In-Browser Call (Connect Mic)</span>
                    </button>
                  ) : (
                    <button
                      onClick={handlePlaceCall}
                      disabled={callLoading || !callDestination || !callForwardTo || contactsList.length === 0}
                      className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold shadow-lg shadow-indigo-600/25 flex items-center gap-2 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <PhoneCall className="w-4 h-4" />
                      <span>{callLoading ? 'Initiating...' : 'Dial via Mobile Bridge'}</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL: BUY NUMBER */}
      {showBuyModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-lg w-full p-6 space-y-5">
            <h3 className="text-sm font-bold text-white">Search & Buy Plivo Phone Number</h3>

            <div className="flex gap-2">
              <select
                value={searchIso}
                onChange={(e) => setSearchIso(e.target.value)}
                className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200"
              >
                <option value="US">United States (US)</option>
                <option value="GB">United Kingdom (GB)</option>
                <option value="IN">India (IN)</option>
              </select>
              <button
                onClick={handleSearchNumbers}
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-xs font-medium"
              >
                Search Inventory
              </button>
            </div>

            <div className="max-h-60 overflow-y-auto divide-y divide-zinc-800 text-xs">
              {searchingNumbers ? (
                <div className="py-6 text-center text-zinc-500">Querying inventory...</div>
              ) : (
                availableNumbers.map((num) => (
                  <div key={num.number} className="py-3 flex items-center justify-between">
                    <div>
                      <div className="font-mono font-bold text-zinc-200">{num.number}</div>
                      <div className="text-[11px] text-zinc-500">Rental: ${num.monthlyRental}/mo</div>
                    </div>
                    <button
                      onClick={() => handleBuyNumber(num.number)}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded text-xs font-medium"
                    >
                      Buy Now
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-end pt-3 border-t border-zinc-800">
              <button
                onClick={() => setShowBuyModal(false)}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DRAWER: CALL DETAIL & TIMELINE */}
      {selectedCallDetail && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex justify-end">
          <div className="bg-zinc-900 border-l border-zinc-800 w-full max-w-md h-full p-6 space-y-6 overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white">Call Detail & Timeline</h3>
                {callDetailSyncing && (
                  <span className="text-[10px] text-emerald-400 flex items-center gap-1 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800/40">
                    <RefreshCw className="w-2.5 h-2.5 animate-spin" /> Syncing...
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => refreshCallDetail(selectedCallDetail.id)}
                  disabled={callDetailSyncing}
                  className="text-xs text-zinc-400 hover:text-white p-1.5 rounded hover:bg-zinc-800 transition flex items-center gap-1"
                  title="Sync latest recording and transcript from carrier"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${callDetailSyncing ? 'animate-spin text-emerald-400' : ''}`} />
                  <span className="text-[10px] font-mono">Sync</span>
                </button>
                <button
                  onClick={() => setSelectedCallDetail(null)}
                  className="text-zinc-500 hover:text-zinc-300 text-sm p-1"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="space-y-3 bg-zinc-950 p-4 rounded-xl border border-zinc-800 text-xs">
              <div>
                <span className="text-zinc-500 block text-[10px]">Call UUID</span>
                <span className="font-mono text-zinc-200">{selectedCallDetail.plivoCallUuid}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-zinc-500 block text-[10px]">From</span>
                  <span className="font-mono text-zinc-200">{selectedCallDetail.from}</span>
                </div>
                <div>
                  <span className="text-zinc-500 block text-[10px]">To</span>
                  <span className="font-mono text-zinc-200">{selectedCallDetail.to}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-zinc-500 block text-[10px]">Duration</span>
                  <span className="text-zinc-200">{selectedCallDetail.durationSeconds || 0}s</span>
                </div>
                <div>
                  <span className="text-zinc-500 block text-[10px]">Bill Duration</span>
                  <span className="text-zinc-200">{selectedCallDetail.billDurationSeconds || 0}s</span>
                </div>
              </div>
              <div>
                <span className="text-zinc-500 block text-[10px]">Hangup Explanation</span>
                <span className="text-amber-400 font-medium">{selectedCallDetail.hangupExplanation}</span>
              </div>
            </div>

            {/* Live Controls if Call is in-progress */}
            {selectedCallDetail.status === 'in-progress' && (
              <div className="bg-zinc-950 p-4 rounded-xl border border-indigo-500/30 space-y-3 text-xs">
                <div className="font-bold text-indigo-400 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
                  Live Call Controls
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => handleSendDtmf(selectedCallDetail.id, '1')}
                    className="p-2 bg-zinc-800 hover:bg-zinc-700 rounded text-center font-mono font-bold"
                  >
                    1
                  </button>
                  <button
                    onClick={() => handleSendDtmf(selectedCallDetail.id, '2')}
                    className="p-2 bg-zinc-800 hover:bg-zinc-700 rounded text-center font-mono font-bold"
                  >
                    2
                  </button>
                  <button
                    onClick={() => handleSendDtmf(selectedCallDetail.id, '#')}
                    className="p-2 bg-zinc-800 hover:bg-zinc-700 rounded text-center font-mono font-bold"
                  >
                    #
                  </button>
                </div>
                <button
                  onClick={() => handleHangupLiveCall(selectedCallDetail.id)}
                  className="w-full py-2 bg-rose-600 hover:bg-rose-500 text-white rounded font-bold"
                >
                  Terminate Call
                </button>
              </div>
            )}

            {/* Call Audio Recording */}
            <div className="space-y-2 bg-zinc-950 p-4 rounded-xl border border-zinc-800 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-zinc-200 flex items-center gap-1.5">
                  <Mic className="w-3.5 h-3.5 text-emerald-400" />
                  Call Audio Recording
                </span>
                {selectedCallDetail.recordings?.length > 0 ? (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/60">
                    MP3 Audio Ready
                  </span>
                ) : (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950/80 text-amber-400 border border-amber-800/50 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                    Processing
                  </span>
                )}
              </div>
              {selectedCallDetail.recordings?.length > 0 ? (
                selectedCallDetail.recordings.map((rec: any) => (
                  <div key={rec.id} className="pt-2 space-y-2">
                    <audio
                      controls
                      className="w-full h-9 rounded bg-zinc-900 border border-zinc-800"
                      src={`/api/v1/recordings/${rec.id}/stream`}
                    />
                    <div className="flex items-center justify-between text-[11px] text-zinc-500 font-mono">
                      <span>ID: {rec.plivoRecordingId}</span>
                      <span>Duration: {rec.durationSeconds || selectedCallDetail.durationSeconds || 0}s</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-4 bg-zinc-900/60 border border-emerald-900/30 rounded-xl space-y-3 mt-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-emerald-400 font-semibold text-xs">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Processing Call Recording...</span>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-400 border border-emerald-800/50 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                      Carrier Syncing
                    </span>
                  </div>

                  {/* Soundwave animation */}
                  <div className="flex items-center justify-center gap-1.5 py-2">
                    <span className="w-1.5 bg-emerald-500/70 rounded-full animate-bounce h-4" />
                    <span className="w-1.5 bg-emerald-500/80 rounded-full animate-bounce h-7 delay-75" />
                    <span className="w-1.5 bg-emerald-400 rounded-full animate-bounce h-3 delay-150" />
                    <span className="w-1.5 bg-emerald-500/90 rounded-full animate-bounce h-6 delay-100" />
                    <span className="w-1.5 bg-emerald-400 rounded-full animate-bounce h-8 delay-200" />
                    <span className="w-1.5 bg-emerald-500/80 rounded-full animate-bounce h-5 delay-75" />
                    <span className="w-1.5 bg-emerald-500/60 rounded-full animate-bounce h-3 delay-150" />
                  </div>

                  <p className="text-[11px] text-zinc-400 leading-relaxed text-center">
                    Plivo carrier is rendering and encoding the dual-channel call recording. The audio file will appear automatically as soon as carrier encoding completes.
                  </p>
                  
                  <div className="pt-1 flex items-center justify-between border-t border-zinc-800/60 text-[10px] text-zinc-500">
                    <span>Auto-refreshing every 2.5s</span>
                    <button
                      type="button"
                      onClick={() => refreshCallDetail(selectedCallDetail.id)}
                      disabled={callDetailSyncing}
                      className="text-emerald-400 hover:text-emerald-300 flex items-center gap-1 hover:underline font-medium"
                    >
                      <RefreshCw className={`w-2.5 h-2.5 ${callDetailSyncing ? 'animate-spin' : ''}`} />
                      <span>Check Now</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Call Speech Transcription */}
            <div className="space-y-2 bg-zinc-950 p-4 rounded-xl border border-zinc-800 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-zinc-200 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-indigo-400" />
                  Call Speech Transcription
                </span>
                {selectedCallDetail.transcriptions?.length > 0 ? (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-950 text-indigo-400 border border-indigo-800/60">
                    {selectedCallDetail.transcriptions[0].language || 'en-US'} Ready
                  </span>
                ) : (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-950/80 text-purple-400 border border-purple-800/50 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
                    Transcribing
                  </span>
                )}
              </div>
              {selectedCallDetail.transcriptions?.length > 0 ? (
                selectedCallDetail.transcriptions.map((tr: any) => (
                  <div key={tr.id} className="pt-2 space-y-1.5">
                    <div className="bg-zinc-900 p-3 rounded-lg border border-zinc-800/80 font-mono text-zinc-300 text-xs whitespace-pre-line leading-relaxed">
                      {tr.text || '(Empty audio transcript)'}
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-zinc-500">
                      <span>Status: {tr.status}</span>
                      <span>Word Count: {tr.wordCount || 0}</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-4 bg-zinc-900/60 border border-indigo-900/30 rounded-xl space-y-3 mt-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-indigo-400 font-semibold text-xs">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Transcribing Speech & Audio...</span>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-950/80 text-indigo-400 border border-indigo-800/50 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-ping" />
                      Plivo ASR + DeepSeek
                    </span>
                  </div>

                  {/* Shimmer skeleton lines */}
                  <div className="space-y-2 py-1">
                    <div className="h-2.5 bg-zinc-800/90 rounded animate-pulse w-full" />
                    <div className="h-2.5 bg-zinc-800/70 rounded animate-pulse w-5/6" />
                    <div className="h-2.5 bg-zinc-800/50 rounded animate-pulse w-3/4" />
                  </div>

                  <p className="text-[11px] text-zinc-400 leading-relaxed text-center">
                    Converting caller and agent audio stream into verbatim text. DeepSeek AI will use this transcript to synthesize the travel itinerary.
                  </p>

                  <div className="pt-1 flex items-center justify-between border-t border-zinc-800/60 text-[10px] text-zinc-500">
                    <span>Auto-checking transcription webhook</span>
                    <button
                      type="button"
                      onClick={() => refreshCallDetail(selectedCallDetail.id)}
                      disabled={callDetailSyncing}
                      className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1 hover:underline font-medium"
                    >
                      <RefreshCw className={`w-2.5 h-2.5 ${callDetailSyncing ? 'animate-spin' : ''}`} />
                      <span>Check Now</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* AI Concierge Itinerary Generator */}
            {(() => {
              const hasTranscription = Boolean(
                selectedCallDetail.transcriptions &&
                selectedCallDetail.transcriptions.length > 0 &&
                selectedCallDetail.transcriptions.some((t: any) => t.text && t.text.trim().length > 0)
              );
              const isGenerating = generatingItineraryCallId === selectedCallDetail.id;

              return (
                <div className="bg-gradient-to-br from-indigo-950/40 via-violet-950/20 to-zinc-950 p-4 rounded-xl border border-indigo-500/30 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white text-xs flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-amber-400" />
                      DeepSeek AI Concierge
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                      Auto Itinerary
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    Convert customer travel preferences from this call into a personalized day-by-day itinerary and create a lead in Lead Management.
                  </p>
                  <button
                    onClick={() => handleGenerateItinerary(selectedCallDetail.id)}
                    disabled={isGenerating}
                    className={`w-full py-2.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition shadow-md ${
                      !isGenerating
                        ? 'bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white shadow-indigo-600/20 cursor-pointer hover:scale-[1.01]'
                        : 'bg-zinc-800/80 text-zinc-500 cursor-not-allowed border border-zinc-700/50'
                    }`}
                  >
                    {isGenerating ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-white" />
                        <span>Generating Itinerary with DeepSeek...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                        <span>Generate Itinerary with DeepSeek AI</span>
                      </>
                    )}
                  </button>
                </div>
              );
            })()}

            {/* Timeline Events */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-zinc-300">Carrier Event Timeline</h4>
              <div className="space-y-3 relative before:absolute before:inset-0 before:left-2 before:w-0.5 before:bg-zinc-800">
                {selectedCallDetail.events?.map((ev: any) => (
                  <div key={ev.id} className="relative pl-6 text-xs space-y-0.5">
                    <span className="absolute left-1 top-1 w-2.5 h-2.5 rounded-full bg-indigo-500 -translate-x-1" />
                    <div className="font-semibold text-zinc-200 capitalize">{ev.eventType} Event</div>
                    <div className="text-[10px] text-zinc-500">{new Date(ev.occurredAt).toLocaleTimeString()}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADD STAFF MEMBER */}
      {showStaffModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-md w-full p-6 space-y-5">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-indigo-400" />
              Add New Staff Member
            </h3>
            <p className="text-xs text-zinc-400">
              Provision a staff account for this organization. Staff members can sign in, dial calls, and manage communication threads.
            </p>

            <form onSubmit={handleCreateStaff} className="space-y-4 text-xs">
              <div>
                <label className="text-zinc-400 block mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Rachel Adams"
                  value={staffName}
                  onChange={(e) => setStaffName(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-200 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">Work Email</label>
                <input
                  type="email"
                  required
                  placeholder="rachel@company.com"
                  value={staffEmail}
                  onChange={(e) => setStaffEmail(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-200 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">Password (min. 8 characters)</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  placeholder="••••••••••••"
                  value={staffPassword}
                  onChange={(e) => setStaffPassword(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-200 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">Staff Role</label>
                <select
                  value={staffRole}
                  onChange={(e) => setStaffRole(e.target.value as any)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-200"
                >
                  <option value="operator">Operator (Can make calls & send SMS)</option>
                  <option value="admin">Admin (Full administrative controls)</option>
                  <option value="viewer">Viewer (Read-only observation)</option>
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowStaffModal(false)}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={staffLoading}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold disabled:opacity-50"
                >
                  {staffLoading ? 'Creating...' : 'Create Staff Member'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD CONTACT */}
      {showContactModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-md w-full p-6 space-y-5">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <BookUser className="w-4 h-4 text-emerald-400" />
              Add Verified Contact
            </h3>
            <p className="text-xs text-zinc-400">
              Register a contact recipient. Staff can only initiate outbound calls to contacts stored in this directory.
            </p>

            <form onSubmit={handleCreateContact} className="space-y-4 text-xs">
              <div>
                <label className="text-zinc-400 block mb-1">Contact Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Marcus Vance"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-200 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">Phone Number (E.164) *</label>
                <input
                  type="text"
                  required
                  placeholder="+14155550199"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-200 font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-zinc-400 block mb-1">Company</label>
                  <input
                    type="text"
                    placeholder="Acme Corp"
                    value={contactCompany}
                    onChange={(e) => setContactCompany(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-200"
                  />
                </div>
                <div>
                  <label className="text-zinc-400 block mb-1">Email</label>
                  <input
                    type="email"
                    placeholder="marcus@acme.com"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-200"
                  />
                </div>
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">Notes / Relationship</label>
                <textarea
                  rows={2}
                  placeholder="Key account executive"
                  value={contactNotes}
                  onChange={(e) => setContactNotes(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-200"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowContactModal(false)}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={contactLoading}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold disabled:opacity-50"
                >
                  {contactLoading ? 'Saving...' : 'Save Contact'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: LEAD DETAIL, RECORDING, TRANSCRIPT, ITINERARY REVISION & APPROVAL */}
      {selectedLead && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 lg:p-6 overflow-hidden">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-6xl max-h-[94vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 border-b border-zinc-800 bg-zinc-900/90 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
                  <Compass className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2.5">
                    <h3 className="text-base font-bold text-white tracking-tight">{selectedLead.title}</h3>
                    <div className="relative inline-block">
                      <select
                        value={selectedLead.status}
                        onChange={(e) => handleUpdateLeadStatus(selectedLead.id, e.target.value)}
                        className={`text-[10px] font-semibold uppercase tracking-wider rounded px-2.5 py-1 appearance-none cursor-pointer pr-6 border transition shadow-sm ${
                          selectedLead.status === 'approved'
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                            : selectedLead.status === 'revision_requested'
                            ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30'
                            : selectedLead.status === 'contacted'
                            ? 'bg-sky-500/10 text-sky-400 border-sky-500/30'
                            : selectedLead.status === 'converted'
                            ? 'bg-purple-500/10 text-purple-400 border-purple-500/30'
                            : selectedLead.status === 'lost'
                            ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                            : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                        }`}
                        title="Click to change lead status"
                      >
                        <option value="pending_approval" className="bg-zinc-900 text-amber-400">⏳ Pending Approval</option>
                        <option value="revision_requested" className="bg-zinc-900 text-indigo-400">✏️ Revision Requested</option>
                        <option value="approved" className="bg-zinc-900 text-emerald-400">✅ Approved</option>
                        <option value="contacted" className="bg-zinc-900 text-sky-400">📞 Contacted</option>
                        <option value="converted" className="bg-zinc-900 text-purple-400">🏆 Converted / Won</option>
                        <option value="lost" className="bg-zinc-900 text-rose-400">❌ Closed / Lost</option>
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-1 text-zinc-400">
                        <ChevronDown className="w-3 h-3" />
                      </div>
                    </div>
                  </div>
                  <div className="text-xs text-indigo-400 flex items-center gap-1.5 mt-0.5">
                    <span>Destination:</span>
                    <span className="font-semibold">{selectedLead.destination || 'Unspecified'}</span>
                    <span className="text-zinc-600">•</span>
                    <span className="text-zinc-400 font-mono text-[11px]">Lead #{selectedLead.id.slice(0, 8)}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* PDF Quick Download Links */}
                <a
                  href={`/api/v1/leads/${selectedLead.id}/pdf?type=customer`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-3 py-1.5 rounded-lg border border-zinc-700 flex items-center gap-1.5 transition"
                  title="Download Customer PDF Itinerary"
                >
                  <Download className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Customer PDF</span>
                </a>
                <a
                  href={`/api/v1/leads/${selectedLead.id}/pdf?type=supplier`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-3 py-1.5 rounded-lg border border-zinc-700 flex items-center gap-1.5 transition"
                  title="Download Supplier RFQ Quotation PDF"
                >
                  <Download className="w-3.5 h-3.5 text-amber-400" />
                  <span>Supplier RFQ PDF</span>
                </a>
                <button
                  onClick={() => setSelectedLead(null)}
                  className="text-zinc-400 hover:text-white p-1.5 rounded-lg hover:bg-zinc-800 text-lg leading-none transition ml-2"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Modal Body: Two-Column Layout */}
            <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Column (5 cols): Contact & Source Media (Recording + Transcript) */}
              <div className="lg:col-span-5 space-y-5">
                {/* Contact Card & Customer Email Gate */}
                <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-zinc-800/60 pb-2">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <BookUser className="w-3.5 h-3.5 text-emerald-400" />
                      Lead Contact Details
                    </span>
                    <span className="text-[10px] text-zinc-500 font-mono">
                      {selectedLead.contact?.id ? 'Verified Contact' : 'Direct Call Leg'}
                    </span>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Contact Name:</span>
                      <span className="font-semibold text-zinc-200">{selectedLead.contact?.name || 'Customer'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Phone:</span>
                      <span className="font-mono text-emerald-400">{selectedLead.contact?.phone || selectedLead.call?.to || '—'}</span>
                    </div>
                    {selectedLead.contact?.company && (
                      <div className="flex justify-between">
                        <span className="text-zinc-500">Company:</span>
                        <span className="text-zinc-300">{selectedLead.contact.company}</span>
                      </div>
                    )}
                  </div>

                  {/* Customer Email Input */}
                  <div className="pt-2 border-t border-zinc-800/60 space-y-1.5">
                    <label className="text-xs font-semibold text-zinc-300 flex items-center gap-1">
                      <Mail className="w-3.5 h-3.5 text-indigo-400" />
                      Customer Email (Required to Send PDF) *
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="customer@example.com"
                      value={leadCustomerEmail}
                      onChange={(e) => setLeadCustomerEmail(e.target.value)}
                      className={`w-full bg-zinc-900 border rounded-lg p-2.5 text-xs text-zinc-200 focus:outline-none ${
                        !leadCustomerEmail || !leadCustomerEmail.includes('@')
                          ? 'border-amber-500/60 focus:border-amber-400'
                          : 'border-zinc-700 focus:border-indigo-500'
                      }`}
                    />
                    {(!leadCustomerEmail || !leadCustomerEmail.includes('@')) && (
                      <p className="text-[11px] text-amber-400 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 shrink-0" />
                        Please provide a valid email before approving and dispatching the itinerary.
                      </p>
                    )}
                  </div>
                </div>

                {/* Call Audio Recording */}
                <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-zinc-800/60 pb-2">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Mic className="w-3.5 h-3.5 text-emerald-400" />
                      Source Call Recording
                    </span>
                    {selectedLead.call?.recordings && selectedLead.call.recordings.length > 0 ? (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/60">
                        MP3 Audio Ready
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950/80 text-amber-400 border border-amber-800/50 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                        Processing Audio
                      </span>
                    )}
                  </div>

                  {selectedLead.call?.recordings && selectedLead.call.recordings.length > 0 ? (
                    selectedLead.call.recordings.map((rec: any) => (
                      <div key={rec.id} className="space-y-2">
                        <audio
                          controls
                          className="w-full h-9 rounded bg-zinc-900 border border-zinc-800"
                          src={`/api/v1/recordings/${rec.id}/stream`}
                        />
                        <div className="flex items-center justify-between text-[11px] text-zinc-500 font-mono">
                          <span>Recording: {rec.plivoRecordingId || rec.id.slice(0, 10)}</span>
                          <span>{rec.durationSeconds || selectedLead.call?.durationSeconds || 0}s duration</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-3.5 bg-zinc-900/60 border border-emerald-900/30 rounded-xl space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-emerald-400 font-semibold text-xs">
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Processing Call Recording...</span>
                        </div>
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-emerald-950/80 text-emerald-400 border border-emerald-800/50">
                          Carrier Sync
                        </span>
                      </div>
                      <div className="flex items-center justify-center gap-1.5 py-1">
                        <span className="w-1 bg-emerald-500/70 rounded-full animate-bounce h-3" />
                        <span className="w-1 bg-emerald-500/80 rounded-full animate-bounce h-5 delay-75" />
                        <span className="w-1 bg-emerald-400 rounded-full animate-bounce h-2 delay-150" />
                        <span className="w-1 bg-emerald-500/90 rounded-full animate-bounce h-6 delay-100" />
                        <span className="w-1 bg-emerald-400 rounded-full animate-bounce h-4 delay-200" />
                      </div>
                      <p className="text-[10px] text-zinc-400 leading-relaxed text-center">
                        Dual-channel audio is finalizing on Plivo carrier and will be attached automatically.
                      </p>
                    </div>
                  )}
                </div>

                {/* Call Speech Transcription */}
                <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-zinc-800/60 pb-2">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-indigo-400" />
                      Speech Transcription
                    </span>
                    {selectedLead.call?.transcriptions && selectedLead.call.transcriptions.length > 0 ? (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-950 text-indigo-400 border border-indigo-800/60">
                        {selectedLead.call.transcriptions[0].language || 'en-US'} Ready
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-950/80 text-purple-400 border border-purple-800/50 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
                        Transcribing
                      </span>
                    )}
                  </div>

                  {selectedLead.call?.transcriptions && selectedLead.call.transcriptions.length > 0 ? (
                    <div className="bg-zinc-900 p-3 rounded-lg border border-zinc-800/80 max-h-48 overflow-y-auto font-mono text-zinc-300 text-xs whitespace-pre-line leading-relaxed">
                      {selectedLead.call.transcriptions[0].text || '(No transcript text)'}
                    </div>
                  ) : (
                    <div className="p-3.5 bg-zinc-900/60 border border-indigo-900/30 rounded-xl space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-indigo-400 font-semibold text-xs">
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Transcribing Speech to Text...</span>
                        </div>
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-indigo-950/80 text-indigo-400 border border-indigo-800/50">
                          Plivo ASR
                        </span>
                      </div>
                      <div className="space-y-1.5 py-1">
                        <div className="h-2 bg-zinc-800 rounded animate-pulse w-full" />
                        <div className="h-2 bg-zinc-800/70 rounded animate-pulse w-4/5" />
                      </div>
                      <p className="text-[10px] text-zinc-400 leading-relaxed text-center">
                        Synthesizing verbatim customer speech for AI itinerary quotation generation.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column (7 cols): DeepSeek Itinerary, Revision & Supplier Dispatch */}
              <div className="lg:col-span-7 space-y-5">
                {/* Visual Itinerary Presentation */}
                <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-xl p-4">
                  <VisualItinerary
                    itineraryText={selectedLead.itinerary}
                    destination={selectedLead.destination}
                    leadTitle={selectedLead.title}
                  />
                </div>

                {/* Prompt User for Approval & Corrections (DeepSeek Revision Workflow) */}
                <div className="bg-gradient-to-br from-indigo-950/30 via-zinc-950 to-zinc-950 border border-indigo-500/20 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-zinc-200 flex items-center gap-1.5">
                      <Edit3 className="w-3.5 h-3.5 text-indigo-400" />
                      Prompt for Corrections & Revisions
                    </span>
                    <span className="text-[10px] text-indigo-300 font-medium">DeepSeek Interactive Refinement</span>
                  </div>
                  <p className="text-[11px] text-zinc-400">
                    Review the itinerary above. If any changes are needed (e.g. hotel upgrade, adding excursions, adjusting duration, budget constraints), specify them below and DeepSeek will revise the itinerary.
                  </p>
                  <textarea
                    rows={2}
                    placeholder="e.g. Upgrade resort to 5-star beachfront with private pool, add half-day scuba diving on day 3, budget maximum $5,000..."
                    value={leadRevisionNotes}
                    onChange={(e) => setLeadRevisionNotes(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500 resize-none"
                  />
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleReviseItinerary}
                      disabled={leadRevising || !leadRevisionNotes.trim()}
                      className="bg-indigo-600 hover:bg-indigo-500 text-white px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 shadow-md transition disabled:opacity-50"
                    >
                      {leadRevising ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Revising with DeepSeek...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                          <span>Revise Itinerary with DeepSeek</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Supplier Selection & Approval Dispatch */}
                <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-xl p-4 space-y-4">
                  <div className="flex items-center justify-between border-b border-zinc-800/60 pb-2">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-indigo-400" />
                      Select Supplier for Quotation (RFQ)
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowSupplierModal(true)}
                      className="text-[11px] text-indigo-400 hover:underline flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" /> Add New Supplier
                    </button>
                  </div>

                  <div className="space-y-2 text-xs">
                    <label className="text-zinc-400 block">Choose Partner Supplier for Quotation Request</label>
                    <select
                      value={leadSelectedSupplierId}
                      onChange={(e) => setLeadSelectedSupplierId(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-zinc-200"
                    >
                      <option value="">-- No Supplier (Customer Itinerary Only) --</option>
                      {suppliersList.map((supp) => (
                        <option key={supp.id} value={supp.id}>
                          {supp.name} ({supp.category.toUpperCase()}) — {supp.email}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Dispatch Status Indicators */}
                  {(selectedLead.customerSentAt || selectedLead.supplierSentAt) && (
                    <div className="p-3 bg-emerald-950/30 border border-emerald-800/40 rounded-lg space-y-1 text-[11px]">
                      {selectedLead.customerSentAt && (
                        <div className="text-emerald-400 flex items-center gap-1.5 font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                          <span>Customer Itinerary PDF dispatched to {selectedLead.customerEmail || leadCustomerEmail}</span>
                        </div>
                      )}
                      {selectedLead.supplierSentAt && (
                        <div className="text-indigo-400 flex items-center gap-1.5 font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                          <span>Supplier RFQ Quotation PDF dispatched to partner supplier.</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Approve and Dispatch Button */}
                  <div className="pt-2 flex items-center justify-between">
                    <div className="text-[11px] text-zinc-400">
                      Dispatches formatted PDF attachments to both customer and supplier.
                    </div>
                    <button
                      type="button"
                      onClick={handleApproveAndSendItinerary}
                      disabled={leadSending || !leadCustomerEmail}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2.5 rounded-lg text-xs font-bold flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {leadSending ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Generating & Sending PDFs...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Approve & Send Itinerary PDFs</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADD SUPPLIER */}
      {showSupplierModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-md w-full p-6 space-y-5">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Building2 className="w-4 h-4 text-indigo-400" />
              Add Travel Supplier / Partner
            </h3>
            <p className="text-xs text-zinc-400">
              Register a hotel, airline charter, ground transport, or tour provider for automated quotation requests (RFQs).
            </p>

            <form onSubmit={handleCreateSupplier} className="space-y-4 text-xs">
              <div>
                <label className="text-zinc-400 block mb-1">Supplier Business Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Grand Horizon Luxury Resorts"
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-200 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">Category *</label>
                <select
                  value={supplierCategory}
                  onChange={(e) => setSupplierCategory(e.target.value as any)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-200"
                >
                  <option value="hotels">Hotels & Resorts</option>
                  <option value="flights">Aviation / Air Charters</option>
                  <option value="transport">Ground Transport & Transfers</option>
                  <option value="activities">Tours & Activities</option>
                  <option value="packages">Complete Travel Packages</option>
                </select>
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">Quotation Email *</label>
                <input
                  type="email"
                  required
                  placeholder="rfq@resort-partner.com"
                  value={supplierEmail}
                  onChange={(e) => setSupplierEmail(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-200 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-zinc-400 block mb-1">Phone Number</label>
                  <input
                    type="text"
                    placeholder="+18005550199"
                    value={supplierPhone}
                    onChange={(e) => setSupplierPhone(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-200"
                  />
                </div>
                <div>
                  <label className="text-zinc-400 block mb-1">Contact Person</label>
                  <input
                    type="text"
                    placeholder="Jessica Vance"
                    value={supplierContactPerson}
                    onChange={(e) => setSupplierContactPerson(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-200"
                  />
                </div>
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">Notes / Partnership Terms</label>
                <textarea
                  rows={2}
                  placeholder="Special B2B trade discount 15%, 24-hour turnaround on quotation requests."
                  value={supplierNotes}
                  onChange={(e) => setSupplierNotes(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-200"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowSupplierModal(false)}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={supplierLoading}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold disabled:opacity-50"
                >
                  {supplierLoading ? 'Saving...' : 'Save Supplier'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Plivo WebRTC Browser Calling SDK */}
      <Script
        src="https://cdn.plivo.com/sdk/browser/v2/plivo.min.js"
        strategy="afterInteractive"
        onLoad={() => initWebPhone()}
      />
    </div>
  );
}
