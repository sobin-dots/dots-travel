'use client';

import { useEffect, useState, useMemo, useRef, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useConsole } from '@/context/ConsoleContext';
import {
  Inbox,
  CheckCircle2,
  AlertCircle,
  Clock,
  RefreshCw,
  Copy,
  Check,
  ExternalLink,
  Users,
  Settings2,
  Phone,
  Mail,
  MapPin,
  Calendar,
  Layers,
  Search,
  Filter,
  ChevronDown,
  ChevronUp,
  FileText,
  Smartphone,
  Globe,
  Radio,
  SlidersHorizontal,
  Info,
  ShieldCheck,
  Sparkles,
  Play,
  Pause,
  AlertTriangle,
  LayoutGrid,
  List,
  Code2,
} from 'lucide-react';
import { ENQUIRY_TAGS, ENQUIRY_TAG_LABELS, type EnquiryTag } from '@/lib/enquiry-fields';

const tagStyle: Record<EnquiryTag, string> = {
  hot: 'border-red-500/40 bg-red-500/10 text-red-300',
  warm: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
  cold: 'border-sky-500/40 bg-sky-500/10 text-sky-300',
};
const controlStyle = 'rounded-lg border bg-zinc-950 px-2.5 py-1.5 text-xs text-zinc-200 outline-none transition cursor-pointer disabled:opacity-50';

type Connection = {
  id: string;
  name: string;
  provider: string;
  enabled: boolean;
  formNames: Record<string, string>;
  lastReceivedAt: string | null;
  webhookSecret?: string;
};

type Member = {
  id: string;
  role: string;
  receivesLeads: boolean;
  availableForLeads: boolean;
  user: { name: string; status: string };
  phoneReadiness?: { canReceiveAssignedCalls: boolean; canReceiveNewCalls: boolean; reason: string };
};

type Submission = {
  id: string;
  connectionId: string;
  externalId: string;
  status: 'pending' | 'processing' | 'processed' | 'failed' | 'ignored' | string;
  attempts: number;
  error: string | null;
  leadId: string | null;
  payload?: any;
  createdAt: string;
  lead?: {
    id: string;
    title: string;
    status: string;
    stage: string;
    temperature?: string;
    assignedTo?: { name: string };
  };
};

type Intake = {
  connections: Connection[];
  members: Member[];
  submissions: Submission[];
  failedCount: number;
  firstContactMinutes: number;
  workerConfigured: boolean;
  emailAlertsConfigured: boolean;
};

