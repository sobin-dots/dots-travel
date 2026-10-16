'use client';

import React, { useState, useEffect } from 'react';
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
} from 'lucide-react';
import { useConsole } from '@/context/ConsoleContext';

type SettingsTab = 'telephony' | 'transcription' | 'intelligence' | 'webhooks' | 'policies';

export default function SettingsPage() {
  const {
    currentOrg,
    bearerToken,
    settings,
    fetchData,
    integrationsSummary,
    fetchIntegrations,
  } = useConsole();

  const [activeTab, setActiveTab] = useState<SettingsTab>('telephony');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Telephony primary provider
  const [primaryProvider, setPrimaryProvider] = useState<'plivo' | 'msg91'>('plivo');
  const [switchingProvider, setSwitchingProvider] = useState(false);

  // Plivo Form
  const [plivoAuthId, setPlivoAuthId] = useState('');
  const [plivoAuthToken, setPlivoAuthToken] = useState('');
  const [plivoCallerId, setPlivoCallerId] = useState('+918065531234');
  const [showPlivoToken, setShowPlivoToken] = useState(false);
  const [savingPlivo, setSavingPlivo] = useState(false);
  const [plivoResult, setPlivoResult] = useState<{ success?: boolean; message?: string } | null>(null);

  // MSG91 Form
  const [msg91AuthKey, setMsg91AuthKey] = useState('');
  const [msg91SenderId, setMsg91SenderId] = useState('TRVAGT');
  const [msg91CallerId, setMsg91CallerId] = useState('+918065531234');
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
  const [deepseekModel, setDeepseekModel] = useState('deepseek-chat');
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

  useEffect(() => {
    if (integrationsSummary) {
      if (integrationsSummary.primaryTelephonyProvider) {
        setPrimaryProvider(integrationsSummary.primaryTelephonyProvider);
      }
    }
  }, [integrationsSummary]);

  useEffect(() => {
    if (settings?.organization) {
      const org = settings.organization;
      if (org.transcriptionDefaultEnabled !== undefined) setTranscriptionDefaultEnabled(org.transcriptionDefaultEnabled);
      if (org.transcriptionLanguage) setTranscriptionLanguage(org.transcriptionLanguage);
      if (org.recordingRetentionDays !== undefined && org.recordingRetentionDays !== null) {
        setRecordingRetentionDays(org.recordingRetentionDays);
      }
      if (org.redactMessageContent !== undefined) setRedactMessageContent(org.redactMessageContent);
      if (org.primaryTelephonyProvider) setPrimaryProvider(org.primaryTelephonyProvider);
    }
  }, [settings]);

  const handleCopy = (text: string, keyName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(keyName);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  const getIntegrationByProvider = (providerName: string) => {
    return integrationsSummary?.integrations?.find((i: any) => i.provider === providerName);
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
          onClick={() => setActiveTab('telephony')}
          className={`flex items-center gap-2 px-3.5 py-2.5 font-medium border-b-2 transition whitespace-nowrap cursor-pointer ${
            activeTab === 'telephony'
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
          className={`flex items-center gap-2 px-3.5 py-2.5 font-medium border-b-2 transition whitespace-nowrap cursor-pointer ${
            activeTab === 'transcription'
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
          className={`flex items-center gap-2 px-3.5 py-2.5 font-medium border-b-2 transition whitespace-nowrap cursor-pointer ${
            activeTab === 'intelligence'
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
          className={`flex items-center gap-2 px-3.5 py-2.5 font-medium border-b-2 transition whitespace-nowrap cursor-pointer ${
            activeTab === 'webhooks'
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
          className={`flex items-center gap-2 px-3.5 py-2.5 font-medium border-b-2 transition whitespace-nowrap cursor-pointer ${
            activeTab === 'policies'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>Policies</span>
        </button>
      </div>

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
                className={`p-4 rounded-xl border transition cursor-pointer flex items-start gap-3.5 ${
                  primaryProvider === 'plivo'
                    ? 'bg-emerald-950/20 border-emerald-500/50 shadow-lg shadow-emerald-950/30'
                    : 'bg-zinc-950 border-zinc-800 hover:border-zinc-700'
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-full mt-0.5 border flex items-center justify-center shrink-0 ${
                    primaryProvider === 'plivo' ? 'border-emerald-400 bg-emerald-400' : 'border-zinc-600'
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
                      className={`text-[10px] font-medium flex items-center gap-1 ${
                        plivoInteg?.status === 'verified'
                          ? 'text-emerald-400'
                          : plivoInteg?.status === 'failed'
                          ? 'text-red-400'
                          : 'text-zinc-500'
                      }`}
                    >
                      {plivoInteg?.status === 'verified' ? (
                        <>
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Credentials Verified (...{plivoInteg?.maskedDetails?.authIdLast4 || 'QYMC'})</span>
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
                className={`p-4 rounded-xl border transition cursor-pointer flex items-start gap-3.5 ${
                  primaryProvider === 'msg91'
                    ? 'bg-cyan-950/20 border-cyan-500/50 shadow-lg shadow-cyan-950/30'
                    : 'bg-zinc-950 border-zinc-800 hover:border-zinc-700'
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-full mt-0.5 border flex items-center justify-center shrink-0 ${
                    primaryProvider === 'msg91' ? 'border-cyan-400 bg-cyan-400' : 'border-zinc-600'
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
                      className={`text-[10px] font-medium flex items-center gap-1 ${
                        msg91Integ?.status === 'verified'
                          ? 'text-cyan-400'
                          : msg91Integ?.status === 'failed'
                          ? 'text-red-400'
                          : 'text-zinc-500'
                      }`}
                    >
                      {msg91Integ?.status === 'verified' ? (
                        <>
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Credentials Verified (Key: ...{msg91Integ?.maskedDetails?.authKeyLast4 || '****'})</span>
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

            <form onSubmit={handleSavePlivo} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-zinc-300 block mb-1 font-medium">Plivo Auth ID *</label>
                  <input
                    type="text"
                    required
                    placeholder={plivoInteg?.maskedDetails?.authIdLast4 ? `...${plivoInteg.maskedDetails.authIdLast4}` : 'e.g. MAMDRKYZNKYTATZWQYMC'}
                    value={plivoAuthId}
                    onChange={(e) => setPlivoAuthId(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-200 font-mono text-xs focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-zinc-300 block mb-1 font-medium">Plivo Auth Token *</label>
                  <div className="relative">
                    <input
                      type={showPlivoToken ? 'text' : 'password'}
                      required
                      placeholder="Enter new Auth Token"
                      value={plivoAuthToken}
                      onChange={(e) => setPlivoAuthToken(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 pr-10 text-zinc-200 font-mono text-xs focus:outline-none focus:border-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPlivoToken(!showPlivoToken)}
                      className="absolute right-3 top-2.5 text-zinc-500 hover:text-zinc-300 transition"
                    >
                      {showPlivoToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <label className="text-zinc-300 block mb-1 font-medium">Outbound Caller ID (E.164)</label>
                <input
                  type="text"
                  placeholder="+918065531234"
                  value={plivoCallerId}
                  onChange={(e) => setPlivoCallerId(e.target.value)}
                  className="w-full sm:w-1/2 bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-200 font-mono text-xs focus:outline-none focus:border-indigo-500"
                />
              </div>

              {plivoResult && (
                <div
                  className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
                    plivoResult.success
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
                    placeholder="+918065531234"
                    value={msg91CallerId}
                    onChange={(e) => setMsg91CallerId(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-200 font-mono text-xs focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              {msg91Result && (
                <div
                  className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
                    msg91Result.success
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
                className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
                  openAiResult.success
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
                className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
                  deepseekResult.success
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
                  value={integrationsSummary?.webhookUrls?.voiceAnswer || `https://domain.com/api/v1/webhooks/voice/answer?orgId=${currentOrg?.id}`}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 font-mono text-[11px] text-zinc-400 select-all"
                />
                <button
                  type="button"
                  onClick={() =>
                    handleCopy(
                      integrationsSummary?.webhookUrls?.voiceAnswer || '',
                      'voiceAnswer'
                    )
                  }
                  className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded transition cursor-pointer shrink-0"
                  title="Copy URL"
                >
                  {copiedKey === 'voiceAnswer' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
              <p className="text-[11px] text-zinc-500">Paste into Plivo Console &gt; Voice Applications &gt; Primary Answer URL.</p>
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
                  value={integrationsSummary?.webhookUrls?.voiceHangup || `https://domain.com/api/v1/webhooks/voice/hangup?orgId=${currentOrg?.id}`}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 font-mono text-[11px] text-zinc-400 select-all"
                />
                <button
                  type="button"
                  onClick={() =>
                    handleCopy(
                      integrationsSummary?.webhookUrls?.voiceHangup || '',
                      'voiceHangup'
                    )
                  }
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
                  value={integrationsSummary?.webhookUrls?.msg91Voice || `https://domain.com/api/v1/webhooks/msg91/voice?orgId=${currentOrg?.id}`}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 font-mono text-[11px] text-zinc-400 select-all"
                />
                <button
                  type="button"
                  onClick={() =>
                    handleCopy(
                      integrationsSummary?.webhookUrls?.msg91Voice || '',
                      'msg91Voice'
                    )
                  }
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
                  value={integrationsSummary?.webhookUrls?.msg91Sms || `https://domain.com/api/v1/webhooks/msg91/sms?orgId=${currentOrg?.id}`}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 font-mono text-[11px] text-zinc-400 select-all"
                />
                <button
                  type="button"
                  onClick={() =>
                    handleCopy(
                      integrationsSummary?.webhookUrls?.msg91Sms || '',
                      'msg91Sms'
                    )
                  }
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
