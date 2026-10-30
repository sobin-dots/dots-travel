'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  Shield,
  Phone,
  Mic,
  Brain,
  Webhook,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Copy,
  Check,
  Eye,
  EyeOff,
  Sparkles,
  Radio,
  Loader2,
  ExternalLink,
  Building2,
  Upload,
  Image as ImageIcon,
  FileText,
  Globe,
  MapPin,
  Trash2,
  Palette,
} from 'lucide-react';
import { useConsole } from '@/context/ConsoleContext';

type SettingsTab = 'organization' | 'telephony' | 'transcription' | 'intelligence' | 'webhooks' | 'policies';

const PRESET_BRAND_COLORS = [
  { name: 'Crimson Red (LGT)', hex: '#ed1b24' },
  { name: 'Royal Indigo', hex: '#4f46e5' },
  { name: 'Emerald Green', hex: '#059669' },
  { name: 'Deep Navy', hex: '#1e3a8a' },
  { name: 'Warm Amber', hex: '#d97706' },
  { name: 'Vibrant Rose', hex: '#e11d48' },
  { name: 'Ocean Teal', hex: '#0f766e' },
  { name: 'Slate Charcoal', hex: '#334155' },
  { name: 'Royal Violet', hex: '#7c3aed' },
  { name: 'Bespoke Bronze', hex: '#92400e' },
];