export default function LeadIntakeSettings() {
  const { authFetch, bearerToken, currentOrg, handleSelectLead } = useConsole();
  const router = useRouter();
  const [data, setData] = useState<Intake | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [activeTab, setActiveTab] = useState<'submissions' | 'connections' | 'rotation'>('submissions');

  // View Mode: Table (default) vs Cards
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');

  // Filter & Search
  const [statusFilter, setStatusFilter] = useState<'all' | 'processed' | 'failed' | 'pending'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedPayloads, setExpandedPayloads] = useState<Record<string, boolean>>({});

  // Connection management
  const [provider, setProvider] = useState('google_forms');
  const [secret, setSecret] = useState('');
  const [origin, setOrigin] = useState('');
  const [editing, setEditing] = useState<Connection | null>(null);
  const [copiedMap, setCopiedMap] = useState<Record<string, boolean>>({});
  const formRef = useRef<HTMLDivElement>(null);

  const handleStartEdit = (connection: Connection) => {
    setEditing(connection);
    setProvider(connection.provider);
    setSecret('');
    setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      const input = formRef.current?.querySelector('input[name="name"]') as HTMLInputElement | null;
      input?.focus();
    }, 50);
  };

  const handleOpenLead = (leadId: string) => {
    handleSelectLead(leadId);
    router.push(`/console/leads?leadId=${leadId}`);
  };

  const handleUpdateTemperature = async (submissionId: string, leadId: string | null | undefined, temperature: 'hot' | 'warm' | 'cold') => {
    // Optimistic UI update
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        submissions: prev.submissions.map((sub) => {
          if (sub.id === submissionId && sub.lead) {
            return {
              ...sub,
              lead: {
                ...sub.lead,
                temperature,
              },
            };
          }
          return sub;
        }),
      };
    });

    if (leadId) {
      try {
        await authFetch(`/api/v1/leads/${leadId}/qualification`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ temperature }),
        });
      } catch (err) {
        console.error('Failed to update lead classification:', err);
      }
    }
  };

  useEffect(() => {
    if (editing && formRef.current) {
      formRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [editing]);

  const admin = ['admin', 'owner'].includes(currentOrg?.role);

  async function load() {
    const res = await authFetch('/api/v1/lead-intake');
    let json: any = null;
    try {
      json = await res.json();
    } catch {
      // empty response or network interruption
    }
    if (!res.ok) throw new Error(json?.error || `Session expired or server error (${res.status}). Please refresh.`);
    if (!json) throw new Error('Could not load settings. Please refresh the page.');
    setData(json);
  }

  useEffect(() => {
    setData(null);
    setEditing(null);
    setSecret('');
    setError('');
    setOrigin(typeof window !== 'undefined' ? window.location.origin : '');
    if (bearerToken && admin) load().catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bearerToken, admin, currentOrg?.id]);

  async function mutate(body: unknown, method = 'PATCH', path = '/api/v1/lead-intake') {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const res = await authFetch(path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      let json: any = null;
      try {
        json = await res.json();
      } catch {
        // empty response
      }
      if (!res.ok) throw new Error(json?.error || `Request failed (${res.status})`);
      await load();
      setMessage(
        path.endsWith('/process')
          ? `Processed ${json.processed} submissions successfully.`
          : 'Changes saved successfully.'
      );
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
      return false;
    } finally {
      setBusy(false);
    }
  }

  const [updatingMemberField, setUpdatingMemberField] = useState<string | null>(null);

  async function handleToggleMember(
    membershipId: string,
    field: 'receivesLeads' | 'availableForLeads',
    newVal: boolean
  ) {
    const key = `${membershipId}-${field}`;
    if (updatingMemberField === key) return;

    const previousData = data;
    // 1. Instant optimistic UI update
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        members: prev.members.map((m) =>
          m.id === membershipId
            ? {
                ...m,
                [field]: newVal,
              }
            : m
        ),
      };
    });

    setUpdatingMemberField(key);

    try {
      const currentMember = previousData?.members.find((m) => m.id === membershipId);
      const receivesLeads = field === 'receivesLeads' ? newVal : (currentMember?.receivesLeads ?? false);
      const availableForLeads = field === 'availableForLeads' ? newVal : (currentMember?.availableForLeads ?? true);

      const res = await authFetch('/api/v1/lead-intake', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'member',
          membershipId,
          receivesLeads,
          availableForLeads,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error || `Failed to update member (${res.status})`);
      }
    } catch (err) {
      setData(previousData);
      setError(err instanceof Error ? err.message : 'Could not update team member settings');
    } finally {
      setUpdatingMemberField(null);
    }
  }

  async function saveConnection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    let formNames;
    try {
      formNames = JSON.parse(String(form.get('formNames') || '{}'));
    } catch {
      setError('Enter form mappings as a valid JSON object.');
      return;
    }
    const ok = await mutate(
      {
        id: editing?.id,
        name: form.get('name'),
        provider,
        webhookSecret: secret,
        formNames,
        ...(provider === 'meta'
          ? {
              appSecret: form.get('appSecret'),
              pageAccessToken: form.get('pageAccessToken'),
              pageId: form.get('pageId'),
              graphVersion: form.get('graphVersion'),
            }
          : {}),
        enabled: editing?.enabled ?? true,
      },
      'POST'
    );
    if (ok) {
      setSecret('');
      setEditing(null);
    }
  }

  const copyToClipboard = (key: string, text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedMap((prev) => ({ ...prev, [key]: true }));
      setTimeout(() => {
        setCopiedMap((prev) => ({ ...prev, [key]: false }));
      }, 2000);
    });
  };

  // Extract human-friendly customer data from payload
  const extractCustomer = (submission: Submission) => {
    const payload = submission.payload || {};
    const answers = payload.answers || {};

    const name =
      payload.name ||
      answers['Full Name'] ||
      answers['Name'] ||
      answers['full_name'] ||
      answers['first_name'] ||
      'New Customer';

    const phone =
      payload.phone ||
      answers['Phone Number'] ||
      answers['Phone'] ||
      answers['phone_number'] ||
      null;

    const email =
      payload.email ||
      answers['Email Address'] ||
      answers['Email'] ||
      answers['email'] ||
      null;

    const destination =
      payload.destination ||
      answers['Destination'] ||
      answers['destination'] ||
      null;

    const month =
      payload.preferredTravelMonth ||
      answers['Preferred Travel Month'] ||
      answers['Travel Month'] ||
      null;

    const tourType = payload.tourType || answers['Tour Type'] || null;

    const notes =
      payload.notes ||
      answers['Travel Notes & Special Requirements'] ||
      answers['Notes'] ||
      null;

    return { name, phone, email, destination, month, tourType, notes, rawAnswers: answers };
  };

  // Convert technical Zod errors into clear human tips
  const parseHumanErrors = (errorStr: string | null): string[] => {
    if (!errorStr) return [];
    try {
      const parsed = JSON.parse(errorStr);
      if (Array.isArray(parsed)) {
        return parsed.map((issue: any) => {
          const path = issue.path ? issue.path.join('.') : '';
          if (path.includes('formName')) return 'Form title is empty or missing in Google Form.';
          if (path.includes('preferredTravelMonth'))
            return 'Preferred travel month format must be MM/YYYY (e.g. 12/2026).';
          if (path.includes('phone')) return 'Phone number requires country code (e.g. +919876543210).';
          if (path.includes('email')) return 'Invalid customer email address format.';
          return issue.message || `${path || 'Field'}: Invalid format`;
        });
      }
    } catch {}

    if (errorStr.includes('too_small') && errorStr.includes('formName')) {
      return ['Form title is missing. Please ensure your form has a title.'];
    }
    if (errorStr.includes('preferredTravelMonth')) {
      return ['Preferred travel month format must be MM/YYYY (e.g. 12/2026).'];
    }
    if (errorStr.includes('phone')) {
      return ['Phone number requires country code (e.g. +919876543210).'];
    }
    return [errorStr];
  };

  // Filtered submissions
  const filteredSubmissions = useMemo(() => {
    if (!data?.submissions) return [];
    return data.submissions.filter((s) => {
      // Status filter
      if (statusFilter === 'processed' && s.status !== 'processed') return false;
      if (statusFilter === 'failed' && s.status !== 'failed') return false;
      if (statusFilter === 'pending' && !['pending', 'processing'].includes(s.status)) return false;

      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const cust = extractCustomer(s);
        const matchName = cust.name.toLowerCase().includes(q);
        const matchPhone = cust.phone?.toLowerCase().includes(q);
        const matchEmail = cust.email?.toLowerCase().includes(q);
        const matchDest = cust.destination?.toLowerCase().includes(q);
        const matchId = s.externalId.toLowerCase().includes(q);
        return matchName || matchPhone || matchEmail || matchDest || matchId;
      }
      return true;
    });
  }, [data?.submissions, statusFilter, searchQuery]);

  // Statistics
  const stats = useMemo(() => {
    if (!data) return { total: 0, processed: 0, pending: 0, failed: 0 };
    const total = data.submissions.length;
    const processed = data.submissions.filter((s) => s.status === 'processed').length;
    const pending = data.submissions.filter((s) => ['pending', 'processing'].includes(s.status)).length;
    const failed = data.failedCount || data.submissions.filter((s) => s.status === 'failed').length;
    return { total, processed, pending, failed };
  }, [data]);

  if (!admin) {
    return (
      <div className="p-8 text-center bg-zinc-900 border border-zinc-800 rounded-2xl max-w-xl mx-auto my-12">
        <ShieldCheck className="w-12 h-12 text-zinc-500 mx-auto mb-3" />
        <h2 className="text-lg font-semibold text-white">Access Restricted</h2>
        <p className="text-sm text-zinc-400 mt-1">Lead intake and webhook settings are reserved for owners and administrators.</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-16">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-950/40">
              <Inbox className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                Lead Intake & Webhooks
              </h1>
              <p className="text-xs text-zinc-400 mt-0.5">
                Connect Google Forms, Meta & Google Ads to automatically capture and route enquiries.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => mutate({}, 'POST', '/api/v1/lead-intake/process')}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-950/50 transition disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} />
            Sync & Process Now
          </button>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="p-4 rounded-xl bg-red-950/50 border border-red-800/80 text-red-200 text-sm flex items-start gap-3 shadow-lg">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1">{error}</div>
        </div>
      )}
      {message && (
        <div className="p-4 rounded-xl bg-emerald-950/50 border border-emerald-800/80 text-emerald-200 text-sm flex items-start gap-3 shadow-lg">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          <div className="flex-1">{message}</div>
        </div>
      )}

      {/* Metric Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="p-4 rounded-xl bg-zinc-900/80 border border-zinc-800 shadow-sm flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center shrink-0">
            <Layers className="w-5 h-5 text-zinc-300" />
          </div>
          <div>
            <div className="text-xl font-bold text-white">{stats.total}</div>
            <div className="text-xs text-zinc-400">Total Submissions</div>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-zinc-900/80 border border-zinc-800 shadow-sm flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-lg bg-emerald-950/60 border border-emerald-800/50 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <div className="text-xl font-bold text-emerald-300">{stats.processed}</div>
            <div className="text-xs text-zinc-400">Successfully Processed</div>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-zinc-900/80 border border-zinc-800 shadow-sm flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-lg bg-amber-950/60 border border-amber-800/50 flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <div className="text-xl font-bold text-amber-300">{stats.pending}</div>
            <div className="text-xs text-zinc-400">In Queue / Pending</div>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-zinc-900/80 border border-zinc-800 shadow-sm flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-lg bg-red-950/60 border border-red-800/50 flex items-center justify-center shrink-0">
            <AlertCircle className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <div className="text-xl font-bold text-red-300">{stats.failed}</div>
            <div className="text-xs text-zinc-400">Failed / Needs Review</div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-zinc-800 gap-6">
        <button
          type="button"
          onClick={() => setActiveTab('submissions')}
          className={`pb-3 text-sm font-semibold flex items-center gap-2 transition relative ${
            activeTab === 'submissions'
              ? 'text-indigo-400 border-b-2 border-indigo-500'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Inbox className="w-4 h-4" />
          Incoming Submissions
          <span className="px-1.5 py-0.5 text-xs rounded-full bg-zinc-800 text-zinc-300">
            {stats.total}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('connections')}
          className={`pb-3 text-sm font-semibold flex items-center gap-2 transition relative ${
            activeTab === 'connections'
              ? 'text-indigo-400 border-b-2 border-indigo-500'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Radio className="w-4 h-4" />
          Connected Forms & Webhooks
          <span className="px-1.5 py-0.5 text-xs rounded-full bg-zinc-800 text-zinc-300">
            {data?.connections.length || 0}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('rotation')}
          className={`pb-3 text-sm font-semibold flex items-center gap-2 transition relative ${
            activeTab === 'rotation'
              ? 'text-indigo-400 border-b-2 border-indigo-500'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Users className="w-4 h-4" />
          Sales Team & Assignment
        </button>
      </div>

      {/* TAB 1: SUBMISSIONS FEED */}
      {activeTab === 'submissions' && (
        <div className="space-y-4">
          {/* Controls: Filter, Search, and Table/Card Toggle */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 rounded-xl bg-zinc-900/80 border border-zinc-800">
            {/* Status Filter Buttons */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  statusFilter === 'all'
                    ? 'bg-zinc-800 text-white shadow'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
                }`}
              >
                All ({stats.total})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('processed')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 ${
                  statusFilter === 'processed'
                    ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/50'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                Processed ({stats.processed})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('pending')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 ${
                  statusFilter === 'pending'
                    ? 'bg-amber-950/80 text-amber-300 border border-amber-800/50'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
                }`}
              >
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                Pending ({stats.pending})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('failed')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 ${
                  statusFilter === 'failed'
                    ? 'bg-red-950/80 text-red-300 border border-red-800/50'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
                }`}
              >
                <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                Failed ({stats.failed})
              </button>
            </div>

            {/* Right: Search & View Toggle */}
            <div className="flex items-center gap-2">
              <div className="relative w-full sm:w-60">
                <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Search name, phone, city..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-700/80 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Table / Card Toggle Buttons */}
              <div className="flex items-center bg-zinc-950 border border-zinc-800 rounded-lg p-0.5 shrink-0">
                <button
                  type="button"
                  title="Table View"
                  onClick={() => setViewMode('table')}
                  className={`p-1.5 rounded-md text-xs transition flex items-center gap-1 ${
                    viewMode === 'table'
                      ? 'bg-zinc-800 text-white shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <List className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  title="Cards View"
                  onClick={() => setViewMode('cards')}
                  className={`p-1.5 rounded-md text-xs transition flex items-center gap-1 ${
                    viewMode === 'cards'
                      ? 'bg-zinc-800 text-white shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Submissions Content: Table or Cards */}
          {filteredSubmissions.length === 0 ? (
            <div className="p-12 text-center bg-zinc-900/50 border border-zinc-800 rounded-2xl">
              <Inbox className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
              <h3 className="text-sm font-semibold text-zinc-200">No submissions found</h3>
              <p className="text-xs text-zinc-400 mt-1 max-w-sm mx-auto">
                {searchQuery || statusFilter !== 'all'
                  ? 'No incoming leads match your search or filter criteria.'
                  : 'Submit a response via your Google Form to see live leads stream here.'}
              </p>
            </div>
          ) : viewMode === 'table' ? (
            /* ========================================================================= */
            /* 1. PROFESSIONAL CRM DATA TABLE VIEW */
            /* ========================================================================= */
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 overflow-hidden shadow-lg">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-800 bg-zinc-950/70 text-zinc-400 font-semibold uppercase tracking-wider text-[11px]">
                      <th className="py-3.5 px-4">Customer</th>
                      <th className="py-3.5 px-4">Trip Requirements</th>
                      <th className="py-3.5 px-4">Source & Time</th>
                      <th className="py-3.5 px-4">Status & Details</th>
                      <th className="py-3.5 px-4">Tag</th>
                      <th className="py-3.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/80 text-zinc-200">
                    {filteredSubmissions.map((s) => {
                      const cust = extractCustomer(s);
                      const connection = data?.connections.find((c) => c.id === s.connectionId);
                      const humanErrors = parseHumanErrors(s.error);
                      const isExpanded = !!expandedPayloads[s.id];

                      return (
                        <tr key={s.id} className="hover:bg-zinc-800/30 transition-colors group">
                          {/* Column 1: Customer Details */}
                          <td className="py-3 px-4 align-top">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-700 to-emerald-600 flex items-center justify-center font-bold text-white text-xs shrink-0 shadow-sm">
                                {cust.name.slice(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <div className="font-semibold text-white text-sm">{cust.name}</div>
                                <div className="text-[11px] text-zinc-400 flex items-center gap-2 mt-0.5">
                                  {cust.phone && (
                                    <span className="flex items-center gap-1 font-mono text-zinc-300">
                                      <Phone className="w-3 h-3 text-zinc-500" />
                                      {cust.phone}
                                    </span>
                                  )}
                                  {cust.email && (
                                    <span className="flex items-center gap-1 text-zinc-400 truncate max-w-[150px]">
                                      <Mail className="w-3 h-3 text-zinc-500 shrink-0" />
                                      {cust.email}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Column 2: Trip Requirements */}
                          <td className="py-3 px-4 align-top">
                            <div className="space-y-1">
                              <div className="flex items-center gap-1 text-white font-medium">
                                <MapPin className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                                <span>{cust.destination || 'Not specified'}</span>
                              </div>
                              <div className="flex items-center gap-2 text-[11px] text-zinc-400">
                                {cust.month && (
                                  <span className="flex items-center gap-1">
                                    <Calendar className="w-3 h-3 text-zinc-500" />
                                    {cust.month}
                                  </span>
                                )}
                                {cust.tourType && (
                                  <span className="px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-300">
                                    {cust.tourType}
                                  </span>
                                )}
                              </div>
                              {cust.notes && (
                                <p className="text-[11px] text-zinc-400 line-clamp-1 italic max-w-xs">
                                  "{cust.notes}"
                                </p>
                              )}
                            </div>
                          </td>

                          {/* Column 3: Source & Time */}
                          <td className="py-3 px-4 align-top">
                            <div className="space-y-1">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-zinc-800/80 text-zinc-300 border border-zinc-700/80 font-mono">
                                {connection?.provider === 'google_forms' ? (
                                  <FileText className="w-3 h-3 text-purple-400" />
                                ) : connection?.provider === 'meta' ? (
                                  <Smartphone className="w-3 h-3 text-blue-400" />
                                ) : (
                                  <Globe className="w-3 h-3 text-emerald-400" />
                                )}
                                {connection?.name || 'Google Form'}
                              </span>
                              <div className="text-[11px] text-zinc-400">
                                {new Date(s.createdAt).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  month: 'short',
                                  day: 'numeric',
                                })}
                              </div>
                            </div>
                          </td>

                          {/* Column 4: Status & Human Error Messages */}
                          <td className="py-3 px-4 align-top max-w-xs">
                            <div className="space-y-1.5">
                              {s.status === 'processed' && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-950/80 border border-emerald-800/80 text-emerald-300">
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                  Processed
                                </span>
                              )}
                              {['pending', 'processing'].includes(s.status) && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-950/80 border border-amber-800/80 text-amber-300">
                                  <Clock className="w-3.5 h-3.5 text-amber-400 animate-spin" />
                                  Pending in Queue
                                </span>
                              )}
                              {s.status === 'failed' && (
                                <div className="space-y-1">
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-950/80 border border-red-800/80 text-red-300">
                                    <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                                    Failed ({s.attempts} tries)
                                  </span>
                                  <div className="text-[11px] text-red-300/90 bg-red-950/30 border border-red-900/50 p-1.5 rounded-md">
                                    {humanErrors[0] || 'Validation error'}
                                  </div>
                                </div>
                              )}
                              {s.status === 'ignored' && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-zinc-800 text-zinc-400">
                                  Ignored Test
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Column 5: Classification Tag (Hot, Warm, Cold) */}
                          <td className="py-3 px-4 align-top whitespace-nowrap">
                            <select
                              aria-label={`Tag of ${cust.name}`}
                              disabled={busy || !s.leadId}
                              value={s.lead?.temperature || 'warm'}
                              onChange={(e) => handleUpdateTemperature(s.id, s.leadId, e.target.value as EnquiryTag)}
                              className={`${controlStyle} border ${tagStyle[(s.lead?.temperature as EnquiryTag) || 'warm'] || 'border-zinc-700'}`}
                            >
                              {ENQUIRY_TAGS.map((tag) => (
                                <option key={tag} value={tag} className="bg-zinc-900 text-zinc-200">
                                  {ENQUIRY_TAG_LABELS[tag]}
                                </option>
                              ))}
                            </select>
                          </td>

                          {/* Column 6: Action Buttons */}
                          <td className="py-3 px-4 align-top text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {s.status === 'failed' && (
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => mutate({ action: 'retry', id: s.id })}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition"
                                >
                                  <RefreshCw className="w-3 h-3 text-zinc-400" />
                                  Retry
                                </button>
                              )}

                              {s.leadId && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenLead(s.leadId!)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-indigo-950/80 hover:bg-indigo-900 border border-indigo-800 text-indigo-300 transition"
                                >
                                  Open Lead
                                  <ExternalLink className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            /* ========================================================================= */
            /* 2. CARDS VIEW (ALTERNATIVE VIEW) */
            /* ========================================================================= */
            <div className="space-y-3">
              {filteredSubmissions.map((s) => {
                const cust = extractCustomer(s);
                const connection = data?.connections.find((c) => c.id === s.connectionId);
                const humanErrors = parseHumanErrors(s.error);
                const isExpanded = !!expandedPayloads[s.id];

                return (
                  <div
                    key={s.id}
                    className="p-5 rounded-xl bg-zinc-900/80 border border-zinc-800 hover:border-zinc-700/80 transition-all shadow-md space-y-4"
                  >
                    {/* Header Row */}
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-700 to-emerald-600 flex items-center justify-center font-bold text-white text-sm shadow-md">
                          {cust.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-white text-base">{cust.name}</span>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-zinc-800 text-zinc-300 border border-zinc-700 font-mono">
                              {connection?.provider === 'google_forms' ? (
                                <FileText className="w-3 h-3 text-purple-400" />
                              ) : connection?.provider === 'meta' ? (
                                <Smartphone className="w-3 h-3 text-blue-400" />
                              ) : (
                                <Globe className="w-3 h-3 text-emerald-400" />
                              )}
                              {connection?.name || 'Form'}
                            </span>
                          </div>
                          <div className="text-xs text-zinc-400 flex items-center gap-2 mt-0.5">
                            <span>ID: <code className="text-zinc-500 font-mono">{s.externalId.slice(0, 24)}...</code></span>
                            <span>·</span>
                            <span>{new Date(s.createdAt).toLocaleString()}</span>
                          </div>
                        </div>
                      </div>

                      {/* Status & Action */}
                      <div className="flex items-center gap-2">
                        {s.status === 'processed' && (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-950/80 border border-emerald-800/80 text-emerald-300">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                            Processed
                          </span>
                        )}
                        {['pending', 'processing'].includes(s.status) && (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-950/80 border border-amber-800/80 text-amber-300">
                            <Clock className="w-3.5 h-3.5 text-amber-400 animate-spin" />
                            Processing in Queue
                          </span>
                        )}
                        {s.leadId && (
                          <select
                            aria-label={`Tag of ${cust.name}`}
                            disabled={busy}
                            value={s.lead?.temperature || 'warm'}
                            onChange={(e) => handleUpdateTemperature(s.id, s.leadId, e.target.value as EnquiryTag)}
                            className={`${controlStyle} border ${tagStyle[(s.lead?.temperature as EnquiryTag) || 'warm'] || 'border-zinc-700'}`}
                          >
                            {ENQUIRY_TAGS.map((tag) => (
                              <option key={tag} value={tag} className="bg-zinc-900 text-zinc-200">
                                {ENQUIRY_TAG_LABELS[tag]}
                              </option>
                            ))}
                          </select>
                        )}

                        {s.status === 'failed' && (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-red-950/80 border border-red-800/80 text-red-300">
                            <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                            Failed ({s.attempts} attempts)
                          </span>
                        )}

                        {s.status === 'failed' && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => mutate({ action: 'retry', id: s.id })}
                            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition"
                          >
                            <RefreshCw className="w-3 h-3 text-zinc-400" />
                            Retry Import
                          </button>
                        )}

                        {s.leadId && (
                          <button
                            type="button"
                            onClick={() => handleOpenLead(s.leadId!)}
                            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium bg-indigo-950/80 hover:bg-indigo-900 border border-indigo-800 text-indigo-300 transition"
                          >
                            View Lead
                            <ExternalLink className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Customer & Trip Details */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 pt-2 border-t border-zinc-800/60 text-xs">
                      <div className="flex items-center gap-2 text-zinc-300">
                        <Phone className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                        <span className="font-mono">{cust.phone || 'No phone'}</span>
                      </div>
                      <div className="flex items-center gap-2 text-zinc-300 truncate">
                        <Mail className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                        <span className="truncate">{cust.email || 'No email'}</span>
                      </div>
                      <div className="flex items-center gap-2 text-zinc-300">
                        <MapPin className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                        <span>{cust.destination ? `Destination: ${cust.destination}` : 'Destination: Not specified'}</span>
                      </div>
                      <div className="flex items-center gap-2 text-zinc-300">
                        <Calendar className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                        <span>{cust.month ? `Month: ${cust.month}` : 'Flexible dates'}</span>
                      </div>
                    </div>

                    {/* Humanized Error Banner */}
                    {s.status === 'failed' && (
                      <div className="p-3.5 rounded-xl bg-red-950/40 border border-red-800/60 text-xs space-y-1.5">
                        <div className="font-semibold text-red-300 flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                          Validation Notice & Fix Needed:
                        </div>
                        <ul className="list-disc list-inside text-red-200/90 space-y-0.5 pl-1">
                          {humanErrors.map((err, idx) => (
                            <li key={idx}>{err}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: CONNECTED FORMS & WEBHOOKS */}
      {activeTab === 'connections' && (
        <div className="space-y-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <Radio className="w-4 h-4 text-indigo-400" />
                Connected Forms ({data?.connections.length || 0})
              </h2>
              <button
                type="button"
                onClick={() => {
                  setEditing(null);
                  setSecret('');
                  setTimeout(() => {
                    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    const input = formRef.current?.querySelector('input[name="name"]') as HTMLInputElement | null;
                    input?.focus();
                  }, 50);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-sm transition"
              >
                + Add Connection
              </button>
            </div>

            {data?.connections.length === 0 ? (
              <p className="text-sm text-zinc-400 p-6 bg-zinc-900 border border-zinc-800 rounded-xl">
                No forms connected yet. Create your first connection below to generate a webhook URL.
              </p>
            ) : (
              <div className="grid gap-3.5 sm:grid-cols-2">
                {data?.connections.map((c) => {
                  const webhookUrl = `${origin}/api/v1/webhooks/leads/${c.id}`;
                  const isCopied = !!copiedMap[c.id];

                  return (
                    <div
                      key={c.id}
                      className="p-5 rounded-xl bg-zinc-900/90 border border-zinc-800 space-y-4 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-white text-base">{c.name}</h3>
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-mono bg-zinc-800 text-zinc-300 border border-zinc-700">
                              {c.provider}
                            </span>
                          </div>
                          <p className="text-xs text-zinc-400 mt-1">
                            {c.lastReceivedAt
                              ? `Last received: ${new Date(c.lastReceivedAt).toLocaleString()}`
                              : 'No submissions received yet'}
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2.5 py-1 rounded-full text-[11px] font-semibold flex items-center gap-1.5 ${
                              c.enabled
                                ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/80'
                                : 'bg-zinc-800/90 text-zinc-400 border border-zinc-700'
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                c.enabled ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-500'
                              }`}
                            />
                            {c.enabled ? 'Active' : 'Paused'}
                          </span>
                        </div>
                      </div>

                      {/* 1. For Standard Webhook Integrations (Google Forms, Google Ads, Meta, Generic) */}
                      {c.provider !== 'hosted_form' && c.provider !== 'website' && (
                        <div className="space-y-1">
                          <label className="text-[11px] font-medium text-zinc-400">Webhook URL</label>
                          <div className="flex items-center gap-2">
                            <input
                              readOnly
                              value={webhookUrl}
                              onFocus={(e) => e.target.select()}
                              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs font-mono text-zinc-200 select-all"
                            />
                            <button
                              type="button"
                              onClick={() => copyToClipboard(c.id, webhookUrl)}
                              className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-xs font-medium text-white flex items-center gap-1.5 transition shrink-0"
                            >
                              {isCopied ? (
                                <>
                                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                                  <span className="text-emerald-300">Copied!</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3.5 h-3.5" />
                                  Copy
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* 2. For Custom Website Form (Headless API Integration) */}
                      {c.provider === 'website' && (() => {
                        const publicApiUrl = `${origin}/api/v1/public/enquiry/${c.id}`;
                        const isCopiedAll = !!copiedMap[`api_${c.id}`];
                        const samplePayload = {
                          name: "Customer Name",
                          phone: "+919876543210",
                          email: "customer@example.com",
                          destination: "Paris, France",
                          preferredTravelMonth: "October 2026",
                          tourType: "Family Vacation",
                          numberOfChildren: 0,
                          city: "Chennai",
                          specialRequirements: "Pure vegetarian food",
                          notes: "Need 5-star package quote",
                          bot_trap: ""
                        };
                        const fullSpec = `=== TravelAgent Website Form API Integration ===
Endpoint: POST ${publicApiUrl}

Headers:
Content-Type: application/json
x-org-id: ${currentOrg?.id || ''}
x-lead-secret: ${c.webhookSecret || ''}

Request Body (JSON):
${JSON.stringify(samplePayload, null, 2)}`;

                        return (
                          <div className="space-y-3 p-3.5 rounded-xl bg-zinc-950/80 border border-emerald-900/50 text-xs">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold text-emerald-400 flex items-center gap-1.5">
                                <Code2 className="w-4 h-4 text-emerald-400" />
                                Website API & Payload Details
                              </span>
                              <button
                                type="button"
                                onClick={() => copyToClipboard(`api_${c.id}`, fullSpec)}
                                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs flex items-center gap-1.5 transition shadow-sm shrink-0"
                              >
                                {isCopiedAll ? (
                                  <>
                                    <Check className="w-3.5 h-3.5 text-white" />
                                    <span>Copied All Details!</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3.5 h-3.5" />
                                    <span>Copy All Details</span>
                                  </>
                                )}
                              </button>
                            </div>

                            <div className="space-y-1">
                              <label className="text-[11px] font-medium text-zinc-400">Endpoint URL (POST)</label>
                              <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 font-mono text-[11px] text-zinc-200 select-all break-all">
                                {publicApiUrl}
                              </div>
                            </div>

                            <div className="space-y-1">
                              <label className="text-[11px] font-medium text-zinc-400">Required Headers</label>
                              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 font-mono text-[11px] text-zinc-300 space-y-1">
                                <div><span className="text-zinc-500">Content-Type:</span> application/json</div>
                                <div><span className="text-zinc-500">x-org-id:</span> <span className="text-emerald-300 font-semibold">{currentOrg?.id || '—'}</span></div>
                                <div><span className="text-zinc-500">x-lead-secret:</span> <span className="text-amber-300 font-semibold">{c.webhookSecret || '••••••••'}</span></div>
                              </div>
                            </div>

                            <div className="space-y-1">
                              <label className="text-[11px] font-medium text-zinc-400">Payload Fields (JSON Body)</label>
                              <pre className="bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 font-mono text-[11px] text-zinc-300 overflow-x-auto max-h-48 whitespace-pre">
                                {JSON.stringify(samplePayload, null, 2)}
                              </pre>
                            </div>
                          </div>
                        );
                      })()}

                      {/* 2. For Hosted Public Form (Branded Page) */}
                      {c.provider === 'hosted_form' && (
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <label className="text-[11px] font-medium text-indigo-300 flex items-center gap-1">
                              <Sparkles className="w-3 h-3 text-indigo-400" />
                              Public Form Link
                            </label>
                            <a
                              href={`/enquiry/form/${c.id}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[10px] text-indigo-400 hover:underline flex items-center gap-1"
                            >
                              Open Form <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              readOnly
                              value={`${origin}/enquiry/form/${c.id}`}
                              onFocus={(e) => e.target.select()}
                              className="w-full bg-zinc-950/80 border border-indigo-950 rounded-lg px-3 py-2 text-xs font-mono text-indigo-200 select-all"
                            />
                            <button
                              type="button"
                              onClick={() => copyToClipboard(`form_${c.id}`, `${origin}/enquiry/form/${c.id}`)}
                              className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white flex items-center gap-1.5 transition shrink-0"
                            >
                              {copiedMap[`form_${c.id}`] ? (
                                <>
                                  <Check className="w-3.5 h-3.5 text-white" />
                                  <span>Copied!</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3.5 h-3.5" />
                                  Copy Link
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      )}

                      <div className="flex items-center justify-end gap-2 pt-1 border-t border-zinc-800/60">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleStartEdit(c)}
                          className="text-xs text-indigo-400 hover:text-indigo-300 font-medium transition flex items-center gap-1"
                        >
                          Edit / rotate credentials &rarr;
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Add / Edit Connection Form */}
          <div
            ref={formRef}
            id="connection-form"
            className={`p-6 rounded-2xl bg-zinc-900/90 border transition-all duration-300 space-y-5 scroll-mt-6 ${
              editing
                ? 'border-indigo-500/80 ring-2 ring-indigo-500/20 shadow-xl shadow-indigo-950/40'
                : 'border-zinc-800'
            }`}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-white text-base flex items-center gap-2">
                {editing ? (
                  <>
                    <span>Edit Connection: <span className="text-indigo-400">{editing.name}</span></span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                      Editing
                    </span>
                  </>
                ) : (
                  'Connect a New Form / Webhook'
                )}
              </h3>
              {editing && (
                <button
                  type="button"
                  onClick={() => {
                    setEditing(null);
                    setSecret('');
                  }}
                  className="text-xs text-zinc-400 hover:text-zinc-200 px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition"
                >
                  Cancel Edit
                </button>
              )}
            </div>

            <form key={editing?.id || 'new'} onSubmit={saveConnection} className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5">Connection Name</label>
                  <input
                    name="name"
                    defaultValue={editing?.name}
                    placeholder="e.g. Website Holiday Enquiry"
                    required
                    maxLength={100}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5">Platform</label>
                  <select
                    disabled={!!editing}
                    value={provider}
                    onChange={(e) => {
                      const val = e.target.value;
                      setProvider(val);
                      if ((val === 'hosted_form' || val === 'website') && !secret) {
                        setSecret(
                          Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
                            b.toString(16).padStart(2, '0')
                          ).join('')
                        );
                      }
                    }}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="google_forms">Google Forms</option>
                    <option value="hosted_form">Hosted Public Form (Branded Page)</option>
                    <option value="meta">Meta Lead Ads</option>
                    <option value="google_ads">Google Ads</option>
                    <option value="website">Custom Website Form</option>
                    <option value="generic">Other / Generic Webhook</option>
                  </select>
                </div>
              </div>

              {/* Webhook Secret */}
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                  {provider === 'meta'
                    ? 'Webhook Verification Token'
                    : provider === 'hosted_form'
                    ? 'Security Token (Auto-generated)'
                    : provider === 'website'
                    ? 'Website API Secret Token (Auto-generated)'
                    : 'Webhook Secret Token'}
                </label>
                <div className="flex gap-2">
                  <input
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={24}
                    maxLength={256}
                    value={secret}
                    onChange={(e) => setSecret(e.target.value)}
                    placeholder={
                      provider === 'hosted_form' || provider === 'website'
                        ? 'Auto-generated security token'
                        : 'Click Generate to create a 32-character secret...'
                    }
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setSecret(
                        Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
                          b.toString(16).padStart(2, '0')
                        ).join('')
                      )
                    }
                    className="px-3.5 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-xs font-medium text-white transition shrink-0"
                  >
                    Generate
                  </button>
                  <button
                    type="button"
                    disabled={!secret}
                    onClick={() => {
                      navigator.clipboard.writeText(secret);
                      setMessage('Secret copied to clipboard.');
                    }}
                    className="px-3.5 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-xs font-medium text-white transition shrink-0 disabled:opacity-40"
                  >
                    Copy
                  </button>
                </div>
              </div>

              {/* Meta Specific */}
              {provider === 'meta' && (
                <div className="grid sm:grid-cols-2 gap-4 p-4 rounded-xl bg-zinc-950 border border-zinc-800">
                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1">Meta App Secret</label>
                    <input
                      type="password"
                      name="appSecret"
                      autoComplete="new-password"
                      required
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-2 text-sm text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1">Page Access Token</label>
                    <input
                      type="password"
                      name="pageAccessToken"
                      autoComplete="new-password"
                      required
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-2 text-sm text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1">Page ID</label>
                    <input
                      name="pageId"
                      required
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-2 text-sm text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1">Graph API Version</label>
                    <input
                      name="graphVersion"
                      placeholder="e.g. v20.0"
                      required
                      pattern="v[0-9]+\.[0-9]+"
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-2 text-sm text-white"
                    />
                  </div>
                </div>
              )}

              {/* Custom Website Form API Card Preview */}
              {provider === 'website' && (
                <div className="p-4 rounded-xl bg-zinc-950 border border-emerald-900/60 space-y-3">
                  <div className="flex items-center gap-2 text-emerald-400 font-semibold text-xs">
                    <Code2 className="w-4 h-4 text-emerald-400" />
                    Custom Website API & Payload Preview
                  </div>
                  <p className="text-[11px] text-zinc-400">
                    Connect any website (WordPress, PHP, React, Webflow, etc.) directly to your CRM.
                    When saved, a live endpoint URL and credentials will be generated with 1-click copy for your developer.
                  </p>

                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-zinc-400">Endpoint Format</label>
                    <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 font-mono text-[11px] text-zinc-300">
                      POST {origin}/api/v1/public/enquiry/{editing ? editing.id : '[connection_id]'}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-zinc-400">Required Request Headers</label>
                    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 font-mono text-[11px] text-zinc-300 space-y-1">
                      <div><span className="text-zinc-500">Content-Type:</span> application/json</div>
                      <div><span className="text-zinc-500">x-org-id:</span> <span className="text-emerald-300 font-semibold">{currentOrg?.id || 'your_org_id'}</span></div>
                      <div><span className="text-zinc-500">x-lead-secret:</span> <span className="text-amber-300 font-semibold">{secret || '(Click Generate or save to assign secret)'}</span></div>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-zinc-400">Accepted Payload Fields (JSON)</label>
                    <pre className="bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 font-mono text-[11px] text-zinc-300 overflow-x-auto max-h-40 whitespace-pre">
{JSON.stringify({
  name: "Customer Name",
  phone: "+919876543210",
  email: "customer@example.com",
  destination: "Paris, France",
  preferredTravelMonth: "October 2026",
  tourType: "Family Vacation",
  numberOfAdults: 2,
  numberOfChildren: 0,
  city: "Chennai",
  specialRequirements: "Pure vegetarian food",
  notes: "Looking for 5-star package",
  bot_trap: ""
}, null, 2)}
                    </pre>
                  </div>
                </div>
              )}

              {/* Form ID Mappings */}
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                  Form ID &rarr; Exact Form Name (Optional JSON)
                </label>
                <textarea
                  name="formNames"
                  rows={2}
                  defaultValue={JSON.stringify(editing?.formNames || {}, null, 2)}
                  placeholder={'{"12345": "Summer Holiday Enquiry"}'}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-2 text-xs font-mono text-zinc-200"
                />
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="submit"
                  disabled={busy}
                  className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm transition shadow-md shadow-indigo-950/40 disabled:opacity-50"
                >
                  Save Connection
                </button>
                {editing && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(null);
                      setSecret('');
                    }}
                    className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm transition"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TAB 3: SALES TEAM & ROTATION */}
      {activeTab === 'rotation' && (
        <div className="space-y-6">
          <div className="p-5 rounded-xl bg-zinc-900 border border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="font-semibold text-white text-sm flex items-center gap-2">
                <Clock className="w-4 h-4 text-indigo-400" />
                First-Contact Deadline (SLA)
              </h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                Target time limit for agents to make first contact with incoming leads.
              </p>
            </div>
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                mutate({ action: 'deadline', minutes: Number(form.get('minutes')) });
              }}
            >
              <input
                key={data?.firstContactMinutes}
                defaultValue={data?.firstContactMinutes || 30}
                name="minutes"
                type="number"
                min={1}
                max={10080}
                required
                className="w-24 bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-white"
              />
              <span className="text-xs text-zinc-400 mr-1">minutes</span>
              <button
                type="submit"
                disabled={busy}
                className="px-3.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-xs font-semibold text-white transition disabled:opacity-50"
              >
                Save
              </button>
            </form>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-white text-sm flex items-center gap-2">
                <Users className="w-4 h-4 text-indigo-400" />
                Enrolled Team Members & Lead Routing
              </h3>
              <button
                type="button"
                disabled={busy}
                onClick={() => load().catch((e) => setError(e.message))}
                className="text-xs text-indigo-400 hover:text-indigo-300 transition"
              >
                Refresh Phone Status
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {data?.members
                .filter((m) => m.role !== 'viewer')
                .map((m) => (
                  <div
                    key={m.id}
                    className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 flex items-start justify-between gap-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center font-bold text-white text-xs">
                        {m.user.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-medium text-sm text-white flex items-center gap-2">
                          {m.user.name}
                          <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                            {m.role === 'operator' ? 'sales' : m.role}
                          </span>
                        </div>
                        {m.phoneReadiness && (
                          <div
                            className={`text-[11px] mt-0.5 flex items-center gap-1 ${
                              m.phoneReadiness.canReceiveNewCalls ? 'text-emerald-400' : 'text-amber-400'
                            }`}
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-current" />
                            {m.phoneReadiness.reason}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 shrink-0">
                      <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          disabled={updatingMemberField === `${m.id}-receivesLeads` || m.user.status !== 'active'}
                          checked={m.receivesLeads}
                          onChange={(e) =>
                            handleToggleMember(m.id, 'receivesLeads', e.target.checked)
                          }
                          className="rounded border-zinc-700 bg-zinc-950 text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer disabled:opacity-50"
                        />
                        Receives Leads
                      </label>

                      <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          disabled={updatingMemberField === `${m.id}-availableForLeads` || m.user.status !== 'active'}
                          checked={m.availableForLeads}
                          onChange={(e) =>
                            handleToggleMember(m.id, 'availableForLeads', e.target.checked)
                          }
                          className="rounded border-zinc-700 bg-zinc-950 text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer disabled:opacity-50"
                        />
                        Available Now
                      </label>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
