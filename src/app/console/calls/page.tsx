'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Loader2,
  Phone,
  Sparkles,
  Search,
  Calendar,
  User,
  Users,
  Filter,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Clock,
  X,
} from 'lucide-react';
import { useConsole } from '@/context/ConsoleContext';

type DatePreset = 'all' | 'today' | 'yesterday' | '7d' | '30d' | 'custom';

function toLocalDateTimeInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function CallsPage() {
  const {
    calls: contextCalls,
    contactsList,
    staffList,
    bearerToken,
    setShowCallModal,
    authFetch,
    setSelectedCallDetail,
    refreshCallDetail,
    handleHangupLiveCall,
    hangingUpCallId,
    integrationsSummary,
    openItineraryIntakeModal,
    setIntakeCallTarget,
  } = useConsole();

  const [openingDetailId, setOpeningDetailId] = useState<string | null>(null);
  const [openingItineraryId, setOpeningItineraryId] = useState<string | null>(null);

  // Filter & Pagination state
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedContactPhone, setSelectedContactPhone] = useState('');
  const [selectedStaffUserId, setSelectedStaffUserId] = useState('');
  const [directionFilter, setDirectionFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  const [startDateInput, setStartDateInput] = useState('');
  const [endDateInput, setEndDateInput] = useState('');

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(20);
  const [paginatedCalls, setPaginatedCalls] = useState<any[]>(contextCalls);
  const [totalCount, setTotalCount] = useState<number>(contextCalls.length);
  const [fetchingCalls, setFetchingCalls] = useState(false);

  const openaiInteg = integrationsSummary?.integrations?.find((i: any) => i.provider === 'openai');
  const configuredTranscriptionModel = openaiInteg?.metadata?.model || 'gpt-4o-transcribe';

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Apply quick date presets
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
    setSelectedContactPhone('');
    setSelectedStaffUserId('');
    setDirectionFilter('');
    setStatusFilter('');
    setDatePreset('all');
    setStartDateInput('');
    setEndDateInput('');
    setPage(1);
  };

  const fetchFilteredCalls = useCallback(async () => {
    if (!bearerToken) return;
    setFetchingCalls(true);
    try {
      const params = new URLSearchParams();
      params.set('limit', String(pageSize));
      params.set('offset', String((page - 1) * pageSize));

      if (debouncedSearch) params.set('search', debouncedSearch);
      if (selectedContactPhone) params.set('contactPhone', selectedContactPhone);
      if (selectedStaffUserId) params.set('staffUserId', selectedStaffUserId);
      if (directionFilter) params.set('direction', directionFilter);
      if (statusFilter) params.set('status', statusFilter);
      if (startDateInput) {
        const d = new Date(startDateInput);
        if (!Number.isNaN(d.getTime())) params.set('startDate', d.toISOString());
      }
      if (endDateInput) {
        const d = new Date(endDateInput);
        if (!Number.isNaN(d.getTime())) params.set('endDate', d.toISOString());
      }

      const res = await authFetch(`/api/v1/calls?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setPaginatedCalls(Array.isArray(data.objects) ? data.objects : []);
        setTotalCount(typeof data.totalCount === 'number' ? data.totalCount : (data.objects?.length || 0));
      }
    } catch {} finally {
      setFetchingCalls(false);
    }
  }, [
    bearerToken,
    page,
    pageSize,
    debouncedSearch,
    selectedContactPhone,
    selectedStaffUserId,
    directionFilter,
    statusFilter,
    startDateInput,
    endDateInput,
    authFetch,
  ]);

  useEffect(() => {
    fetchFilteredCalls();
  }, [fetchFilteredCalls, contextCalls]);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const hasActiveFilters = Boolean(
    debouncedSearch ||
      selectedContactPhone ||
      selectedStaffUserId ||
      directionFilter ||
      statusFilter ||
      startDateInput ||
      endDateInput
  );

  const startItemIndex = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const endItemIndex = Math.min(page * pageSize, totalCount);

  return (
    <div className="space-y-5 max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white">Call Logs & Live Control</h2>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1">
            Manage active call legs, answer incoming calls via WebRTC, DTMF controls, and status timelines.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => fetchFilteredCalls()}
            disabled={fetchingCalls}
            className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-1.5 border border-zinc-700 transition cursor-pointer disabled:opacity-50"
            title="Refresh call logs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${fetchingCalls ? 'animate-spin text-indigo-400' : ''}`} />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            onClick={() => setShowCallModal(true)}
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 shadow-md transition cursor-pointer"
          >
            <Phone className="w-3.5 h-3.5" /> Place Call
          </button>
        </div>
      </div>

      {/* Filter Bar: User/Customer, Staff Member, Direction, Status & Date-Time Range */}
      <div className="bg-zinc-900/60 border border-zinc-800/90 rounded-xl p-4 space-y-3.5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Search by Customer Name, Phone or Call UUID */}
          <div className="relative lg:col-span-2">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search customer name, phone number, or Call UUID..."
              className="w-full bg-zinc-950 border border-zinc-800 focus:border-indigo-500/60 rounded-lg pl-8 pr-8 py-2 text-xs text-zinc-200 placeholder:text-zinc-500 outline-none"
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

          {/* Customer / Contact Filter */}
          <div className="relative">
            <Users className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <select
              value={selectedContactPhone}
              onChange={(e) => {
                setSelectedContactPhone(e.target.value);
                setPage(1);
              }}
              className="w-full bg-zinc-950 border border-zinc-800 focus:border-indigo-500/60 rounded-lg pl-8 pr-3 py-2 text-xs text-zinc-200 outline-none"
              title="Filter by Customer / Contact"
            >
              <option value="">All Customers / Callers</option>
              {contactsList.map((ct: any) => (
                <option key={ct.id} value={ct.phone}>
                  {ct.name} ({ct.phone})
                </option>
              ))}
            </select>
          </div>

          {/* Staff Member / Operator Filter */}
          <div className="relative">
            <User className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <select
              value={selectedStaffUserId}
              onChange={(e) => {
                setSelectedStaffUserId(e.target.value);
                setPage(1);
              }}
              className="w-full bg-zinc-950 border border-zinc-800 focus:border-indigo-500/60 rounded-lg pl-8 pr-3 py-2 text-xs text-zinc-200 outline-none"
              title="Filter by Staff Member / Operator"
            >
              <option value="">All Staff Members</option>
              {staffList.map((st: any) => {
                const u = st.user || st;
                const uid = u.id || st.userId;
                const label = u.name ? `${u.name} (${u.email})` : u.email || uid;
                return (
                  <option key={uid} value={uid}>
                    {label}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Direction & Status Combined Row */}
          <div className="grid grid-cols-2 gap-2">
            <select
              value={directionFilter}
              onChange={(e) => {
                setDirectionFilter(e.target.value);
                setPage(1);
              }}
              className="w-full bg-zinc-950 border border-zinc-800 focus:border-indigo-500/60 rounded-lg px-2.5 py-2 text-xs text-zinc-200 outline-none"
              title="Filter by Call Direction"
            >
              <option value="">All Directions</option>
              <option value="inbound">Inbound</option>
              <option value="outbound">Outbound</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="w-full bg-zinc-950 border border-zinc-800 focus:border-indigo-500/60 rounded-lg px-2.5 py-2 text-xs text-zinc-200 outline-none"
              title="Filter by Call Status"
            >
              <option value="">All Status</option>
              <option value="completed">Completed</option>
              <option value="in-progress">In Progress</option>
              <option value="ringing">Ringing</option>
              <option value="queued">Queued</option>
              <option value="no-answer">No Answer</option>
              <option value="busy">Busy</option>
              <option value="failed">Failed</option>
            </select>
          </div>
        </div>

        {/* Date & Time Range Filter Row */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pt-2 border-t border-zinc-800/70">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] text-zinc-400 flex items-center gap-1 mr-1">
              <Calendar className="w-3.5 h-3.5 text-indigo-400" />
              Date & Time:
            </span>
            {(
              [
                { id: 'all', label: 'All Time' },
                { id: 'today', label: 'Today' },
                { id: 'yesterday', label: 'Yesterday' },
                { id: '7d', label: 'Last 7 Days' },
                { id: '30d', label: 'Last 30 Days' },
              ] as { id: DatePreset; label: string }[]
            ).map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleSelectDatePreset(preset.id)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition cursor-pointer ${
                  datePreset === preset.id
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-zinc-950 text-zinc-400 hover:text-zinc-200 border border-zinc-800'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-zinc-500">From:</span>
              <input
                type="datetime-local"
                value={startDateInput}
                onChange={(e) => {
                  setDatePreset('custom');
                  setStartDateInput(e.target.value);
                  setPage(1);
                }}
                className="bg-zinc-950 border border-zinc-800 focus:border-indigo-500/60 rounded-lg px-2.5 py-1 text-[11px] text-zinc-200 outline-none"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-zinc-500">To:</span>
              <input
                type="datetime-local"
                value={endDateInput}
                onChange={(e) => {
                  setDatePreset('custom');
                  setEndDateInput(e.target.value);
                  setPage(1);
                }}
                className="bg-zinc-950 border border-zinc-800 focus:border-indigo-500/60 rounded-lg px-2.5 py-1 text-[11px] text-zinc-200 outline-none"
              />
            </div>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleClearFilters}
                className="text-[11px] bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 px-2.5 py-1 rounded-lg flex items-center gap-1 transition cursor-pointer"
              >
                <Filter className="w-3 h-3" />
                <span>Clear Filters</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Calls List Table with horizontal scroll container */}
      <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-xs">
            <thead className="bg-zinc-900/80 border-b border-zinc-800 text-zinc-400 font-medium">
              <tr>
                <th className="py-3 px-4">Direction / Counterpart</th>
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Duration</th>
                <th className="py-3 px-4">Cost</th>
                <th className="py-3 px-4">Policy Applied</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
              {paginatedCalls.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-zinc-500">
                    {fetchingCalls
                      ? 'Loading call logs...'
                      : hasActiveFilters
                        ? 'No calls match the selected filters. Click "Clear Filters" to reset.'
                        : 'No calls recorded yet. Click "Place Call" to make an outbound call.'}
                  </td>
                </tr>
              ) : (
                paginatedCalls.map((call) => {
                  const callDateObj = call.startedAt ? new Date(call.startedAt) : null;
                  const formattedDate = callDateObj
                    ? callDateObj.toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })
                    : '—';
                  const formattedTime = callDateObj
                    ? callDateObj.toLocaleTimeString('en-IN', {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                        hour12: true,
                      })
                    : '';

                  return (
                    <tr key={call.id} className="hover:bg-zinc-800/30 transition">
                      <td className="py-3.5 px-4">
                        <div className="font-mono font-medium text-zinc-200 flex items-center gap-1.5 flex-wrap">
                          <span>
                            {call.direction === 'inbound' ? 'Inbound' : 'Outbound'}: {call.from} &rarr; {call.to}
                          </span>
                          {call.contactName && (
                            <span className="text-[10px] font-sans font-semibold px-2 py-0.5 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                              {call.contactName}
                            </span>
                          )}
                          {call.staffUser && (call.staffUser.name || call.staffUser.email) && (
                            <span
                              className="text-[10px] font-sans px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700"
                              title={`Staff Member: ${call.staffUser.email || call.staffUser.name}`}
                            >
                              Staff: {call.staffUser.name || call.staffUser.email}
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-zinc-500 font-mono mt-0.5">{call.plivoCallUuid}</div>
                      </td>

                      {/* Timestamp Column */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="text-zinc-200 font-medium flex items-center gap-1">
                          <Clock className="w-3 h-3 text-indigo-400 shrink-0" />
                          <span>{formattedDate}</span>
                        </div>
                        {formattedTime && (
                          <div className="text-[10px] text-zinc-400 font-mono pl-4 mt-0.5">{formattedTime}</div>
                        )}
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
                          Rec: {call.recordingEnabled ? 'Yes' : 'No'} | Trans:{' '}
                          {call.transcriptionEnabled ? (
                            <span className="text-emerald-400 font-medium">OpenAI ({configuredTranscriptionModel})</span>
                          ) : (
                            'No'
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right space-x-2 whitespace-nowrap">
                        <button
                          type="button"
                          disabled={openingDetailId === call.id}
                          onClick={async () => {
                            setOpeningDetailId(call.id);
                            // Open drawer immediately (0ms) with row data, then sync full details in background
                            setSelectedCallDetail(call);
                            try {
                              await refreshCallDetail(call.id);
                            } finally {
                              setOpeningDetailId(null);
                            }
                          }}
                          className="text-xs bg-zinc-800 hover:bg-zinc-700 disabled:opacity-60 text-zinc-200 px-2.5 py-1 rounded border border-zinc-700 inline-flex items-center gap-1 cursor-pointer transition"
                        >
                          {openingDetailId === call.id && <Loader2 className="w-3 h-3 animate-spin text-zinc-300" />}
                          <span>Detail</span>
                        </button>
                        <button
                          type="button"
                          disabled={openingItineraryId === call.id}
                          onClick={async () => {
                            setOpeningItineraryId(call.id);
                            // Open Itinerary Intake Modal immediately (0ms), then enrich in background
                            openItineraryIntakeModal(call);
                            try {
                              const res = await authFetch(`/api/v1/calls/${call.id}?fast=true`);
                              if (res.ok) {
                                const data = await res.json();
                                if (data.call) setIntakeCallTarget(data.call);
                              }
                            } catch {} finally {
                              setOpeningItineraryId(null);
                            }
                          }}
                          className="text-xs bg-indigo-600/20 hover:bg-indigo-600/30 disabled:opacity-60 text-indigo-300 px-2.5 py-1 rounded border border-indigo-500/30 inline-flex items-center gap-1 cursor-pointer transition"
                          title="Open Itinerary Builder with prefilled transcription parameters"
                        >
                          {openingItineraryId === call.id ? (
                            <Loader2 className="w-3 h-3 animate-spin text-indigo-400" />
                          ) : (
                            <Sparkles className="w-3 h-3 text-indigo-400" />
                          )}
                          <span>Itinerary</span>
                        </button>
                        {call.status === 'in-progress' && (
                          <button
                            type="button"
                            disabled={hangingUpCallId === call.id}
                            onClick={() => handleHangupLiveCall(call.id)}
                            className="text-xs bg-rose-600/20 hover:bg-rose-600/30 disabled:opacity-60 text-rose-400 px-2.5 py-1 rounded border border-rose-500/30 inline-flex items-center gap-1 cursor-pointer transition"
                          >
                            {hangingUpCallId === call.id && <Loader2 className="w-3 h-3 animate-spin" />}
                            <span>{hangingUpCallId === call.id ? 'Ending...' : 'Hang Up'}</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        <div className="bg-zinc-900/80 border-t border-zinc-800 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-zinc-400">
          <div className="flex items-center gap-3 flex-wrap">
            <span>
              Showing <span className="font-semibold text-zinc-200">{startItemIndex}</span>–
              <span className="font-semibold text-zinc-200">{endItemIndex}</span> of{' '}
              <span className="font-semibold text-zinc-200">{totalCount}</span> calls
            </span>
            <div className="flex items-center gap-1.5">
              <span className="text-zinc-500">Rows per page:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200 outline-none"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={page <= 1 || fetchingCalls}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-200 border border-zinc-700 flex items-center gap-1 transition cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Prev</span>
            </button>

            {Array.from({ length: Math.min(totalPages, 5) }, (_, idx) => {
              let pageNum = idx + 1;
              if (totalPages > 5 && page > 3) {
                pageNum = Math.min(page - 2 + idx, totalPages - 4 + idx);
              }
              return (
                <button
                  key={pageNum}
                  type="button"
                  disabled={fetchingCalls}
                  onClick={() => setPage(pageNum)}
                  className={`w-7 h-7 rounded font-mono text-xs flex items-center justify-center transition cursor-pointer ${
                    page === pageNum
                      ? 'bg-indigo-600 text-white font-bold'
                      : 'bg-zinc-950 hover:bg-zinc-800 text-zinc-400 border border-zinc-800'
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}

            <button
              type="button"
              disabled={page >= totalPages || fetchingCalls}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-200 border border-zinc-700 flex items-center gap-1 transition cursor-pointer"
            >
              <span>Next</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
