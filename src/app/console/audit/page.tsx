'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Loader2,
  Search,
  Calendar,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Filter,
  X,
} from 'lucide-react';
import { useConsole } from '@/context/ConsoleContext';

type DatePreset = 'all' | 'today' | 'yesterday' | '7d' | '30d' | 'custom';
type ActivityCategory = 'all' | 'auth.' | 'lead.' | 'enquiry.' | 'call.' | 'lead_intake.' | 'settings.';

function toLocalDateTimeInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatAuditAction(action: string): string {
  const map: Record<string, string> = {
    'auth.login': 'User Sign In',
    'auth.refresh': 'Session Refreshed',
    'auth.signup': 'User Sign Up',
    'auth.switch_org': 'Organization Switched',
    'lead.create': 'New Lead Created',
    'lead.qualify': 'Lead Stage Updated',
    'lead.import': 'Lead Imported',
    'enquiry.create': 'New Enquiry Created',
    'enquiry.update': 'Enquiry Details Updated',
    'contact.update': 'Contact Updated',
    'lead_intake.member': 'Lead Routing Updated',
    'lead_connection.save': 'Lead Channel Saved',
    'itinerary.options.create': 'Itinerary Created',
    'itinerary.option.apply': 'Itinerary Option Applied',
    'itinerary.rules.update': 'Itinerary Rules Updated',
    'call.link_enquiry': 'Call Linked to Enquiry',
    'call.convert_enquiry': 'Call Converted to Enquiry',
    'call.create': 'Call Initiated',
    'message.send': 'Message Sent',
    'settings.update': 'Settings Updated',
    'settings.integrations.update': 'Integration Updated',
    'numbers.buy': 'Phone Number Purchased',
    'users.invite': 'Staff Added',
    'users.update': 'Staff Updated',
  };

  if (map[action]) return map[action];

  return action
    .split('.')
    .map((part) =>
      part
        .split('_')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ')
    )
    .join(' - ');
}

function getAuditDescription(log: any): string {
  const actorName =
    log.actor?.name ||
    log.actor?.email ||
    log.actorLabel ||
    (log.actorType === 'webhook' ? 'Webhook' : log.actorType === 'system' ? 'System' : 'Staff');

  const meta = log.metadata || {};

  switch (log.action) {
    case 'auth.login':
      return `${actorName} signed in to the console`;
    case 'auth.refresh':
      return `Session token refreshed`;
    case 'auth.signup':
      return `New staff account registered`;
    case 'lead.qualify': {
      const details: string[] = [];
      if (meta.temperature) details.push(`tag marked as ${meta.temperature.toUpperCase()}`);
      if (meta.stage) details.push(`stage set to ${meta.stage}`);
      if (meta.destination) details.push(`destination: ${meta.destination}`);
      const extra = details.length > 0 ? ` (${details.join(', ')})` : '';
      return `${actorName} updated lead qualification${extra}`;
    }
    case 'lead.create':
      return `${actorName} created a new travel lead`;
    case 'enquiry.update': {
      const fields = Array.isArray(meta.fields)
        ? meta.fields.filter((f: string) => f !== 'expectedUpdatedAt')
        : [];
      const hasTag = fields.includes('temperature') || fields.includes('enquiryTag');
      const hasStatus = fields.includes('enquiryStatus') || fields.includes('status');
      
      let changeDesc = '';
      if (hasTag && hasStatus) {
        changeDesc = 'tag & status';
      } else if (hasTag) {
        changeDesc = meta.enquiryTag ? `tag to ${String(meta.enquiryTag).toUpperCase()}` : 'tag';
      } else if (hasStatus) {
        changeDesc = meta.enquiryStatus ? `status to ${meta.enquiryStatus}` : 'status';
      } else if (fields.length > 0) {
        changeDesc = fields.join(', ');
      }

      return changeDesc
        ? `${actorName} updated enquiry (${changeDesc})`
        : `${actorName} updated enquiry details`;
    }
    case 'enquiry.create': {
      const tagInfo = meta.enquiryTag ? ` with tag ${String(meta.enquiryTag).toUpperCase()}` : '';
      return `${actorName} created a new customer enquiry${tagInfo}`;
    }
    case 'contact.update':
      return `${actorName} updated contact details`;
    case 'lead_intake.member': {
      if (meta.receivesLeads === false) {
        return `${actorName} paused lead allocation for staff`;
      } else if (meta.receivesLeads === true) {
        return `${actorName} enabled lead allocation for staff`;
      }
      return `${actorName} updated staff lead distribution rules`;
    }
    case 'lead_connection.save':
      return `${actorName} updated lead intake channel connection`;
    case 'call.link_enquiry':
      return `${actorName} linked call recording to customer enquiry`;
    case 'call.convert_enquiry':
      return `${actorName} converted call into customer enquiry`;
    case 'itinerary.option.apply':
      return `${actorName} applied itinerary option to lead`;
    case 'itinerary.options.create':
      return `${actorName} generated itinerary options`;
    case 'settings.update':
      return `${actorName} updated organization settings`;
    case 'numbers.buy':
      return `${actorName} purchased a virtual phone number`;
    default:
      return `${actorName} performed ${formatAuditAction(log.action)}`;
  }
}