export default function SettingsPage() {
  const {
    currentOrg,
    bearerToken,
    settings,
    fetchData,
    integrationsSummary,
    fetchIntegrations,
  } = useConsole();

  const [activeTab, setActiveTab] = useState<SettingsTab>('organization');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // File upload input refs
  const logoInputRef = useRef<HTMLInputElement>(null);
  const letterheadInputRef = useRef<HTMLInputElement>(null);

  // Organization Details Form
  const [orgName, setOrgName] = useState('');
  const [orgAddress, setOrgAddress] = useState('');
  const [orgPhone, setOrgPhone] = useState('');
  const [orgWebsite, setOrgWebsite] = useState('');
  const [orgLogoUrl, setOrgLogoUrl] = useState('');
  const [orgLetterheadUrl, setOrgLetterheadUrl] = useState('');
  const [orgLetterheadText, setOrgLetterheadText] = useState('');
  const [orgBrandColor, setOrgBrandColor] = useState('#ed1b24');
  const [savingOrg, setSavingOrg] = useState(false);
  const [orgSaved, setOrgSaved] = useState(false);
  const [orgError, setOrgError] = useState<string | null>(null);

  // Telephony primary provider
  const [primaryProvider, setPrimaryProvider] = useState<'plivo' | 'msg91'>('plivo');
  const [switchingProvider, setSwitchingProvider] = useState(false);

  // Plivo Form
  const [plivoAuthId, setPlivoAuthId] = useState('');
  const [plivoAuthToken, setPlivoAuthToken] = useState('');
  const [plivoCallerId, setPlivoCallerId] = useState('');
  const [showPlivoToken, setShowPlivoToken] = useState(false);
  const [savingPlivo, setSavingPlivo] = useState(false);
  const [plivoResult, setPlivoResult] = useState<{ success?: boolean; message?: string } | null>(null);

  // MSG91 Form
  const [msg91AuthKey, setMsg91AuthKey] = useState('');
  const [msg91SenderId, setMsg91SenderId] = useState('TRVAGT');
  const [msg91CallerId, setMsg91CallerId] = useState('');
  const [showMsg91Key, setShowMsg91Key] = useState(false);
  const [savingMsg91, setSavingMsg91] = useState(false);
  const [msg91Result, setMsg91Result] = useState<{ success?: boolean; message?: string } | null>(null);

  // OpenAI Form
  const [openAiApiKey, setOpenAiApiKey] = useState('');
  const [openAiModel, setOpenAiModel] = useState('gpt-4o-transcribe');
  const [openAiBaseUrl, setOpenAiBaseUrl] = useState('');
  const [showOpenAiKey, setShowOpenAiKey] = useState(false);
  const [savingOpenAi, setSavingOpenAi] = useState(false);
  const [openAiResult, setOpenAiResult] = useState<{ success?: boolean; message?: string } | null>(null);

  // DeepSeek Form
  const [deepseekApiKey, setDeepseekApiKey] = useState('');
  const [deepseekModel, setDeepseekModel] = useState('deepseek-flash');
  const [deepseekBaseUrl, setDeepseekBaseUrl] = useState('https://api.deepseek.com');
  const [showDeepseekKey, setShowDeepseekKey] = useState(false);
  const [savingDeepseek, setSavingDeepseek] = useState(false);
  const [deepseekResult, setDeepseekResult] = useState<{ success?: boolean; message?: string } | null>(null);

  // Policies Form
  const [transcriptionDefaultEnabled, setTranscriptionDefaultEnabled] = useState(true);
  const [transcriptionLanguage, setTranscriptionLanguage] = useState('en-US');
  const [recordingRetentionDays, setRecordingRetentionDays] = useState(90);
  const [redactMessageContent, setRedactMessageContent] = useState(false);
  const [savingPolicies, setSavingPolicies] = useState(false);
  const [policiesSaved, setPoliciesSaved] = useState(false);

  // Dynamic origin detection for live webhook URL resolution
  const [origin, setOrigin] = useState('');
  const [copiedAllPlivo, setCopiedAllPlivo] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setOrigin(window.location.origin);
    }
  }, []);

  const isMatchingOrgSummary = integrationsSummary?.organizationId === currentOrg?.id;

  const resolvedBase = (isMatchingOrgSummary && integrationsSummary?.webhookUrls?.voiceAnswer)
    ? integrationsSummary.webhookUrls.voiceAnswer.split('/api/v1/')[0]
    : origin || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');

  const orgQuery = currentOrg?.id ? `?orgId=${currentOrg.id}` : '';

  const plivoAnswerUrl =
    (isMatchingOrgSummary && integrationsSummary?.webhookUrls?.voiceAnswer) ||
    `${resolvedBase}/api/v1/webhooks/voice/answer${orgQuery}`;
  const plivoHangupUrl =
    (isMatchingOrgSummary && integrationsSummary?.webhookUrls?.voiceHangup) ||
    `${resolvedBase}/api/v1/webhooks/voice/hangup${orgQuery}`;
  const plivoFallbackAnswerUrl =
    (isMatchingOrgSummary && integrationsSummary?.webhookUrls?.voiceFallback) ||
    `${resolvedBase}/api/v1/webhooks/voice/fallback${orgQuery}`;
  const msg91VoiceUrl =
    (isMatchingOrgSummary && integrationsSummary?.webhookUrls?.msg91Voice) ||
    `${resolvedBase}/api/v1/webhooks/msg91/voice${orgQuery}`;
  const msg91SmsUrl =
    (isMatchingOrgSummary && integrationsSummary?.webhookUrls?.msg91Sms) ||
    `${resolvedBase}/api/v1/webhooks/msg91/sms${orgQuery}`;

  const handleCopyAllPlivo = () => {
    const text = `Plivo Application Webhook Settings:
Primary Answer URL (POST): ${plivoAnswerUrl}
Hangup URL (POST): ${plivoHangupUrl}
Fallback Answer URL (POST): ${plivoFallbackAnswerUrl}`;
    navigator.clipboard.writeText(text);
    setCopiedAllPlivo(true);
    setTimeout(() => setCopiedAllPlivo(false), 2500);
  };

  // Strictly isolate and synchronize all form states with the currently active organization
  useEffect(() => {
    // 0. Reset organization profile feedback
    setOrgSaved(false);
    setOrgError(null);

    // 1. Clear all result banners when organization changes
    setPlivoResult(null);
    setMsg91Result(null);
    setOpenAiResult(null);
    setDeepseekResult(null);
    setPoliciesSaved(false);

    // 2. Clear sensitive input tokens
    setPlivoAuthId('');
    setPlivoAuthToken('');
    setShowPlivoToken(false);
    setMsg91AuthKey('');
    setShowMsg91Key(false);
    setOpenAiApiKey('');
    setShowOpenAiKey(false);
    setDeepseekApiKey('');
    setShowDeepseekKey(false);

    // 3. Populate organization details
    const activeOrg = settings?.organization && settings.organization.id === currentOrg?.id
      ? settings.organization
      : currentOrg;

    if (activeOrg) {
      setOrgName(activeOrg.name || '');
      setOrgAddress(activeOrg.address || '');
      setOrgPhone(activeOrg.phone || '');
      setOrgWebsite(activeOrg.website || '');
      setOrgLogoUrl(activeOrg.logoUrl || '');
      setOrgLetterheadUrl(activeOrg.letterheadUrl || '');
      setOrgLetterheadText(activeOrg.letterheadText || '');
      setOrgBrandColor(activeOrg.brandColor || '#ed1b24');
    }

    // 4. Populate form fields from this specific organization's integration summary
    if (integrationsSummary && integrationsSummary.organizationId === currentOrg?.id) {
      if (integrationsSummary.primaryTelephonyProvider) {
        setPrimaryProvider(integrationsSummary.primaryTelephonyProvider);
      }

      const plivo = integrationsSummary.integrations?.find((i: any) => i.provider === 'plivo');
      setPlivoCallerId(plivo?.maskedDetails?.callerId || '');

      const msg91 = integrationsSummary.integrations?.find((i: any) => i.provider === 'msg91');
      setMsg91SenderId(msg91?.maskedDetails?.senderId || 'TRVAGT');
      setMsg91CallerId(msg91?.maskedDetails?.callerId || '');

      const openai = integrationsSummary.integrations?.find((i: any) => i.provider === 'openai');
      setOpenAiModel(openai?.metadata?.model || openai?.maskedDetails?.model || 'gpt-4o-transcribe');
      setOpenAiBaseUrl(openai?.metadata?.baseUrl || '');

      const deepseek = integrationsSummary.integrations?.find((i: any) => i.provider === 'deepseek');
      setDeepseekModel(deepseek?.metadata?.model || deepseek?.maskedDetails?.model || 'deepseek-flash');
      setDeepseekBaseUrl(deepseek?.metadata?.baseUrl || 'https://api.deepseek.com');
    } else {
      setPlivoCallerId('');
      setMsg91SenderId('TRVAGT');
      setMsg91CallerId('');
      setOpenAiModel('gpt-4o-transcribe');
      setOpenAiBaseUrl('');
      setDeepseekModel('deepseek-flash');
      setDeepseekBaseUrl('https://api.deepseek.com');
      setPrimaryProvider(currentOrg?.primaryTelephonyProvider || 'plivo');
    }

    // 5. Populate policies from settings for the active org
    if (settings?.organization && settings.organization.id === currentOrg?.id) {
      const org = settings.organization;
      setTranscriptionDefaultEnabled(org.transcriptionDefaultEnabled ?? true);
      setTranscriptionLanguage(org.transcriptionLanguage || 'en-US');
      setRecordingRetentionDays(org.recordingRetentionDays ?? 90);
      setRedactMessageContent(org.redactMessageContent ?? false);
    }
  }, [currentOrg?.id, integrationsSummary, settings]);

  const handleCopy = (text: string, keyName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(keyName);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  const getIntegrationByProvider = (providerName: string) => {
    if (integrationsSummary?.organizationId !== currentOrg?.id) return undefined;
    return integrationsSummary?.integrations?.find((i: any) => i.provider === providerName);
  };

  // Organization Logo & Letterhead file uploads
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setOrgError('Please select a valid image file (PNG, JPG, or WebP)');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setOrgError('Logo image file size must be less than 2MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setOrgLogoUrl(reader.result as string);
      setOrgError(null);
    };
    reader.readAsDataURL(file);
  };

  const handleLetterheadUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setOrgError('Please select a valid image file (PNG, JPG, or WebP)');
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      setOrgError('Letterhead image file size must be less than 3MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setOrgLetterheadUrl(reader.result as string);
      setOrgError(null);
    };
    reader.readAsDataURL(file);
  };

  // Save Organization Details & Letterhead
  const handleSaveOrganization = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgName.trim()) {
      setOrgError('Organization name is required');
      return;
    }

    setSavingOrg(true);
    setOrgSaved(false);
    setOrgError(null);

    try {
      const res = await fetch('/api/v1/settings', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${bearerToken}`,
        },
        body: JSON.stringify({
          organizationName: orgName.trim(),
          address: orgAddress.trim() || null,
          phone: orgPhone.trim() || null,
          website: orgWebsite.trim() || null,
          logoUrl: orgLogoUrl.trim() || null,
          letterheadUrl: orgLetterheadUrl.trim() || null,
          letterheadText: orgLetterheadText.trim() || null,
          brandColor: orgBrandColor.trim() || '#ed1b24',
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setOrgSaved(true);
        setTimeout(() => setOrgSaved(false), 4000);
        await fetchData();
      } else {
        setOrgError(data.error || 'Failed to update organization details');
      }
    } catch (err: any) {
      setOrgError(err.message || 'Error communicating with server');
    } finally {
      setSavingOrg(false);
    }
  };

  // Primary provider switch
  const handlePrimaryProviderChange = async (provider: 'plivo' | 'msg91') => {
    setPrimaryProvider(provider);
    setSwitchingProvider(true);
    try {
      const res = await fetch('/api/v1/settings/primary-provider', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${bearerToken}`,
        },
        body: JSON.stringify({ primaryProvider: provider }),
      });
      if (res.ok) {
        await fetchIntegrations();
        await fetchData();
      }
    } catch (err) {
      console.error('Failed to update primary provider:', err);
    } finally {
      setSwitchingProvider(false);
    }
  };

  // Save Plivo
  const handleSavePlivo = async (e: React.FormEvent) => {
    e.preventDefault();

    // Guard against browser password managers autofilling the user login email
    if (plivoAuthId && plivoAuthId.includes('@')) {
      setPlivoResult({
        success: false,
        message: `Invalid Auth ID: Browser autofilled "${plivoAuthId}". Plivo Auth ID is alphanumeric (e.g. MANWIZYJGZZJATNTBINY), not an email address.`,
      });
      return;
    }

    setSavingPlivo(true);
    setPlivoResult(null);

    try {
      const res = await fetch('/api/v1/settings/integrations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${bearerToken}`,
        },
        body: JSON.stringify({
          provider: 'plivo',
          category: 'telephony',
          credentials: {
            authId: plivoAuthId,
            authToken: plivoAuthToken,
            callerId: plivoCallerId,
          },
          label: 'Plivo Carrier Line',
        }),
      });

      const data = await res.json();
      setPlivoResult({
        success: data.verification?.valid,
        message: data.verification?.valid
          ? 'Plivo credentials successfully verified against carrier API!'
          : data.verification?.error || data.error || 'Verification failed',
      });

      if (data.verification?.valid) {
        setPlivoAuthId('');
        setPlivoAuthToken('');
        await fetchIntegrations();
        await fetchData();
      }
    } catch (err: any) {
      setPlivoResult({ success: false, message: err.message || 'Error saving Plivo credentials' });
    } finally {
      setSavingPlivo(false);
    }
  };

  // Save MSG91
  const handleSaveMsg91 = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingMsg91(true);
    setMsg91Result(null);

    try {
      const res = await fetch('/api/v1/settings/integrations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${bearerToken}`,
        },
        body: JSON.stringify({
          provider: 'msg91',
          category: 'telephony',
          credentials: {
            authKey: msg91AuthKey,
            senderId: msg91SenderId,
            callerId: msg91CallerId,
          },
          label: 'MSG91 Telephony & SMS',
        }),
      });

      const data = await res.json();
      setMsg91Result({
        success: data.verification?.valid,
        message: data.verification?.valid
          ? 'MSG91 Auth Key verified successfully!'
          : data.verification?.error || data.error || 'Verification failed',
      });

      if (data.verification?.valid) {
        setMsg91AuthKey('');
        await fetchIntegrations();
        await fetchData();
      }
    } catch (err: any) {
      setMsg91Result({ success: false, message: err.message || 'Error saving MSG91 credentials' });
    } finally {
      setSavingMsg91(false);
    }
  };

  // Save OpenAI
  const handleSaveOpenAi = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingOpenAi(true);
    setOpenAiResult(null);

    try {
      const res = await fetch('/api/v1/settings/integrations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${bearerToken}`,
        },
        body: JSON.stringify({
          provider: 'openai',
          category: 'transcription',
          credentials: {
            apiKey: openAiApiKey,
            baseUrl: openAiBaseUrl || undefined,
          },
          metadata: {
            model: openAiModel,
            baseUrl: openAiBaseUrl || undefined,
          },
          label: 'OpenAI Transcription',
        }),
      });

      const data = await res.json();
      setOpenAiResult({
        success: data.verification?.valid,
        message: data.verification?.valid
          ? 'OpenAI API key verified successfully! Models accessible.'
          : data.verification?.error || data.error || 'Verification failed',
      });

      if (data.verification?.valid) {
        setOpenAiApiKey('');
        await fetchIntegrations();
        await fetchData();
      }
    } catch (err: any) {
      setOpenAiResult({ success: false, message: err.message || 'Error saving OpenAI key' });
    } finally {
      setSavingOpenAi(false);
    }
  };

  // Save DeepSeek
  const handleSaveDeepseek = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingDeepseek(true);
    setDeepseekResult(null);

    try {
      const res = await fetch('/api/v1/settings/integrations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${bearerToken}`,
        },
        body: JSON.stringify({
          provider: 'deepseek',
          category: 'intelligence',
          credentials: {
            apiKey: deepseekApiKey,
            baseUrl: deepseekBaseUrl || 'https://api.deepseek.com',
          },
          metadata: {
            model: deepseekModel,
            baseUrl: deepseekBaseUrl || 'https://api.deepseek.com',
          },
          label: 'DeepSeek Travel Intelligence',
        }),
      });

      const data = await res.json();
      setDeepseekResult({
        success: data.verification?.valid,
        message: data.verification?.valid
          ? 'DeepSeek API connection verified successfully!'
          : data.verification?.error || data.error || 'Verification failed',
      });

      if (data.verification?.valid) {
        setDeepseekApiKey('');
        await fetchIntegrations();
        await fetchData();
      }
    } catch (err: any) {
      setDeepseekResult({ success: false, message: err.message || 'Error saving DeepSeek key' });
    } finally {
      setSavingDeepseek(false);
    }
  };

  // Save Policies
  const handleSavePolicies = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPolicies(true);
    setPoliciesSaved(false);

    try {
      const res = await fetch('/api/v1/settings', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${bearerToken}`,
        },
        body: JSON.stringify({
          transcriptionDefaultEnabled,
          transcriptionLanguage,
          recordingRetentionDays: Number(recordingRetentionDays),
          redactMessageContent,
        }),
      });

      if (res.ok) {
        setPoliciesSaved(true);
        setTimeout(() => setPoliciesSaved(false), 3000);
        await fetchData();
      }
    } catch (err) {
      console.error('Failed to update policies:', err);
    } finally {
      setSavingPolicies(false);
    }
  };

  const plivoInteg = getIntegrationByProvider('plivo');
  const msg91Integ = getIntegrationByProvider('msg91');
  const openaiInteg = getIntegrationByProvider('openai');
  const deepseekInteg = getIntegrationByProvider('deepseek');

  return (
    <div className="space-y-6 sm:space-y-8 max-w-5xl">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white">Platform & BYOK Settings</h2>
            <span className="text-[10px] font-semibold uppercase tracking-wider bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded-full">
              Multi-Tenant BYOK
            </span>
          </div>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1">
            Manage your organization&apos;s isolated 3rd party API keys, telephony carrier, and webhooks for{' '}
            <span className="text-white font-medium">{currentOrg?.name || 'this organization'}</span>.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="text-[11px] text-zinc-400 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 flex items-center gap-2">
            <span className="text-zinc-500">Org ID:</span>
            <span className="font-mono text-zinc-300 text-[10px]">{currentOrg?.id?.slice(0, 8)}...</span>
          </div>
        </div>
      </div>

      {/* Settings Navigation Tabs */}
      <div className="flex items-center gap-1.5 border-b border-zinc-800 pb-px overflow-x-auto text-xs">
        <button
          type="button"
          onClick={() => setActiveTab('organization')}
          className={`flex items-center gap-2 px-3.5 py-2.5 font-medium border-b-2 transition whitespace-nowrap cursor-pointer ${activeTab === 'organization'
            ? 'border-indigo-500 text-indigo-400'
            : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
        >
          <Building2 className="w-3.5 h-3.5" />
          <span>Organization & Letterhead</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('telephony')}
          className={`flex items-center gap-2 px-3.5 py-2.5 font-medium border-b-2 transition whitespace-nowrap cursor-pointer ${activeTab === 'telephony'
            ? 'border-indigo-500 text-indigo-400'
            : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
        >
          <Phone className="w-3.5 h-3.5" />
          <span>Telephony (Plivo / MSG91)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('transcription')}
          className={`flex items-center gap-2 px-3.5 py-2.5 font-medium border-b-2 transition whitespace-nowrap cursor-pointer ${activeTab === 'transcription'
            ? 'border-indigo-500 text-indigo-400'
            : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
        >
          <Mic className="w-3.5 h-3.5" />
          <span>Transcription (OpenAI)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('intelligence')}
          className={`flex items-center gap-2 px-3.5 py-2.5 font-medium border-b-2 transition whitespace-nowrap cursor-pointer ${activeTab === 'intelligence'
            ? 'border-indigo-500 text-indigo-400'
            : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
        >
          <Brain className="w-3.5 h-3.5" />
          <span>AI Concierge (DeepSeek)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('webhooks')}
          className={`flex items-center gap-2 px-3.5 py-2.5 font-medium border-b-2 transition whitespace-nowrap cursor-pointer ${activeTab === 'webhooks'
            ? 'border-indigo-500 text-indigo-400'
            : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
        >
          <Webhook className="w-3.5 h-3.5" />
          <span>Carrier Webhooks</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('policies')}
          className={`flex items-center gap-2 px-3.5 py-2.5 font-medium border-b-2 transition whitespace-nowrap cursor-pointer ${activeTab === 'policies'
            ? 'border-indigo-500 text-indigo-400'
            : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>Policies</span>
        </button>

        <Link
          href="/console/settings/itinerary-rules"
          className="flex items-center gap-2 px-3.5 py-2.5 font-medium border-b-2 border-transparent text-indigo-400 hover:text-indigo-300 hover:border-indigo-500/50 transition whitespace-nowrap cursor-pointer ml-auto"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Itinerary Rules (LLM Context)</span>
          <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-1.5 py-0.2 rounded-full font-bold border border-indigo-500/30">
            Open &rarr;
          </span>
        </Link>
      </div>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* TAB 0: ORGANIZATION PROFILE & ITINERARY LETTERHEAD */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeTab === 'organization' && (
        <div className="space-y-6">
          {/* Top Banner / Description */}
          <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-5 sm:p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-400 flex items-center justify-center text-white shadow-lg shadow-indigo-600/20">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                    <span>Organization Profile & Itinerary Letterhead</span>
                    <span className="text-[10px] font-semibold uppercase tracking-wider bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded-full">
                      Tenant Identity
                    </span>
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Configure your agency brand, contact details, official logo, and proposal letterhead. These details automatically populate all generated itinerary PDFs, quotation proposals, and supplier RFQs.
                  </p>
                </div>
              </div>

              {orgLogoUrl && (
                <div className="shrink-0 bg-zinc-950/70 border border-zinc-800 p-2 rounded-xl flex items-center gap-2">
                  <img
                    src={orgLogoUrl}
                    alt="Agency Logo"
                    className="h-8 max-w-[120px] object-contain rounded"
                  />
                  <span className="text-[10px] text-zinc-400 font-medium hidden md:inline">Active Logo</span>
                </div>
              )}
            </div>

            {/* Success Banner */}
            {orgSaved && (
              <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between animate-fadeIn">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Organization details and itinerary letterhead saved successfully!</span>
                </div>
                <button
                  type="button"
                  onClick={() => setOrgSaved(false)}
                  className="text-emerald-400 hover:text-emerald-200 text-xs ml-4"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* Error Banner */}
            {orgError && (
              <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between animate-fadeIn">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{orgError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setOrgError(null)}
                  className="text-rose-400 hover:text-rose-200 text-xs ml-4"
                >
                  Dismiss
                </button>
              </div>
            )}

            <form onSubmit={handleSaveOrganization} className="space-y-6 pt-2">
              {/* Card 1: Core Company Information */}
              <div className="bg-zinc-950/60 border border-zinc-800/80 rounded-xl p-4 sm:p-5 space-y-4">
                <h4 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider flex items-center gap-2">
                  <Building2 className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Company Identity & Contact Info</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Org Name */}
                  <div>
                    <label className="block text-zinc-300 text-xs font-medium mb-1">
                      Organization / Agency Name <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={orgName}
                      onChange={(e) => setOrgName(e.target.value)}
                      placeholder="e.g. LGT Holidays, Acme Bespoke Journeys"
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition"
                    />
                    <span className="text-[10px] text-zinc-500 block mt-1">
                      Primary company title rendered on all proposal headers and navigation bars.
                    </span>
                  </div>

                  {/* Phone Number */}
                  <div>
                    <label className="block text-zinc-300 text-xs font-medium mb-1 flex items-center gap-1.5">
                      <Phone className="w-3 h-3 text-zinc-400" />
                      <span>Direct Contact / Assistance Phone Number</span>
                    </label>
                    <input
                      type="text"
                      value={orgPhone}
                      onChange={(e) => setOrgPhone(e.target.value)}
                      placeholder="e.g. +1 (555) 019-2834 or +91 98200 12345"
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition"
                    />
                    <span className="text-[10px] text-zinc-500 block mt-1">
                      Displayed in proposal metadata and footers for guest emergency contact.
                    </span>
                  </div>

                  {/* Address */}
                  <div>
                    <label className="block text-zinc-300 text-xs font-medium mb-1 flex items-center gap-1.5">
                      <MapPin className="w-3 h-3 text-zinc-400" />
                      <span>Office / Physical Address</span>
                    </label>
                    <textarea
                      rows={2}
                      value={orgAddress}
                      onChange={(e) => setOrgAddress(e.target.value)}
                      placeholder="e.g. Level 14, Marina One West Tower, 9 Straits View, Singapore 018937"
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition resize-y leading-relaxed"
                    />
                    <span className="text-[10px] text-zinc-500 block mt-1">
                      Printed on proposal letterhead and formal quotations.
                    </span>
                  </div>

                  {/* Website */}
                  <div>
                    <label className="block text-zinc-300 text-xs font-medium mb-1 flex items-center gap-1.5">
                      <Globe className="w-3 h-3 text-zinc-400" />
                      <span>Official Website / Domain</span>
                    </label>
                    <input
                      type="text"
                      value={orgWebsite}
                      onChange={(e) => setOrgWebsite(e.target.value)}
                      placeholder="e.g. https://www.lgtholidays.com"
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition"
                    />
                    <span className="text-[10px] text-zinc-500 block mt-1">
                      Hyperlinked in client email dispatches and quotation PDF footer.
                    </span>
                  </div>
                </div>
              </div>

              {/* Card 2: Branding Assets & Itinerary PDF Letterhead */}
              <div className="bg-zinc-950/60 border border-zinc-800/80 rounded-xl p-4 sm:p-5 space-y-4">
                <h4 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider flex items-center gap-2">
                  <ImageIcon className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Branding Assets & Proposal Letterhead</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  {/* Logo Column */}
                  <div className="space-y-2">
                    <label className="block text-zinc-300 text-xs font-medium">
                      Organization Logo
                    </label>
                    <p className="text-[11px] text-zinc-400">
                      Upload your high-res logo or provide an image URL. PNG with transparency or JPG recommended (max 2MB).
                    </p>

                    {/* Hidden file input */}
                    <input
                      type="file"
                      ref={logoInputRef}
                      accept="image/png,image/jpeg,image/webp"
                      onChange={handleLogoUpload}
                      className="hidden"
                    />

                    {/* Preview box */}
                    <div className="p-3 bg-zinc-900/90 border border-zinc-800 rounded-lg space-y-3">
                      {orgLogoUrl ? (
                        <div className="flex items-center justify-between gap-3 bg-black/40 p-2.5 rounded-lg border border-zinc-800">
                          <img
                            src={orgLogoUrl}
                            alt="Logo preview"
                            className="h-12 max-w-[180px] object-contain rounded"
                          />
                          <button
                            type="button"
                            onClick={() => setOrgLogoUrl('')}
                            className="p-1.5 text-zinc-400 hover:text-rose-400 hover:bg-rose-950/30 rounded-lg transition cursor-pointer"
                            title="Remove logo"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="p-3 border border-dashed border-zinc-800 rounded-lg text-center text-zinc-500 text-xs flex flex-col items-center gap-1">
                          <ImageIcon className="w-5 h-5 text-zinc-600" />
                          <span>No logo uploaded yet</span>
                        </div>
                      )}

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => logoInputRef.current?.click()}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs rounded-lg transition cursor-pointer"
                        >
                          <Upload className="w-3.5 h-3.5 text-indigo-400" />
                          <span>Upload Logo File</span>
                        </button>
                        <span className="text-[10px] text-zinc-500">or paste URL below:</span>
                      </div>

                      <input
                        type="text"
                        value={orgLogoUrl}
                        onChange={(e) => setOrgLogoUrl(e.target.value)}
                        placeholder="https://... or data:image/png;base64,..."
                        className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-[11px] text-zinc-300 font-mono focus:outline-none focus:border-indigo-500 transition"
                      />
                    </div>
                  </div>

                  {/* Letterhead Banner Column */}
                  <div className="space-y-2">
                    <label className="block text-zinc-300 text-xs font-medium">
                      Letterhead Header Banner (for Itinerary PDF)
                    </label>
                    <p className="text-[11px] text-zinc-400">
                      Upload an official top header artwork or banner graphic rendered across the top of Page 1 in all generated PDFs.
                    </p>

                    {/* Hidden file input */}
                    <input
                      type="file"
                      ref={letterheadInputRef}
                      accept="image/png,image/jpeg,image/webp"
                      onChange={handleLetterheadUpload}
                      className="hidden"
                    />

                    {/* Preview box */}
                    <div className="p-3 bg-zinc-900/90 border border-zinc-800 rounded-lg space-y-3">
                      {orgLetterheadUrl ? (
                        <div className="relative group bg-black/40 p-2 rounded-lg border border-zinc-800">
                          <img
                            src={orgLetterheadUrl}
                            alt="Letterhead preview"
                            className="h-14 w-full object-cover rounded"
                          />
                          <button
                            type="button"
                            onClick={() => setOrgLetterheadUrl('')}
                            className="absolute top-3 right-3 p-1.5 bg-black/70 text-zinc-400 hover:text-rose-400 hover:bg-rose-950/80 rounded-lg transition cursor-pointer shadow"
                            title="Remove letterhead banner"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="p-3 border border-dashed border-zinc-800 rounded-lg text-center text-zinc-500 text-xs flex flex-col items-center gap-1">
                          <FileText className="w-5 h-5 text-zinc-600" />
                          <span>No custom letterhead banner (clean header will be used)</span>
                        </div>
                      )}

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => letterheadInputRef.current?.click()}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs rounded-lg transition cursor-pointer"
                        >
                          <Upload className="w-3.5 h-3.5 text-indigo-400" />
                          <span>Upload Banner Graphic</span>
                        </button>
                        <span className="text-[10px] text-zinc-500">or paste URL below:</span>
                      </div>

                      <input
                        type="text"
                        value={orgLetterheadUrl}
                        onChange={(e) => setOrgLetterheadUrl(e.target.value)}
                        placeholder="https://... or data:image/png;base64,..."
                        className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-[11px] text-zinc-300 font-mono focus:outline-none focus:border-indigo-500 transition"
                      />
                    </div>
                  </div>
                </div>

                {/* Tagline / Regulatory Registration text */}
                <div className="pt-2">
                  <label className="block text-zinc-300 text-xs font-medium mb-1">
                    Letterhead Regulatory Tagline / Registration Details (Optional)
                  </label>
                  <input
                    type="text"
                    value={orgLetterheadText}
                    onChange={(e) => setOrgLetterheadText(e.target.value)}
                    placeholder="e.g. Govt. Approved Tour Operator • CIN: U63040MH2020PTC345678 • GSTIN: 27AABCL1234F1Z5 • IATA Accredited"
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition"
                  />
                  <span className="text-[10px] text-zinc-500 block mt-1">
                    Rendered directly underneath the organization name on PDF proposals and official quotes.
                  </span>
                </div>
              </div>

              {/* Card 2.5: Brand Accent Color */}
              <div className="bg-zinc-950/60 border border-zinc-800/80 rounded-xl p-4 sm:p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider flex items-center gap-2">
                      <Palette className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Primary Brand & Proposal Accent Color</span>
                    </h4>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      Powers the executive styling of your generated itinerary PDFs, cover highlights, day numerals (e.g. Day 01), table headers, quotation totals, and tags.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 self-start sm:self-auto bg-zinc-900 border border-zinc-800 px-3 py-1.5 rounded-lg">
                    <div
                      className="w-5 h-5 rounded-md border border-white/20 shadow-sm shrink-0"
                      style={{ backgroundColor: orgBrandColor }}
                    />
                    <span className="text-xs font-mono font-bold text-white uppercase tracking-wider">
                      {orgBrandColor}
                    </span>
                  </div>
                </div>

                {/* Swatches & Color Input */}
                <div className="space-y-3 pt-1">
                  <div>
                    <label className="block text-zinc-400 text-[11px] font-medium mb-1.5">
                      Select a Preset Palette
                    </label>
                    <div className="flex flex-wrap items-center gap-2">
                      {PRESET_BRAND_COLORS.map((preset) => {
                        const isSelected = orgBrandColor.toLowerCase() === preset.hex.toLowerCase();
                        return (
                          <button
                            key={preset.hex}
                            type="button"
                            onClick={() => setOrgBrandColor(preset.hex)}
                            title={preset.name}
                            className={`group relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs transition cursor-pointer ${
                              isSelected
                                ? 'bg-zinc-800 border-white/40 text-white shadow-sm ring-1 ring-white/20'
                                : 'bg-zinc-900/80 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                            }`}
                          >
                            <span
                              className="w-3.5 h-3.5 rounded-md border border-black/20 shrink-0"
                              style={{ backgroundColor: preset.hex }}
                            />
                            <span className="text-[11px] font-medium">{preset.name}</span>
                            {isSelected && <Check className="w-3 h-3 text-white ml-0.5" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Custom Hex / Color Picker input */}
                  <div className="pt-2 border-t border-zinc-800/60 flex flex-col sm:flex-row sm:items-center gap-3">
                    <label className="text-zinc-400 text-[11px] font-medium whitespace-nowrap">
                      Or Custom Hex Color:
                    </label>
                    <div className="flex items-center gap-2">
                      <div className="relative w-8 h-8 rounded-lg overflow-hidden border border-zinc-700 shrink-0 cursor-pointer shadow-sm">
                        <input
                          type="color"
                          value={orgBrandColor}
                          onChange={(e) => setOrgBrandColor(e.target.value)}
                          className="absolute -top-2 -left-2 w-12 h-12 cursor-pointer border-0 p-0"
                        />
                      </div>
                      <input
                        type="text"
                        value={orgBrandColor}
                        onChange={(e) => setOrgBrandColor(e.target.value)}
                        placeholder="#ed1b24"
                        maxLength={7}
                        className="w-28 bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono uppercase focus:outline-none focus:border-indigo-500 transition"
                      />
                      <span className="text-[10px] text-zinc-500">
                        Matches your corporate brand guidelines & proposal letterhead.
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 3: Real-Time Itinerary PDF Letterhead Mock Preview */}
              <div className="bg-zinc-950/80 border border-zinc-800 rounded-xl p-4 sm:p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Real-Time Itinerary PDF Header & Theme Preview</span>
                  </h4>
                  <span className="text-[10px] text-zinc-500 font-mono">Simulated A4 Top Header</span>
                </div>

                {/* Mock A4 Paper Header */}
                <div className="bg-white rounded-lg p-4 sm:p-5 text-zinc-900 shadow-md border border-zinc-200 overflow-hidden space-y-3">
                  {/* Optional Mock Banner */}
                  {orgLetterheadUrl && (
                    <div className="-mx-5 -mt-5 mb-3 border-b border-zinc-200 overflow-hidden max-h-20 bg-zinc-100">
                      <img
                        src={orgLetterheadUrl}
                        alt="Banner Preview"
                        className="w-full h-16 object-cover"
                      />
                    </div>
                  )}

                  {/* Header Content */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      {orgLogoUrl ? (
                        <img
                          src={orgLogoUrl}
                          alt="Logo Preview"
                          className="h-10 max-w-[120px] object-contain rounded"
                        />
                      ) : (
                        <div
                          className="w-10 h-10 rounded-lg text-white font-bold text-sm flex items-center justify-center shrink-0 shadow-sm"
                          style={{ backgroundColor: orgBrandColor }}
                        >
                          {(orgName || 'A').slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <h5 className="font-bold text-sm text-zinc-900 tracking-tight">
                          {orgName || 'YOUR TRAVEL AGENCY NAME'}
                        </h5>
                        <p className="text-[10px] text-zinc-600 font-medium">
                          {[
                            orgPhone ? `Tel: ${orgPhone}` : null,
                            orgAddress ? orgAddress : null,
                            orgWebsite ? orgWebsite : null,
                          ].filter(Boolean).join('  •  ') || 'Contact Phone  •  Office Address  •  Website'}
                        </p>
                        {orgLetterheadText && (
                          <p className="text-[9px] text-zinc-500 mt-0.5">
                            {orgLetterheadText}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span
                        className="text-[9px] font-bold tracking-wider uppercase px-2 py-0.5 rounded border block"
                        style={{
                          borderColor: `${orgBrandColor}60`,
                          color: orgBrandColor,
                          backgroundColor: `${orgBrandColor}15`,
                        }}
                      >
                        CONFIDENTIAL ITINERARY
                      </span>
                      <span className="text-[9px] text-zinc-400 block mt-1">
                        Date: {new Date().toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  {/* Brand Accent Bar */}
                  <div
                    className="h-1 w-full rounded-full transition-colors"
                    style={{ backgroundColor: orgBrandColor }}
                  />

                  {/* Mock Title */}
                  <div className="pt-1 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-base font-bold text-zinc-900">
                        6-Day Luxury Singapore & Sentosa FIT Proposal
                      </div>
                      <div
                        className="text-xs font-semibold mt-0.5"
                        style={{ color: orgBrandColor }}
                      >
                        Bespoke FIT Travel Proposal
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div
                        className="text-xl font-black"
                        style={{ color: orgBrandColor }}
                      >
                        01
                      </div>
                      <span className="text-[9px] text-zinc-500 uppercase font-medium">Day 01 Format</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="submit"
                  disabled={savingOrg}
                  className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded-xl shadow-lg shadow-indigo-600/30 transition disabled:opacity-50 cursor-pointer"
                >
                  {savingOrg ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Saving Organization Details...</span>
                    </>
                  ) : orgSaved ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-300" />
                      <span>Saved Successfully</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Save Organization & Letterhead</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* TAB 1: TELEPHONY PROVIDER (PLIVO & MSG91) */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeTab === 'telephony' && (
        <div className="space-y-6">
          {/* Primary Provider Selector */}
          <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-5 sm:p-6 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Radio className="w-4 h-4 text-indigo-400" />
                <span>Primary Telephony Carrier</span>
              </h3>
              <p className="text-xs text-zinc-400 mt-1">
                Choose the carrier that powers voice calling and text messaging for this organization.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* Plivo Option */}
              <div
                onClick={() => handlePrimaryProviderChange('plivo')}
                className={`p-4 rounded-xl border transition cursor-pointer flex items-start gap-3.5 ${primaryProvider === 'plivo'
                  ? 'bg-emerald-950/20 border-emerald-500/50 shadow-lg shadow-emerald-950/30'
                  : 'bg-zinc-950 border-zinc-800 hover:border-zinc-700'
                  }`}
              >
                <div
                  className={`w-4 h-4 rounded-full mt-0.5 border flex items-center justify-center shrink-0 ${primaryProvider === 'plivo' ? 'border-emerald-400 bg-emerald-400' : 'border-zinc-600'
                    }`}
                >
                  {primaryProvider === 'plivo' && <div className="w-1.5 h-1.5 rounded-full bg-black" />}
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-xs text-white flex items-center gap-2">
                    <span>Plivo Communications</span>
                    <span className="text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.2 rounded font-mono">
                      Voice + Web Phone + SMS
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">
                    Full WebRTC browser calling, inbound SIP trunking, call recording, and dual-channel streaming.
                  </p>
                  <div className="mt-2.5 flex items-center gap-2">
                    <span
                      className={`text-[10px] font-medium flex items-center gap-1 ${plivoInteg?.status === 'verified'
                        ? 'text-emerald-400'
                        : plivoInteg?.status === 'failed'
                          ? 'text-red-400'
                          : 'text-zinc-500'
                        }`}
                    >
                      {plivoInteg?.status === 'verified' ? (
                        <>
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Credentials Verified {plivoInteg?.maskedDetails?.authIdLast4 ? `(...${plivoInteg.maskedDetails.authIdLast4})` : ''}</span>
                        </>
                      ) : plivoInteg?.status === 'failed' ? (
                        <>
                          <XCircle className="w-3 h-3" />
                          <span>Verification Failed</span>
                        </>
                      ) : (
                        <span>Not Configured</span>
                      )}
                    </span>
                  </div>
                </div>
              </div>

              {/* MSG91 Option */}
              <div
                onClick={() => handlePrimaryProviderChange('msg91')}
                className={`p-4 rounded-xl border transition cursor-pointer flex items-start gap-3.5 ${primaryProvider === 'msg91'
                  ? 'bg-cyan-950/20 border-cyan-500/50 shadow-lg shadow-cyan-950/30'
                  : 'bg-zinc-950 border-zinc-800 hover:border-zinc-700'
                  }`}
              >
                <div
                  className={`w-4 h-4 rounded-full mt-0.5 border flex items-center justify-center shrink-0 ${primaryProvider === 'msg91' ? 'border-cyan-400 bg-cyan-400' : 'border-zinc-600'
                    }`}
                >
                  {primaryProvider === 'msg91' && <div className="w-1.5 h-1.5 rounded-full bg-black" />}
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-xs text-white flex items-center gap-2">
                    <span>MSG91 Cloud Communications</span>
                    <span className="text-[9px] bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 px-1.5 py-0.2 rounded font-mono">
                      Outbound Voice + Fast SMS
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">
                    High-speed transactional SMS delivery, regional sender IDs (India/Global), and outbound voice campaigns.
                  </p>
                  <div className="mt-2.5 flex items-center gap-2">
                    <span
                      className={`text-[10px] font-medium flex items-center gap-1 ${msg91Integ?.status === 'verified'
                        ? 'text-cyan-400'
                        : msg91Integ?.status === 'failed'
                          ? 'text-red-400'
                          : 'text-zinc-500'
                        }`}
                    >
                      {msg91Integ?.status === 'verified' ? (
                        <>
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Credentials Verified {msg91Integ?.maskedDetails?.authKeyLast4 ? `(Key: ...${msg91Integ.maskedDetails.authKeyLast4})` : ''}</span>
                        </>
                      ) : msg91Integ?.status === 'failed' ? (
                        <>
                          <XCircle className="w-3 h-3" />
                          <span>Verification Failed</span>
                        </>
                      ) : (
                        <span>Not Configured</span>
                      )}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Plivo Credentials Card */}
          <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Shield className="w-4 h-4 text-emerald-400" />
                  <span>Plivo Account Credentials</span>
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  AES-256-GCM encrypted. Plaintext tokens never reach browser consoles or application logs.
                </p>
              </div>

              {plivoInteg?.status === 'verified' && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Active & Verified</span>
                </div>
              )}
            </div>

            {/* Currently Active Verified Credentials Status Banner */}
            {plivoInteg?.status === 'verified' && (
              <div className="bg-emerald-950/20 border border-emerald-500/30 rounded-xl p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span className="font-semibold text-emerald-300">Active BYOK Plivo Carrier Account</span>
                  </div>
                  <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-bold">
                    Encrypted in Database
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 font-mono text-[11px] text-zinc-300">
                  <div className="bg-zinc-950/80 p-2.5 rounded-lg border border-zinc-800">
                    <span className="text-zinc-500 block text-[9px] uppercase font-sans font-medium">Plivo Auth ID</span>
                    <span className="text-emerald-400 font-bold">
                      {plivoInteg.maskedDetails?.authIdMasked || (plivoInteg.maskedDetails?.authIdLast4 ? `...${plivoInteg.maskedDetails.authIdLast4}` : 'Verified')}
                    </span>
                  </div>
                  <div className="bg-zinc-950/80 p-2.5 rounded-lg border border-zinc-800">
                    <span className="text-zinc-500 block text-[9px] uppercase font-sans font-medium">Outbound Caller ID</span>
                    <span className="text-zinc-200">{plivoInteg.maskedDetails?.callerId || 'Not Configured'}</span>
                  </div>
                  <div className="bg-zinc-950/80 p-2.5 rounded-lg border border-zinc-800">
                    <span className="text-zinc-500 block text-[9px] uppercase font-sans font-medium">WebRTC SIP Endpoint</span>
                    <span
                      className="text-zinc-300 text-[10px] truncate block"
                      title={plivoInteg.maskedDetails?.sipEndpoint || (currentOrg?.slug ? `sip:agent-${currentOrg.slug.slice(0, 10)}@phone.plivo.com` : 'Auto-provisioned on connect')}
                    >
                      {plivoInteg.maskedDetails?.sipEndpoint || (currentOrg?.slug ? `agent-${currentOrg.slug.slice(0, 10)}...` : 'Auto-provisioned')}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Hidden dummy fields to prevent browser password managers from autofilling account login credentials */}
            <input type="text" style={{ display: 'none' }} aria-hidden="true" tabIndex={-1} autoComplete="off" />
            <input type="password" style={{ display: 'none' }} aria-hidden="true" tabIndex={-1} autoComplete="new-password" />

            <form onSubmit={handleSavePlivo} className="space-y-4 text-xs" autoComplete="off">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-zinc-300 block mb-1 font-medium">
                    {plivoInteg?.status === 'verified' ? 'Update Plivo Auth ID (Optional)' : 'Plivo Auth ID *'}
                  </label>
                  <input
                    type="text"
                    required={!plivoInteg?.status || plivoInteg.status !== 'verified'}
                    autoComplete="new-password"
                    autoSave="off"
                    name="plivo_carrier_auth_id_custom"
                    id="plivo_carrier_auth_id_custom"
                    data-lpignore="true"
                    data-1p-ignore="true"
                    data-form-type="other"
                    spellCheck={false}
                    placeholder={plivoInteg?.maskedDetails?.authIdLast4 ? `Leave blank to keep current (...${plivoInteg.maskedDetails.authIdLast4})` : 'e.g. MAMDRKYZNKYTATZWQYMC'}
                    value={plivoAuthId}
                    onChange={(e) => setPlivoAuthId(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-200 font-mono text-xs focus:outline-none focus:border-indigo-500"
                  />
                  <p className="text-[10px] text-zinc-500 mt-1">Alphanumeric Plivo Auth ID from your Plivo Console (not an email address).</p>
                </div>

                <div>
                  <label className="text-zinc-300 block mb-1 font-medium">
                    {plivoInteg?.status === 'verified' ? 'Update Plivo Auth Token (Optional)' : 'Plivo Auth Token *'}
                  </label>
                  <div className="relative">
                    <input
                      type={showPlivoToken ? 'text' : 'password'}
                      required={!plivoInteg?.status || plivoInteg.status !== 'verified'}
                      name="plivo_carrier_secret_token_custom"
                      id="plivo_carrier_secret_token_custom"
                      autoComplete="new-password"
                      autoSave="off"
                      data-lpignore="true"
                      data-1p-ignore="true"
                      data-form-type="other"
                      spellCheck={false}
                      placeholder={plivoInteg?.status === 'verified' ? '•••••••••••••••• (Leave blank to keep current token)' : 'Enter new Auth Token'}
                      value={plivoAuthToken}
                      onChange={(e) => setPlivoAuthToken(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 pr-10 text-zinc-200 font-mono text-xs focus:outline-none focus:border-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPlivoToken(!showPlivoToken)}
                      className="absolute right-3 top-2.5 text-zinc-500 hover:text-zinc-300 transition cursor-pointer"
                    >
                      {showPlivoToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-[10px] text-zinc-500 mt-1">Leave blank if you already saved your verified Auth Token.</p>
                </div>
              </div>

              <div>
                <label className="text-zinc-300 block mb-1 font-medium">Outbound Caller ID (E.164)</label>
                <input
                  type="text"
                  placeholder="+918888888888"
                  value={plivoCallerId}
                  onChange={(e) => setPlivoCallerId(e.target.value)}
                  className="w-full sm:w-1/2 bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-200 font-mono text-xs focus:outline-none focus:border-indigo-500"
                />
              </div>

              {plivoResult && (
                <div
                  className={`p-3 rounded-lg text-xs flex items-center gap-2 ${plivoResult.success
                    ? 'bg-emerald-950/40 border border-emerald-800 text-emerald-300'
                    : 'bg-red-950/40 border border-red-800 text-red-300'
                    }`}
                >
                  {plivoResult.success ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0" />}
                  <span>{plivoResult.message}</span>
                </div>
              )}

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={savingPlivo}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center gap-2 transition disabled:opacity-50 cursor-pointer"
                >
                  {savingPlivo && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{savingPlivo ? 'Testing & Saving...' : 'Test & Save Plivo Keys'}</span>
                </button>
              </div>
            </form>
          </div>

          {/* Plivo Voice Application Webhooks (Answer URL, Hangup URL, Fallback Answer URL) */}
          <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-5 sm:p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <Webhook className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-sm font-bold text-white">
                    Plivo Voice Application Endpoints
                  </h3>
                  <span className="text-[10px] font-semibold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                    Configure in Plivo Console
                  </span>
                </div>
                <p className="text-xs text-zinc-400 mt-1">
                  Add these 3 URLs to your <strong className="text-zinc-200">Plivo Console &gt; Voice &gt; Applications</strong> to connect your phone number with this console for live WebRTC calls, audio recording, and AI itinerary generation.
                </p>
              </div>

              <button
                type="button"
                onClick={handleCopyAllPlivo}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 rounded-lg text-xs font-medium transition cursor-pointer shrink-0 self-start sm:self-auto"
              >
                {copiedAllPlivo ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400">All 3 URLs Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy All 3 URLs</span>
                  </>
                )}
              </button>
            </div>

            {/* Quick 4-Step Checklist for Plivo Console */}
            <div className="bg-emerald-950/20 border border-emerald-500/20 rounded-xl p-3.5 text-xs space-y-2">
              <div className="font-semibold text-emerald-300 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>How to connect your Plivo Phone Number to this console application:</span>
              </div>
              <ol className="list-decimal list-inside space-y-1 text-zinc-300 text-[11px] pl-1 leading-relaxed">
                <li>Log in to <a href="https://console.plivo.com/voice/applications/" target="_blank" rel="noreferrer" className="text-emerald-400 underline hover:text-emerald-300">Plivo Console &gt; Voice &gt; Applications</a>.</li>
                <li>Click <strong>Add New Application</strong> and enter an app name (e.g. <em>Travel Agency Inbound Console</em>).</li>
                <li>Copy and paste the <strong>Primary Answer URL</strong>, <strong>Fallback Answer URL</strong>, and <strong>Hangup URL</strong> below (ensure all HTTP methods are set to <strong>POST</strong>).</li>
                <li>Under <a href="https://console.plivo.com/voice/numbers/" target="_blank" rel="noreferrer" className="text-emerald-400 underline hover:text-emerald-300">Voice &gt; Numbers</a>, click your rented number and assign it to this Application. Incoming calls will now ring your console immediately!</li>
              </ol>
            </div>

            {/* The 3 Webhook Cards */}
            <div className="space-y-3 text-xs">
              {/* 1. Primary Answer URL */}
              <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    <span className="font-semibold text-zinc-100">Primary Answer URL</span>
                  </div>
                  <span className="text-[10px] font-mono font-bold bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded border border-indigo-500/30">
                    Method: POST
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={plivoAnswerUrl}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 font-mono text-xs text-emerald-400 select-all focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => handleCopy(plivoAnswerUrl, 'telephony_voiceAnswer')}
                    className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition cursor-pointer shrink-0"
                    title="Copy Primary Answer URL"
                  >
                    {copiedKey === 'telephony_voiceAnswer' ? (
                      <Check className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </div>
                <p className="text-[11px] text-zinc-400">
                  <strong>Trigger:</strong> Called by Plivo as soon as an incoming call arrives on your number. Returns Plivo XML to start audio recording, trigger the browser WebRTC incoming call modal, and play ringback tone.
                </p>
              </div>

              {/* 2. Fallback Answer URL */}
              <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                    <span className="font-semibold text-zinc-100">Fallback Answer URL</span>
                  </div>
                  <span className="text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded border border-amber-500/30">
                    Method: POST
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={plivoFallbackAnswerUrl}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 font-mono text-xs text-amber-400 select-all focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => handleCopy(plivoFallbackAnswerUrl, 'telephony_voiceFallback')}
                    className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition cursor-pointer shrink-0"
                    title="Copy Fallback Answer URL"
                  >
                    {copiedKey === 'telephony_voiceFallback' ? (
                      <Check className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </div>
                <p className="text-[11px] text-zinc-400">
                  <strong>Trigger:</strong> Called by Plivo if the primary Answer URL encounters a timeout or is unreachable. Prevents dropped calls by gracefully connecting the customer to backup routing.
                </p>
              </div>

              {/* 3. Hangup URL */}
              <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-rose-400" />
                    <span className="font-semibold text-zinc-100">Hangup URL</span>
                  </div>
                  <span className="text-[10px] font-mono font-bold bg-rose-500/20 text-rose-300 px-2 py-0.5 rounded border border-rose-500/30">
                    Method: POST
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={plivoHangupUrl}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 font-mono text-xs text-rose-400 select-all focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => handleCopy(plivoHangupUrl, 'telephony_voiceHangup')}
                    className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition cursor-pointer shrink-0"
                    title="Copy Hangup URL"
                  >
                    {copiedKey === 'telephony_voiceHangup' ? (
                      <Check className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </div>
                <p className="text-[11px] text-zinc-400">
                  <strong>Trigger:</strong> Called by Plivo upon call termination. Finalizes duration, carrier analytics, recording URL, and triggers AI speech transcription and itinerary generation.
                </p>
              </div>
            </div>
          </div>

          {/* MSG91 Credentials Card */}
          <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Shield className="w-4 h-4 text-cyan-400" />
                  <span>MSG91 Account Credentials</span>
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Regional telephony and high-speed SMS delivery credentials.
                </p>
              </div>

              {msg91Integ?.status === 'verified' && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 text-[10px] font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                  <span>Active & Verified</span>
                </div>
              )}
            </div>

            <form onSubmit={handleSaveMsg91} className="space-y-4 text-xs">
              <div>
                <label className="text-zinc-300 block mb-1 font-medium">MSG91 Auth Key *</label>
                <div className="relative">
                  <input
                    type={showMsg91Key ? 'text' : 'password'}
                    required
                    placeholder={msg91Integ?.maskedDetails?.authKeyLast4 ? `...${msg91Integ.maskedDetails.authKeyLast4}` : 'Enter MSG91 Auth Key (e.g. 439248...)'}
                    value={msg91AuthKey}
                    onChange={(e) => setMsg91AuthKey(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 pr-10 text-zinc-200 font-mono text-xs focus:outline-none focus:border-cyan-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowMsg91Key(!showMsg91Key)}
                    className="absolute right-3 top-2.5 text-zinc-500 hover:text-zinc-300 transition"
                  >
                    {showMsg91Key ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-zinc-300 block mb-1 font-medium">Sender ID (SMS)</label>
                  <input
                    type="text"
                    maxLength={6}
                    placeholder="e.g. TRVAGT"
                    value={msg91SenderId}
                    onChange={(e) => setMsg91SenderId(e.target.value.toUpperCase())}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-200 font-mono text-xs uppercase focus:outline-none focus:border-cyan-500"
                  />
                  <span className="text-[10px] text-zinc-500 mt-1 block">Standard 6-character sender ID registered with DLT.</span>
                </div>

                <div>
                  <label className="text-zinc-300 block mb-1 font-medium">Caller ID / Virtual Number (Voice)</label>
                  <input
                    type="text"
                    placeholder="+918888888888"
                    value={msg91CallerId}
                    onChange={(e) => setMsg91CallerId(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-200 font-mono text-xs focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              {msg91Result && (
                <div
                  className={`p-3 rounded-lg text-xs flex items-center gap-2 ${msg91Result.success
                    ? 'bg-cyan-950/40 border border-cyan-800 text-cyan-300'
                    : 'bg-red-950/40 border border-red-800 text-red-300'
                    }`}
                >
                  {msg91Result.success ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0" />}
                  <span>{msg91Result.message}</span>
                </div>
              )}

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={savingMsg91}
                  className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-semibold flex items-center gap-2 transition disabled:opacity-50 cursor-pointer"
                >
                  {savingMsg91 && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{savingMsg91 ? 'Testing & Saving...' : 'Test & Save MSG91 Keys'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* TAB 2: TRANSCRIPTION SERVICE (OPENAI) */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeTab === 'transcription' && (
        <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-5 sm:p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Mic className="w-4 h-4 text-indigo-400" />
                <span>OpenAI Transcription Service (BYOK)</span>
              </h3>
              <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                Powers real-time speech-to-text processing for consultation phone calls and recorded media files.
              </p>
            </div>

            {openaiInteg?.status === 'verified' && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-semibold">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>OpenAI Verified (...{openaiInteg?.maskedDetails?.apiKeyLast4 || '****'})</span>
              </div>
            )}
          </div>

          <form onSubmit={handleSaveOpenAi} className="space-y-4 text-xs">
            <div>
              <label className="text-zinc-300 block mb-1 font-medium">OpenAI API Key (sk-...) *</label>
              <div className="relative">
                <input
                  type={showOpenAiKey ? 'text' : 'password'}
                  required
                  placeholder={openaiInteg?.maskedDetails?.apiKeyLast4 ? `Current Key: ...${openaiInteg.maskedDetails.apiKeyLast4}` : 'sk-proj-...'}
                  value={openAiApiKey}
                  onChange={(e) => setOpenAiApiKey(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 pr-10 text-zinc-200 font-mono text-xs focus:outline-none focus:border-indigo-500"
                />
                <button
                  type="button"
                  onClick={() => setShowOpenAiKey(!showOpenAiKey)}
                  className="absolute right-3 top-2.5 text-zinc-500 hover:text-zinc-300 transition"
                >
                  {showOpenAiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-zinc-300 block mb-1 font-medium">Transcription Model</label>
                <select
                  value={openAiModel}
                  onChange={(e) => setOpenAiModel(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-200 text-xs"
                >
                  <option value="gpt-4o-transcribe">gpt-4o-transcribe (Recommended — Ultra High Fidelity)</option>
                  <option value="whisper-1">whisper-1 (Standard Whisper Model)</option>
                </select>
              </div>

              <div>
                <label className="text-zinc-300 block mb-1 font-medium">Custom Base URL (Optional)</label>
                <input
                  type="text"
                  placeholder="https://api.openai.com/v1"
                  value={openAiBaseUrl}
                  onChange={(e) => setOpenAiBaseUrl(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-200 text-xs font-mono"
                />
                <span className="text-[10px] text-zinc-500 mt-1 block">Leave blank for official OpenAI endpoint.</span>
              </div>
            </div>

            {openAiResult && (
              <div
                className={`p-3 rounded-lg text-xs flex items-center gap-2 ${openAiResult.success
                  ? 'bg-emerald-950/40 border border-emerald-800 text-emerald-300'
                  : 'bg-red-950/40 border border-red-800 text-red-300'
                  }`}
              >
                {openAiResult.success ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0" />}
                <span>{openAiResult.message}</span>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={savingOpenAi}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center gap-2 transition disabled:opacity-50 cursor-pointer"
              >
                {savingOpenAi && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>{savingOpenAi ? 'Verifying Key...' : 'Test & Save OpenAI Key'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* TAB 3: ITINERARY & INTELLIGENCE (DEEPSEEK) */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeTab === 'intelligence' && (
        <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-5 sm:p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Brain className="w-4 h-4 text-violet-400" />
                <span>DeepSeek Travel Intelligence (BYOK)</span>
              </h3>
              <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                Powers AI travel consultation synthesis, bespoke day-by-day itinerary generation, and client PDF generation.
              </p>
            </div>

            {deepseekInteg?.status === 'verified' && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-violet-500/10 text-violet-400 border border-violet-500/20 text-[10px] font-semibold">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>DeepSeek Verified (...{deepseekInteg?.maskedDetails?.apiKeyLast4 || '****'})</span>
              </div>
            )}
          </div>

          <form onSubmit={handleSaveDeepseek} className="space-y-4 text-xs">
            <div>
              <label className="text-zinc-300 block mb-1 font-medium">DeepSeek API Key (sk-...) *</label>
              <div className="relative">
                <input
                  type={showDeepseekKey ? 'text' : 'password'}
                  required
                  placeholder={deepseekInteg?.maskedDetails?.apiKeyLast4 ? `Current Key: ...${deepseekInteg.maskedDetails.apiKeyLast4}` : 'sk-...'}
                  value={deepseekApiKey}
                  onChange={(e) => setDeepseekApiKey(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 pr-10 text-zinc-200 font-mono text-xs focus:outline-none focus:border-violet-500"
                />
                <button
                  type="button"
                  onClick={() => setShowDeepseekKey(!showDeepseekKey)}
                  className="absolute right-3 top-2.5 text-zinc-500 hover:text-zinc-300 transition"
                >
                  {showDeepseekKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-zinc-300 block mb-1 font-medium">DeepSeek Model</label>
                <select
                  value={deepseekModel}
                  onChange={(e) => setDeepseekModel(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-200 text-xs"
                >
                  <option value="deepseek-chat">deepseek-chat (Default General Intelligence)</option>
                  <option value="deepseek-v4-flash">deepseek-v4-flash (Fast Reasoning)</option>
                </select>
              </div>

              <div>
                <label className="text-zinc-300 block mb-1 font-medium">API Base URL</label>
                <input
                  type="text"
                  placeholder="https://api.deepseek.com"
                  value={deepseekBaseUrl}
                  onChange={(e) => setDeepseekBaseUrl(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-200 text-xs font-mono"
                />
              </div>
            </div>

            {deepseekResult && (
              <div
                className={`p-3 rounded-lg text-xs flex items-center gap-2 ${deepseekResult.success
                  ? 'bg-violet-950/40 border border-violet-800 text-violet-300'
                  : 'bg-red-950/40 border border-red-800 text-red-300'
                  }`}
              >
                {deepseekResult.success ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0" />}
                <span>{deepseekResult.message}</span>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={savingDeepseek}
                className="px-4 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center gap-2 transition disabled:opacity-50 cursor-pointer"
              >
                {savingDeepseek && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>{savingDeepseek ? 'Testing Key...' : 'Test & Save DeepSeek Key'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* TAB 4: CARRIER WEBHOOKS */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeTab === 'webhooks' && (
        <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-5 sm:p-6 space-y-5">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Webhook className="w-4 h-4 text-emerald-400" />
              <span>Tenant-Specific Webhook Endpoints</span>
            </h3>
            <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
              Configure these URLs in your Plivo Application or MSG91 Webhook dashboard. Each URL contains your organization identifier for seamless event routing.
            </p>
          </div>

          <div className="space-y-4 text-xs">
            {/* Plivo Answer URL */}
            <div className="bg-zinc-950 border border-zinc-800/80 rounded-xl p-3.5 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-zinc-200">Plivo Primary Voice Answer URL</span>
                <span className="text-[10px] text-zinc-500">Method: POST</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={plivoAnswerUrl}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 font-mono text-[11px] text-zinc-400 select-all"
                />
                <button
                  type="button"
                  onClick={() => handleCopy(plivoAnswerUrl, 'voiceAnswer')}
                  className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded transition cursor-pointer shrink-0"
                  title="Copy URL"
                >
                  {copiedKey === 'voiceAnswer' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
              <p className="text-[11px] text-zinc-500">Paste into Plivo Console &gt; Voice Applications &gt; Primary Answer URL.</p>
            </div>

            {/* Plivo Fallback Answer URL */}
            <div className="bg-zinc-950 border border-zinc-800/80 rounded-xl p-3.5 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-zinc-200">Plivo Voice Fallback Answer URL</span>
                <span className="text-[10px] text-zinc-500">Method: POST</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={plivoFallbackAnswerUrl}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 font-mono text-[11px] text-zinc-400 select-all"
                />
                <button
                  type="button"
                  onClick={() => handleCopy(plivoFallbackAnswerUrl, 'voiceFallback')}
                  className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded transition cursor-pointer shrink-0"
                  title="Copy URL"
                >
                  {copiedKey === 'voiceFallback' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
              <p className="text-[11px] text-zinc-500">Paste into Plivo Console &gt; Voice Applications &gt; Fallback Answer URL.</p>
            </div>

            {/* Plivo Hangup URL */}
            <div className="bg-zinc-950 border border-zinc-800/80 rounded-xl p-3.5 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-zinc-200">Plivo Voice Hangup URL</span>
                <span className="text-[10px] text-zinc-500">Method: POST</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={plivoHangupUrl}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 font-mono text-[11px] text-zinc-400 select-all"
                />
                <button
                  type="button"
                  onClick={() => handleCopy(plivoHangupUrl, 'voiceHangup')}
                  className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded transition cursor-pointer shrink-0"
                  title="Copy URL"
                >
                  {copiedKey === 'voiceHangup' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* MSG91 Voice Webhook */}
            <div className="bg-zinc-950 border border-zinc-800/80 rounded-xl p-3.5 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-zinc-200">MSG91 Voice Callbacks Webhook</span>
                <span className="text-[10px] text-zinc-500">Method: POST</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={msg91VoiceUrl}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 font-mono text-[11px] text-zinc-400 select-all"
                />
                <button
                  type="button"
                  onClick={() => handleCopy(msg91VoiceUrl, 'msg91Voice')}
                  className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded transition cursor-pointer shrink-0"
                  title="Copy URL"
                >
                  {copiedKey === 'msg91Voice' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
              <p className="text-[11px] text-zinc-500">Paste into MSG91 Dashboard &gt; Voice &gt; Webhooks.</p>
            </div>

            {/* MSG91 SMS Webhook */}
            <div className="bg-zinc-950 border border-zinc-800/80 rounded-xl p-3.5 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-zinc-200">MSG91 Inbound SMS & Delivery Reports</span>
                <span className="text-[10px] text-zinc-500">Method: POST</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={msg91SmsUrl}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 font-mono text-[11px] text-zinc-400 select-all"
                />
                <button
                  type="button"
                  onClick={() => handleCopy(msg91SmsUrl, 'msg91Sms')}
                  className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded transition cursor-pointer shrink-0"
                  title="Copy URL"
                >
                  {copiedKey === 'msg91Sms' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* TAB 5: POLICIES */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeTab === 'policies' && (
        <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-5 sm:p-6 space-y-5">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Sliders className="w-4 h-4 text-indigo-400" />
              <span>Organization Telephony Policies</span>
            </h3>
            <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
              Configure recording retention and automatic transcription behavior across all phone lines in this organization.
            </p>
          </div>

          <form onSubmit={handleSavePolicies} className="space-y-4 text-xs">
            <div className="flex items-center justify-between p-3.5 bg-zinc-950 border border-zinc-800 rounded-xl">
              <div>
                <div className="font-semibold text-zinc-200">Default Call Transcription</div>
                <div className="text-zinc-500 text-[11px] mt-0.5">Automatically transcribe recordings using your configured transcription key</div>
              </div>
              <input
                type="checkbox"
                checked={transcriptionDefaultEnabled}
                onChange={(e) => setTranscriptionDefaultEnabled(e.target.checked)}
                className="w-4 h-4 accent-indigo-600 rounded cursor-pointer"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-zinc-300 block mb-1 font-medium">Default Transcription Language</label>
                <select
                  value={transcriptionLanguage}
                  onChange={(e) => setTranscriptionLanguage(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-200 text-xs"
                >
                  <option value="en-US">English (en-US)</option>
                  <option value="hi-IN">Hindi (hi-IN)</option>
                  <option value="ta-IN">Tamil (ta-IN)</option>
                  <option value="te-IN">Telugu (te-IN)</option>
                  <option value="auto">Auto Detect</option>
                </select>
              </div>

              <div>
                <label className="text-zinc-300 block mb-1 font-medium">Recording Retention (Days)</label>
                <input
                  type="number"
                  min={7}
                  max={365}
                  value={recordingRetentionDays}
                  onChange={(e) => setRecordingRetentionDays(Number(e.target.value))}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-200 text-xs font-mono"
                />
              </div>
            </div>

            <div className="flex items-center justify-between p-3.5 bg-zinc-950 border border-zinc-800 rounded-xl">
              <div>
                <div className="font-semibold text-zinc-200">Redact Message Content (log: false)</div>
                <div className="text-zinc-500 text-[11px] mt-0.5">Masks SMS message text in external carrier log records</div>
              </div>
              <input
                type="checkbox"
                checked={redactMessageContent}
                onChange={(e) => setRedactMessageContent(e.target.checked)}
                className="w-4 h-4 accent-indigo-600 rounded cursor-pointer"
              />
            </div>

            {policiesSaved && (
              <div className="p-3 bg-emerald-950/40 border border-emerald-800 text-emerald-300 rounded-lg text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Policies updated successfully!</span>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={savingPolicies}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center gap-2 transition disabled:opacity-50 cursor-pointer"
              >
                {savingPolicies && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>{savingPolicies ? 'Saving...' : 'Save Policies'}</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