export default function AuditPage() {
  const { auditLogs: initialLogs, authFetch } = useConsole();

  const [logs, setLogs] = useState<any[]>(initialLogs || []);
  const [totalCount, setTotalCount] = useState<number>(initialLogs?.length || 0);
  const [loading, setLoading] = useState<boolean>(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [category, setCategory] = useState<ActivityCategory>('all');
  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  const [startDateInput, setStartDateInput] = useState('');
  const [endDateInput, setEndDateInput] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(50);

  // Modal
  const [selectedLogMetadata, setSelectedLogMetadata] = useState<any | null>(null);

  const didInitialFetch = useRef(false);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Handle date preset change
  const handleSelectDatePreset = (preset: DatePreset) => {
    setDatePreset(preset);
    setPage(1);
    const now = new Date();

    if (preset === 'all') {
      setStartDateInput('');
      setEndDateInput('');
    } else if (preset === 'today') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
      setStartDateInput(toLocalDateTimeInputValue(start));
      setEndDateInput(toLocalDateTimeInputValue(end));
    } else if (preset === 'yesterday') {
      const y = new Date(now);
      y.setDate(now.getDate() - 1);
      const start = new Date(y.getFullYear(), y.getMonth(), y.getDate(), 0, 0, 0);
      const end = new Date(y.getFullYear(), y.getMonth(), y.getDate(), 23, 59, 59);
      setStartDateInput(toLocalDateTimeInputValue(start));
      setEndDateInput(toLocalDateTimeInputValue(end));
    } else if (preset === '7d') {
      const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      setStartDateInput(toLocalDateTimeInputValue(start));
      setEndDateInput(toLocalDateTimeInputValue(now));
    } else if (preset === '30d') {
      const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      setStartDateInput(toLocalDateTimeInputValue(start));
      setEndDateInput(toLocalDateTimeInputValue(now));
    }
  };

  const handleClearFilters = () => {
    setSearchQuery('');
    setDebouncedSearch('');
    setCategory('all');
    setDatePreset('all');
    setStartDateInput('');
    setEndDateInput('');
    setPage(1);
  };

  // Fetch audit logs
  const fetchAuditLogs = useCallback(async () => {
    if (!authFetch) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(pageSize));

      if (debouncedSearch) {
        params.set('search', debouncedSearch);
      }

      if (category !== 'all') {
        params.set('action', category);
      }

      if (datePreset !== 'all' && datePreset !== 'custom') {
        params.set('dateRange', datePreset);
      } else if (startDateInput || endDateInput) {
        if (startDateInput) {
          const sd = new Date(startDateInput);
          if (!Number.isNaN(sd.getTime())) params.set('startDate', sd.toISOString());
        }
        if (endDateInput) {
          const ed = new Date(endDateInput);
          if (!Number.isNaN(ed.getTime())) params.set('endDate', ed.toISOString());
        }
      }

      const res = await authFetch(`/api/v1/audit?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(Array.isArray(data.objects) ? data.objects : []);
        setTotalCount(typeof data.totalCount === 'number' ? data.totalCount : (data.objects?.length || 0));
      }
    } catch (err) {
      console.error('Failed to fetch audit logs:', err);
    } finally {
      setLoading(false);
    }
  }, [authFetch, page, pageSize, debouncedSearch, category, datePreset, startDateInput, endDateInput]);

  useEffect(() => {
    fetchAuditLogs();
  }, [fetchAuditLogs]);

  useEffect(() => {
    if (!didInitialFetch.current && initialLogs?.length && logs.length === 0) {
      setLogs(initialLogs);
      setTotalCount(initialLogs.length);
      didInitialFetch.current = true;
    }
  }, [initialLogs, logs.length]);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const hasActiveFilters = Boolean(
    debouncedSearch || category !== 'all' || datePreset !== 'all' || startDateInput || endDateInput
  );

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white">Audit Log</h2>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1">
            Historical and real-time records of staff activity, data updates, logins, and system changes.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fetchAuditLogs()}
            disabled={loading}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 flex items-center gap-1.5 transition disabled:opacity-50"
            title="Refresh Audit Logs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-zinc-300' : 'text-zinc-400'}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Search Query */}
          <div className="relative">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search action, actor, target..."
              className="w-full pl-9 pr-8 py-1.5 text-xs rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-700"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Activity Category Filter */}
          <div>
            <select
              value={category}
              onChange={(e) => {
                setCategory(e.target.value as ActivityCategory);
                setPage(1);
              }}
              className="w-full px-3 py-1.5 text-xs rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200 focus:outline-none focus:border-zinc-700 cursor-pointer"
            >
              <option value="all">All Activities</option>
              <option value="auth.">Authentication & Logins</option>
              <option value="lead.">Leads & Itineraries</option>
              <option value="enquiry.">Enquiries & Contacts</option>
              <option value="call.">Calls & Telephony</option>
              <option value="lead_intake.">Lead Routing</option>
              <option value="settings.">Settings</option>
            </select>
          </div>

          {/* Date Range Preset */}
          <div className="relative">
            <Calendar className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <select
              value={datePreset}
              onChange={(e) => handleSelectDatePreset(e.target.value as DatePreset)}
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200 focus:outline-none focus:border-zinc-700 appearance-none cursor-pointer"
            >
              <option value="all">All Time (Historical & Current)</option>
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
              <option value="custom">Custom Date Range...</option>
            </select>
          </div>

          {/* Page Size */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-400 whitespace-nowrap">Show:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200 focus:outline-none focus:border-zinc-700 cursor-pointer"
            >
              <option value={25}>25 per page</option>
              <option value={50}>50 per page</option>
              <option value={100}>100 per page</option>
            </select>
          </div>

          {/* Reset Filters */}
          <div className="flex items-center justify-end">
            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleClearFilters}
                className="text-xs text-zinc-400 hover:text-zinc-200 flex items-center gap-1 transition"
              >
                <X className="w-3.5 h-3.5" />
                <span>Reset Filters</span>
              </button>
            )}
          </div>
        </div>

        {/* Custom Date Pickers */}
        {datePreset === 'custom' && (
          <div className="pt-2 border-t border-zinc-800/60 flex flex-wrap items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="text-zinc-400">From:</span>
              <input
                type="datetime-local"
                value={startDateInput}
                onChange={(e) => {
                  setStartDateInput(e.target.value);
                  setPage(1);
                }}
                className="px-2.5 py-1 rounded bg-zinc-950 border border-zinc-800 text-zinc-200 focus:outline-none focus:border-zinc-700"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-zinc-400">To:</span>
              <input
                type="datetime-local"
                value={endDateInput}
                onChange={(e) => {
                  setEndDateInput(e.target.value);
                  setPage(1);
                }}
                className="px-2.5 py-1 rounded bg-zinc-950 border border-zinc-800 text-zinc-200 focus:outline-none focus:border-zinc-700"
              />
            </div>
          </div>
        )}
      </div>

      {/* Audit Log Table */}
      <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-left text-xs">
            <thead className="bg-zinc-900/80 border-b border-zinc-800 text-zinc-400 font-medium">
              <tr>
                <th className="py-3 px-4 w-[160px]">Timestamp</th>
                <th className="py-3 px-4">Activity</th>
                <th className="py-3 px-4 w-[130px]">Target</th>
                <th className="py-3 px-4 w-[160px]">Performed By</th>
                <th className="py-3 px-4 w-[140px]">IP Address</th>
                <th className="py-3 px-4 text-right w-[90px]">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
              {loading && logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-zinc-500">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto text-zinc-400 mb-2" />
                    <span>Loading audit records...</span>
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-zinc-500">
                    <Filter className="w-5 h-5 mx-auto text-zinc-600 mb-2" />
                    <span>No audit logs found matching the selected criteria.</span>
                    {hasActiveFilters && (
                      <div className="mt-2">
                        <button
                          type="button"
                          onClick={handleClearFilters}
                          className="text-xs text-zinc-400 hover:text-zinc-200 underline"
                        >
                          Clear filters to see all records
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  const hasMetadata = log.metadata && Object.keys(log.metadata).length > 0;
                  const dateObj = new Date(log.createdAt);
                  const formattedDate = !Number.isNaN(dateObj.getTime())
                    ? dateObj.toLocaleString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : log.createdAt;

                  const actionTitle = formatAuditAction(log.action);
                  const activityDesc = getAuditDescription(log);

                  const targetLabel = log.targetType || 'System';
                  const shortTargetId =
                    log.targetId && log.targetId.length > 8
                      ? `#${log.targetId.substring(0, 8)}`
                      : log.targetId
                      ? `#${log.targetId}`
                      : null;

                  return (
                    <tr key={log.id} className="hover:bg-zinc-800/20 transition-colors">
                      {/* Timestamp */}
                      <td className="py-3 px-4 font-mono text-zinc-400 whitespace-nowrap align-top">
                        {formattedDate}
                      </td>

                      {/* Activity & Description */}
                      <td className="py-3 px-4 align-top">
                        <div className="text-zinc-200 font-medium">{actionTitle}</div>
                        <div className="text-[11px] text-zinc-400 mt-0.5 leading-relaxed">{activityDesc}</div>
                        <div className="text-[10px] font-mono text-zinc-600 mt-0.5">{log.action}</div>
                      </td>

                      {/* Target */}
                      <td className="py-3 px-4 align-top">
                        <div className="text-zinc-300 font-medium">{targetLabel}</div>
                        {shortTargetId && (
                          <div className="font-mono text-[10px] text-zinc-500" title={log.targetId}>
                            {shortTargetId}
                          </div>
                        )}
                      </td>

                      {/* Actor */}
                      <td className="py-3 px-4 align-top">
                        <div className="text-zinc-200">
                          {log.actor?.name || log.actor?.email || log.actorLabel || (log.actorType ? `[${log.actorType}]` : 'System')}
                        </div>
                        {log.actor?.email && log.actor?.name && (
                          <div className="text-[10px] text-zinc-500 font-mono mt-0.5">{log.actor.email}</div>
                        )}
                      </td>

                      {/* IP Address */}
                      <td className="py-3 px-4 align-top font-mono text-zinc-400 text-[11px] whitespace-nowrap">
                        {log.ip || <span className="text-zinc-600">—</span>}
                      </td>

                      {/* Status & Raw */}
                      <td className="py-3 px-4 text-right align-top">
                        <div className="flex flex-col items-end gap-1">
                          <span
                            className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium tracking-wide ${
                              log.result === 'success'
                                ? 'bg-zinc-800 text-zinc-300 border border-zinc-700'
                                : 'bg-zinc-800 text-rose-400 border border-zinc-700'
                            }`}
                          >
                            {log.result === 'success' ? 'Success' : 'Failed'}
                          </span>

                          {hasMetadata && (
                            <button
                              type="button"
                              onClick={() => setSelectedLogMetadata(log)}
                              className="text-[10px] text-zinc-500 hover:text-zinc-300 underline"
                            >
                              raw
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="p-3.5 bg-zinc-900/60 border-t border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-zinc-400">
          <div>
            {totalCount > 0 ? (
              <span>
                Showing{' '}
                <strong className="text-zinc-200">
                  {Math.min(totalCount, (page - 1) * pageSize + 1)}
                </strong>{' '}
                to{' '}
                <strong className="text-zinc-200">
                  {Math.min(totalCount, page * pageSize)}
                </strong>{' '}
                of <strong className="text-zinc-200">{totalCount}</strong> records
              </span>
            ) : (
              <span>No audit logs to display</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-200 border border-zinc-700 flex items-center gap-1 transition cursor-pointer disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Previous</span>
            </button>

            <span className="text-xs text-zinc-400 px-2">
              Page <strong className="text-zinc-200">{page}</strong> of{' '}
              <strong className="text-zinc-200">{totalPages}</strong>
            </span>

            <button
              type="button"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-200 border border-zinc-700 flex items-center gap-1 transition cursor-pointer disabled:cursor-not-allowed"
            >
              <span>Next</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Metadata Detail Modal */}
      {selectedLogMetadata && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 max-w-lg w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div>
                <h3 className="text-sm font-semibold text-white">Event Details</h3>
                <p className="text-xs text-zinc-400 font-mono mt-0.5">{selectedLogMetadata.action}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedLogMetadata(null)}
                className="text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-zinc-800 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2 text-zinc-400">
                <div>
                  <span className="block text-zinc-500 text-[11px]">Timestamp</span>
                  <span className="font-mono text-zinc-200">
                    {new Date(selectedLogMetadata.createdAt).toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="block text-zinc-500 text-[11px]">Actor</span>
                  <span className="text-zinc-200">
                    {selectedLogMetadata.actor?.name ||
                      selectedLogMetadata.actor?.email ||
                      selectedLogMetadata.actorLabel ||
                      selectedLogMetadata.actorType ||
                      'System'}
                  </span>
                </div>
                <div>
                  <span className="block text-zinc-500 text-[11px]">Target</span>
                  <span className="text-zinc-200">
                    {selectedLogMetadata.targetType || 'System'}{' '}
                    {selectedLogMetadata.targetId ? `(${selectedLogMetadata.targetId})` : ''}
                  </span>
                </div>
                <div>
                  <span className="block text-zinc-500 text-[11px]">Status</span>
                  <span className="font-semibold text-zinc-300">
                    {selectedLogMetadata.result === 'success' ? 'Success' : 'Failed'}
                  </span>
                </div>
              </div>

              {selectedLogMetadata.ip && (
                <div>
                  <span className="block text-zinc-500 text-[11px]">IP Address</span>
                  <span className="font-mono text-zinc-300">{selectedLogMetadata.ip}</span>
                </div>
              )}

              <div>
                <span className="block text-zinc-500 text-[11px] mb-1">Payload Metadata</span>
                <pre className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 text-[11px] font-mono text-zinc-300 overflow-x-auto max-h-60">
                  {JSON.stringify(selectedLogMetadata.metadata, null, 2)}
                </pre>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setSelectedLogMetadata(null)}
                className="px-4 py-1.5 text-xs font-medium rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
