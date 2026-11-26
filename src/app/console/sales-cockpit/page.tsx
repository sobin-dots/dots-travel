'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Calendar,
  Clock,
  CheckCircle2,
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  AlertCircle,
  TrendingUp,
  User,
  ArrowRight,
  Filter,
  Flame,
  Check,
  Send,
  Loader2,
  CalendarDays,
  AlertTriangle,
  Sparkles,
  Globe,
} from 'lucide-react';
import { useConsole } from '@/context/ConsoleContext';

export default function SalesDashboardPage() {
  const {
    leadsList,
    setLeadsList,
    calls,
    currentUser,
    currentOrg,
    staffList,
    authFetch,
    fetchData,
    handleSelectLead,
    setCallDestination,
    setShowCallModal,
  } = useConsole();

  const [activeTab, setActiveTab] = useState<'today' | 'upcoming' | 'missed' | 'completed'>('today');
  const [todaySubFilter, setTodaySubFilter] = useState<'all' | 'overdue' | 'ontrack'>('all');
  const [selectedStaffId, setSelectedStaffId] = useState<string>('all');
  const [reschedulingLeadId, setReschedulingLeadId] = useState<string | null>(null);
  const [newFollowUpDate, setNewFollowUpDate] = useState('');
  const [newFollowUpNote, setNewFollowUpNote] = useState('');
  const [savingTask, setSavingTask] = useState(false);

  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  // 1. My Leads (Assigned to logged-in sales person, or all / filtered for admin)
  const isElevated = currentOrg?.role === 'owner' || currentOrg?.role === 'admin';
  const effectiveStaffId = isElevated ? selectedStaffId : currentUser?.id;
  const isAllAgency = isElevated && selectedStaffId === 'all';

  const myLeads = useMemo(() => {
    return leadsList.filter((l) => {
      if (isElevated) {
        if (selectedStaffId === 'all') return true;
        return l.assignedToId === selectedStaffId;
      }
      return l.assignedToId === currentUser?.id;
    });
  }, [leadsList, currentUser?.id, isElevated, selectedStaffId]);

  const getStaffName = (assignedToId?: string | null) => {
    if (!assignedToId || assignedToId === 'all') return 'All Staff';
    const found = staffList?.find((s) => s.id === assignedToId || s.userId === assignedToId);
    return found?.name || found?.email || 'Sales Specialist';
  };

  const getLeadSource = (lead: any) => {
    // 1. Direct formName
    if (lead.formName && typeof lead.formName === 'string' && lead.formName.trim() && lead.formName !== 'Staff entry' && lead.formName !== 'unknown') {
      return lead.formName.trim();
    }
    // 2. Check tags for form: or source:
    if (Array.isArray(lead.tags)) {
      const formTag = lead.tags.find((t: string) => t.toLowerCase().startsWith('form:'));
      if (formTag) {
        const val = formTag.slice(5).trim();
        if (val) return val;
      }
      const srcTag = lead.tags.find((t: string) => t.toLowerCase().startsWith('source:'));
      if (srcTag) {
        const val = srcTag.slice(7).trim();
        if (val) {
          return val
            .split(/[_\s-]+/)
            .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' ');
        }
      }
    }
    // 3. Fallback to lead.source
    if (lead.source && typeof lead.source === 'string' && lead.source.trim() && lead.source !== 'unknown') {
      const s = lead.source.trim();
      if (s === 'hosted_form' || s === 'Hosted Public Form') return 'Hosted Public Form';
      if (s === 'website') return 'Custom Website Form';
      if (s === 'google_forms') return 'Google Form';
      if (s === 'meta') return 'Meta Lead Ads';
      if (s === 'google_ads') return 'Google Ads';
      return s;
    }
    return 'Website / Direct';
  };

  // 2. Follow-up task buckets
  const tasks = useMemo(() => {
    const today: any[] = [];
    const upcoming: any[] = [];
    const completed: any[] = [];

    for (const lead of myLeads) {
      if (!lead.nextFollowUpAt) {
        // If not contacted yet, and has first contact deadline
        if (!lead.firstContactAt && lead.firstContactDueAt) {
          const dueDate = new Date(lead.firstContactDueAt);
          if (dueDate.toISOString().split('T')[0] <= todayStr) {
            today.push({ ...lead, taskType: 'first_contact', taskDueDate: dueDate });
          } else {
            upcoming.push({ ...lead, taskType: 'first_contact', taskDueDate: dueDate });
          }
        } else if (lead.firstContactAt) {
          // Contacted! Put in completed so completed tab & progress meter reflect it
          const contactDate = new Date(lead.firstContactAt);
          completed.push({ ...lead, taskType: 'first_contact_done', taskDueDate: contactDate });
        }
        continue;
      }

      const fDate = new Date(lead.nextFollowUpAt);
      const isPastOrToday = fDate.toISOString().split('T')[0] <= todayStr;

      if (lead.stage === 'confirmed' || lead.stage === 'lost') {
        completed.push({ ...lead, taskType: 'scheduled', taskDueDate: fDate });
      } else if (isPastOrToday) {
        today.push({ ...lead, taskType: 'scheduled', taskDueDate: fDate });
      } else {
        upcoming.push({ ...lead, taskType: 'scheduled', taskDueDate: fDate });
      }
    }

    // Sort today: overdue first
    today.sort((a, b) => a.taskDueDate.getTime() - b.taskDueDate.getTime());
    upcoming.sort((a, b) => a.taskDueDate.getTime() - b.taskDueDate.getTime());
    completed.sort((a, b) => b.taskDueDate.getTime() - a.taskDueDate.getTime());

    return { today, upcoming, completed };
  }, [myLeads, todayStr]);

  // Separate overdue vs on-track for clean UX differentiation
  const overdueTasks = useMemo(() => {
    return tasks.today.filter((lead) => lead.taskDueDate < now);
  }, [tasks.today, now]);

  const ontrackTasks = useMemo(() => {
    return tasks.today.filter((lead) => lead.taskDueDate >= now);
  }, [tasks.today, now]);

  // 3. Unanswered Calls Bucket (Calls from my assigned contacts where client was not answered)
  const myAssignedPhones = useMemo(() => {
    const set = new Set<string>();
    for (const l of myLeads) {
      if (l.contact?.phone) set.add(l.contact.phone.replace(/[\s\-\(\)]/g, ''));
      if (l.metadata?.customerPhone) set.add(l.metadata.customerPhone.replace(/[\s\-\(\)]/g, ''));
    }
    return set;
  }, [myLeads]);

  // 4. Calls Filtered by selected staff or whole agency
  const filteredCalls = useMemo(() => {
    if (isAllAgency) return calls;
    return calls.filter((c) => {
      const from = (c.from || '').replace(/[\s\-\(\)]/g, '');
      const to = (c.to || '').replace(/[\s\-\(\)]/g, '');
      const matchesPhone = myAssignedPhones.has(from) || myAssignedPhones.has(to);
      const matchesAssigned = c.assignedToId && (c.assignedToId === effectiveStaffId || c.assignedToId === currentUser?.id);
      return matchesAssigned || matchesPhone;
    });
  }, [calls, isAllAgency, effectiveStaffId, currentUser?.id, myAssignedPhones]);

  const missedCalls = useMemo(() => {
    return filteredCalls.filter((c) => {
      const isUnanswered = ['missed', 'no-answer', 'failed', 'busy', 'canceled'].includes(
        String(c.status || '').toLowerCase()
      ) || (c.direction === 'inbound' && c.agentOutcome !== 'answered' && c.status !== 'in-progress');

      return isUnanswered;
    });
  }, [filteredCalls]);

  // 5. Activity Graph Data (Last 7 Days) scoped to filteredCalls
  const last7DaysData = useMemo(() => {
    const days: Array<{ label: string; dateStr: string; attended: number; missed: number; outbound: number }> = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const dayLabel = i === 0 ? 'Today' : i === 1 ? 'Yest' : d.toLocaleDateString('en-US', { weekday: 'short' });

      // Count calls on this day
      let attended = 0;
      let missed = 0;
      let outbound = 0;

      for (const c of filteredCalls) {
        const cDate = (c.startedAt || c.createdAt || '').slice(0, 10);
        if (cDate !== dateStr) continue;

        if (c.direction === 'outbound') {
          outbound++;
        } else if (c.status === 'completed' || c.agentOutcome === 'answered') {
          attended++;
        } else {
          missed++;
        }
      }

      days.push({ label: dayLabel, dateStr, attended, missed, outbound });
    }
    return days;
  }, [filteredCalls]);

  const maxCallCount = Math.max(...last7DaysData.map((d) => d.attended + d.outbound + d.missed), 5);

  // 5. Today's Completion Progress Rate
  const todayGoalTarget = tasks.today.length + tasks.completed.length || 1;
  const todayDoneCount = tasks.completed.length;
  const progressPercentage = Math.min(100, Math.round((todayDoneCount / todayGoalTarget) * 100));

  // Quick Action: Complete or Reschedule Task
  const handleUpdateFollowUp = async (leadId: string, markContacted = false) => {
    setSavingTask(true);
    try {
      const payload: Record<string, any> = {};
      if (markContacted) {
        payload.contacted = true;
      }
      if (newFollowUpDate) {
        payload.nextFollowUpAt = new Date(newFollowUpDate).toISOString();
      }
      if (newFollowUpNote) {
        payload.followUpNote = newFollowUpNote;
      }

      // Optimistic update in leadsList so the UI updates instantly
      const nowIso = new Date().toISOString();
      const scheduledIso = newFollowUpDate ? new Date(newFollowUpDate).toISOString() : undefined;
      setLeadsList((prev: any[]) =>
        prev.map((l) => {
          if (l.id !== leadId) return l;
          return {
            ...l,
            ...(markContacted ? { firstContactAt: l.firstContactAt || nowIso } : {}),
            ...(scheduledIso ? { nextFollowUpAt: scheduledIso } : {}),
            metadata: {
              ...(l.metadata || {}),
              ...(newFollowUpNote ? { followUpNote: newFollowUpNote } : {}),
            },
          };
        })
      );

      const res = await authFetch(`/api/v1/leads/${leadId}/qualification`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setReschedulingLeadId(null);
        setNewFollowUpDate('');
        setNewFollowUpNote('');
        await fetchData();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Failed to update follow-up');
        await fetchData();
      }
    } catch (e: any) {
      alert(e.message || 'Error updating task');
    } finally {
      setSavingTask(false);
    }
  };

  const renderLeadCard = (lead: any, isOverdue: boolean) => {
    const customerPhone = lead.contact?.phone || lead.metadata?.customerPhone;
    const isRescheduling = reschedulingLeadId === lead.id;

    return (
      <div
        key={lead.id}
        className={`p-4 rounded-xl border transition ${
          isOverdue
            ? 'border-amber-800/80 bg-amber-950/20 shadow-sm'
            : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700'
        }`}
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Left: Lead details (flex-1 min-w-0 breaks text cleanly) */}
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h4
                className="font-semibold text-zinc-100 text-sm hover:underline cursor-pointer break-words"
                onClick={() => handleSelectLead(lead.id)}
              >
                {lead.title}
              </h4>
              <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                {isOverdue && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1 whitespace-nowrap">
                    <AlertTriangle className="w-3 h-3 text-amber-400" />
                    Overdue
                  </span>
                )}
                {/* Enquiry Source Badge in place of new enquiry tag (just value) */}
                <span
                  title={`Enquiry Platform: ${getLeadSource(lead)}`}
                  className="text-[10px] px-2 py-0.5 rounded bg-emerald-950/70 text-emerald-300 border border-emerald-800/60 inline-flex items-center gap-1 font-medium whitespace-nowrap shadow-xs"
                >
                  <Globe className="w-3 h-3 text-emerald-400" />
                  {getLeadSource(lead)}
                </span>
                {isElevated && (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-950/60 text-indigo-300 border border-indigo-800/60 inline-flex items-center gap-1 font-medium whitespace-nowrap">
                    <User className="w-3 h-3 text-indigo-400" />
                    {getStaffName(lead.assignedToId)}
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-400">
              <span className="break-words">Client: <strong className="text-zinc-200">{lead.contact?.name || lead.metadata?.customerName || 'Direct'}</strong></span>
              {customerPhone && <span className="whitespace-nowrap">Phone: <strong className="text-emerald-400 font-mono">{customerPhone}</strong></span>}
            </div>

            {/* Follow-up Note from Admin / Client */}
            {lead.metadata?.followUpNote && (
              <div className="mt-2 text-xs bg-zinc-950/80 border border-zinc-800 p-2.5 rounded-lg text-zinc-300 break-words">
                <span className="text-zinc-500 font-semibold block text-[10px] uppercase">Instructions / Note:</span>
                {lead.metadata.followUpNote}
              </div>
            )}
          </div>

          {/* Right: Scheduled Time & Static Action Buttons (shrink-0 ensures no misalignment) */}
          <div className="shrink-0 flex items-center justify-between sm:justify-end gap-3 self-stretch lg:self-center pt-2 lg:pt-0 border-t lg:border-t-0 border-zinc-800/60">
            <div className="text-right whitespace-nowrap hidden sm:block">
              {lead.createdAt && (
                <div className="text-[11px] text-zinc-400 font-mono">
                  <span className="text-zinc-500 font-sans">Received: </span>
                  <span className="text-zinc-300 font-semibold">
                    {new Date(lead.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              )}
              <div className="text-[11px] font-mono">
                {lead.taskType === 'first_contact' ? (
                  <span className={isOverdue ? 'text-amber-400 font-semibold' : 'text-indigo-400 font-semibold'}>
                    <span className="font-sans font-normal text-zinc-500">30m SLA: </span>
                    {lead.taskDueDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                ) : (
                  <span className="text-indigo-300 font-semibold">
                    <span className="font-sans font-normal text-zinc-500">Call: </span>
                    {lead.taskDueDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </div>
              <span className="text-[10px] text-zinc-500 block">
                {lead.taskDueDate.toLocaleDateString([], { month: 'short', day: 'numeric' })}
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {customerPhone && (
                <button
                  type="button"
                  onClick={() => {
                    setCallDestination(customerPhone);
                    setShowCallModal(true);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition whitespace-nowrap"
                >
                  <Phone className="w-3.5 h-3.5" /> Call
                </button>
              )}

              <button
                type="button"
                onClick={() => handleUpdateFollowUp(lead.id, true)}
                disabled={savingTask}
                className="px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 text-xs font-semibold flex items-center gap-1.5 transition whitespace-nowrap"
              >
                <Check className="w-3.5 h-3.5" /> Mark Contacted
              </button>

              <button
                type="button"
                onClick={() => setReschedulingLeadId(isRescheduling ? null : lead.id)}
                className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition whitespace-nowrap"
              >
                {isRescheduling ? 'Cancel' : 'Reschedule'}
              </button>
            </div>
          </div>
        </div>

        {/* Reschedule Drawer inline */}
        {isRescheduling && (
          <div className="mt-4 pt-4 border-t border-zinc-800 grid sm:grid-cols-3 gap-3 bg-zinc-950/60 p-3 rounded-lg">
            <div>
              <label className="text-[11px] text-zinc-400 block mb-1">New Date & Time</label>
              <input
                type="datetime-local"
                value={newFollowUpDate}
                onChange={(e) => setNewFollowUpDate(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-2 text-xs text-white"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-[11px] text-zinc-400 block mb-1">Follow-up Note (Client request details)</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. Client requested call tomorrow at 2 PM to confirm quote"
                  value={newFollowUpNote}
                  onChange={(e) => setNewFollowUpNote(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-2 text-xs text-white"
                />
                <button
                  type="button"
                  disabled={savingTask || !newFollowUpDate}
                  onClick={() => handleUpdateFollowUp(lead.id)}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold whitespace-nowrap"
                >
                  {savingTask ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Save'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-indigo-400" />
            Sales Follow-up & Activity Dashboard
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1">
            Track daily follow-up commitments, call performance trends, and client schedules.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isElevated && (
            <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-700/80 rounded-lg px-2.5 py-1.5 shadow-sm">
              <Filter className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
              <select
                value={selectedStaffId}
                onChange={(e) => setSelectedStaffId(e.target.value)}
                className="bg-transparent text-xs text-zinc-200 focus:outline-none cursor-pointer"
              >
                <option value="all" className="bg-zinc-900 text-white">Agency-wide (All Staff)</option>
                {staffList?.map((s) => (
                  <option key={s.id} value={s.id} className="bg-zinc-900 text-white">
                    {s.name || s.email} ({s.role || 'Sales'})
                  </option>
                ))}
              </select>
            </div>
          )}

          <Link
            href="/console/leads"
            className="px-3.5 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-200 border border-zinc-700 flex items-center gap-1.5 transition"
          >
            All Leads ({myLeads.length}) &rarr;
          </Link>
        </div>
      </div>

      {/* 1. VISUAL PERFORMANCE & ACTIVITY GRAPHS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Graph 1: 7-Day Call Volume & Activity Bar Graph */}
        <div className="lg:col-span-2 bg-zinc-900/50 border border-zinc-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Phone className="w-4 h-4 text-emerald-400" />
                7-Day Call Volume Trends
              </h3>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                {isAllAgency
                  ? 'Agency-wide daily breakdown of attended, outbound, and unhandled client inquiries.'
                  : `Daily call activity breakdown for ${getStaffName(effectiveStaffId)}.`}
              </p>
            </div>
            <div className="flex items-center gap-3 text-[10px] font-mono">
              <span className="flex items-center gap-1 text-emerald-400">
                <span className="w-2 h-2 rounded bg-emerald-500 inline-block" /> Inbound Attended
              </span>
              <span className="flex items-center gap-1 text-indigo-400">
                <span className="w-2 h-2 rounded bg-indigo-500 inline-block" /> Outbound
              </span>
              <span className="flex items-center gap-1 text-red-400">
                <span className="w-2 h-2 rounded bg-red-500 inline-block" /> Missed
              </span>
            </div>
          </div>

          {/* Pure SVG Bar Chart */}
          <div className="h-44 flex items-end justify-between gap-2 sm:gap-4 pt-6 border-b border-zinc-800 pb-2">
            {last7DaysData.map((d, idx) => {
              const total = d.attended + d.outbound + d.missed;
              const attendedHeight = Math.round((d.attended / maxCallCount) * 120);
              const outboundHeight = Math.round((d.outbound / maxCallCount) * 120);
              const missedHeight = Math.round((d.missed / maxCallCount) * 120);

              return (
                <div key={idx} className="flex-1 flex flex-col items-center gap-1 group relative">
                  {/* Tooltip on hover */}
                  <div className="absolute -top-10 opacity-0 group-hover:opacity-100 transition pointer-events-none bg-zinc-800 border border-zinc-700 text-zinc-200 text-[10px] py-1 px-2 rounded-lg whitespace-nowrap shadow-xl z-20">
                    {total} calls ({d.attended} in, {d.outbound} out, {d.missed} missed)
                  </div>

                  <div className="w-full max-w-[28px] flex flex-col-reverse items-center justify-start h-[120px]">
                    {d.missed > 0 && (
                      <div
                        style={{ height: `${missedHeight}px` }}
                        className="w-full bg-red-500 rounded-t-sm"
                        title={`${d.missed} missed`}
                      />
                    )}
                    {d.outbound > 0 && (
                      <div
                        style={{ height: `${outboundHeight}px` }}
                        className="w-full bg-indigo-500"
                        title={`${d.outbound} outbound`}
                      />
                    )}
                    {d.attended > 0 && (
                      <div
                        style={{ height: `${attendedHeight}px` }}
                        className="w-full bg-emerald-500 rounded-b-sm"
                        title={`${d.attended} attended`}
                      />
                    )}
                    {total === 0 && <div className="w-full h-1 bg-zinc-800 rounded" />}
                  </div>
                  <span className="text-[11px] text-zinc-400 font-medium">{d.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Graph 2: Today's Follow-up Completion Rate Meter */}
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-5 flex flex-col justify-between space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              Follow-up Completion Target
            </h3>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              {isAllAgency
                ? 'Agency-wide goal progression for client follow-ups.'
                : `Daily goal progression for ${getStaffName(effectiveStaffId)}.`}
            </p>
          </div>

          <div className="flex flex-col items-center justify-center my-auto py-2">
            <div className="relative w-32 h-32 flex items-center justify-center">
              {/* Circular SVG Gauge */}
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  stroke="currentColor"
                  strokeWidth="8"
                  fill="transparent"
                  className="text-zinc-800"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  stroke="currentColor"
                  strokeWidth="8"
                  fill="transparent"
                  strokeDasharray={251.2}
                  strokeDashoffset={251.2 - (251.2 * progressPercentage) / 100}
                  strokeLinecap="round"
                  className="text-emerald-500 transition-all duration-700 ease-out"
                />
              </svg>
              <div className="absolute flex flex-col items-center justify-center text-center">
                <span className="text-2xl font-extrabold text-white font-mono">{progressPercentage}%</span>
                <span className="text-[10px] text-zinc-400 uppercase tracking-wider font-semibold">Done</span>
              </div>
            </div>
            <p className="text-xs text-zinc-300 font-medium mt-3">
              {tasks.completed.length} of {todayGoalTarget} follow-ups completed
            </p>
          </div>

          <div className="pt-3 border-t border-zinc-800/80 flex items-center justify-between text-xs text-zinc-400">
            <span>Pending Today: <strong className="text-white">{tasks.today.length}</strong></span>
            <span>Upcoming: <strong className="text-indigo-400">{tasks.upcoming.length}</strong></span>
          </div>
        </div>
      </div>

      {/* 2. TASK TABS: TODAY'S FOLLOW-UPS, UPCOMING, MISSED, COMPLETED */}
      <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
        {/* Navigation Tabs */}
        <div className="flex flex-wrap items-center gap-1 border-b border-zinc-800 bg-zinc-900/80 p-2 sm:p-3">
          <button
            type="button"
            onClick={() => setActiveTab('today')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition ${
              activeTab === 'today'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            Today's Commitments ({tasks.today.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('upcoming')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition ${
              activeTab === 'upcoming'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
            }`}
          >
            <CalendarDays className="w-3.5 h-3.5" />
            Upcoming Future Calls ({tasks.upcoming.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('missed')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition ${
              activeTab === 'missed'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
            }`}
          >
            <PhoneIncoming className="w-3.5 h-3.5 text-red-400" />
            Missed / Unanswered Inbound ({missedCalls.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('completed')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition ${
              activeTab === 'completed'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            Completed / History ({tasks.completed.length})
          </button>
        </div>

        {/* Tab Contents */}
        <div className="p-4 sm:p-6 space-y-4">
          {/* TAB 1: TODAY'S TASKS */}
          {activeTab === 'today' && (
            <div className="space-y-4">
              {tasks.today.length === 0 ? (
                <div className="p-10 text-center text-zinc-500 rounded-xl border border-zinc-800/60 bg-zinc-950/20">
                  <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-500/50 mb-2" />
                  <p className="text-sm font-medium text-zinc-300">No pending follow-ups for today!</p>
                  <p className="text-xs text-zinc-500 mt-1">All scheduled client calls have been completed.</p>
                </div>
              ) : (
                <>
                  {/* UX Filter Controls: All vs Overdue vs New Inquiries */}
                  <div className="flex flex-wrap items-center justify-between gap-2 p-2 rounded-xl bg-zinc-950/80 border border-zinc-800">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setTodaySubFilter('all')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                          todaySubFilter === 'all'
                            ? 'bg-zinc-800 text-white shadow-sm'
                            : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        All Commitments ({tasks.today.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setTodaySubFilter('overdue')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                          todaySubFilter === 'overdue'
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50 shadow-sm'
                            : 'text-zinc-400 hover:text-amber-300 hover:bg-amber-950/20'
                        }`}
                      >
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                        Overdue ({overdueTasks.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setTodaySubFilter('ontrack')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                          todaySubFilter === 'ontrack'
                            ? 'bg-indigo-950/80 text-indigo-300 border border-indigo-800/60 shadow-sm'
                            : 'text-zinc-400 hover:text-indigo-300 hover:bg-indigo-950/20'
                        }`}
                      >
                        <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                        New Inquiries & Today&apos;s Schedule ({ontrackTasks.length})
                      </button>
                    </div>

                    <span className="text-[11px] text-zinc-500 px-2 hidden sm:inline">
                      {todaySubFilter === 'overdue'
                        ? 'Prioritize calling overdue clients first'
                        : todaySubFilter === 'ontrack'
                        ? 'Scheduled within SLA deadline'
                        : 'Divided by priority'}
                    </span>
                  </div>

                  {/* Filter Mode: Overdue Only */}
                  {todaySubFilter === 'overdue' && (
                    <div className="space-y-3">
                      {overdueTasks.length === 0 ? (
                        <div className="p-8 text-center text-zinc-500 rounded-xl border border-zinc-800 bg-zinc-950/20">
                          <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-400 mb-2" />
                          <p className="text-sm text-zinc-300 font-medium">No overdue leads!</p>
                          <p className="text-xs text-zinc-500 mt-0.5">All incoming client inquiries are within SLA limits.</p>
                        </div>
                      ) : (
                        overdueTasks.map((lead) => renderLeadCard(lead, true))
                      )}
                    </div>
                  )}

                  {/* Filter Mode: On-Track / New Inquiries Only */}
                  {todaySubFilter === 'ontrack' && (
                    <div className="space-y-3">
                      {ontrackTasks.length === 0 ? (
                        <div className="p-8 text-center text-zinc-500 rounded-xl border border-zinc-800 bg-zinc-950/20">
                          <p className="text-sm text-zinc-400">No scheduled upcoming inquiries remaining for today.</p>
                        </div>
                      ) : (
                        ontrackTasks.map((lead) => renderLeadCard(lead, false))
                      )}
                    </div>
                  )}

                  {/* Filter Mode: All (Separated into 2 distinct visual panels) */}
                  {todaySubFilter === 'all' && (
                    <div className="space-y-6">
                      {/* Section 1: Overdue Leads */}
                      {overdueTasks.length > 0 && (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between px-1 pb-1 border-b border-amber-900/50">
                            <span className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                              <AlertTriangle className="w-4 h-4 text-amber-400" />
                              🚨 Urgent Attention Required — Overdue ({overdueTasks.length})
                            </span>
                            <span className="text-[11px] text-amber-400/80 font-mono font-medium">Exceeded First-Contact SLA</span>
                          </div>
                          {overdueTasks.map((lead) => renderLeadCard(lead, true))}
                        </div>
                      )}

                      {/* Section 2: On-Track New Inquiries */}
                      {ontrackTasks.length > 0 && (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between px-1 pb-1 border-b border-indigo-900/50">
                            <span className="text-xs font-bold text-indigo-300 uppercase tracking-wider flex items-center gap-1.5">
                              <Sparkles className="w-4 h-4 text-indigo-400" />
                              ✨ New Inquiries & Today&apos;s Schedule ({ontrackTasks.length})
                            </span>
                            <span className="text-[11px] text-indigo-400/80 font-mono font-medium">Within SLA Schedule</span>
                          </div>
                          {ontrackTasks.map((lead) => renderLeadCard(lead, false))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* TAB 2: UPCOMING FUTURE CALLS */}
          {activeTab === 'upcoming' && (
            <div className="space-y-3">
              {tasks.upcoming.length === 0 ? (
                <div className="p-8 text-center text-zinc-500 rounded-xl border border-zinc-800 bg-zinc-950/20">
                  <Calendar className="w-8 h-8 mx-auto text-zinc-600 mb-2" />
                  <p className="text-sm">No future scheduled calls yet.</p>
                </div>
              ) : (
                tasks.upcoming.map((lead) => (
                  <div key={lead.id} className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/30 flex items-center justify-between text-xs">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold text-zinc-200 hover:underline cursor-pointer" onClick={() => handleSelectLead(lead.id)}>
                          {lead.title}
                        </h4>
                        {isElevated && (
                          <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-950/60 text-indigo-300 border border-indigo-800/60 inline-flex items-center gap-1 font-medium">
                            <User className="w-3 h-3 text-indigo-400" />
                            {getStaffName(lead.assignedToId)}
                          </span>
                        )}
                        <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950/70 text-emerald-300 border border-emerald-800/60 inline-flex items-center gap-1 font-medium">
                          <Globe className="w-3 h-3 text-emerald-400" />
                          {getLeadSource(lead)}
                        </span>
                      </div>
                      <p className="text-zinc-400 mt-0.5">
                        Client: {lead.contact?.name || lead.metadata?.customerName || 'Direct'} · Phone: {lead.contact?.phone || lead.metadata?.customerPhone || '—'}
                        {lead.createdAt && (
                          <span className="ml-1 text-zinc-400">
                            · Received: <strong className="text-zinc-300 font-mono">{new Date(lead.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong>
                          </span>
                        )}
                      </p>
                      {lead.metadata?.followUpNote && (
                        <p className="text-zinc-400 mt-1 italic">&ldquo;{lead.metadata.followUpNote}&rdquo;</p>
                      )}
                    </div>
                    <div className="text-right">
                      <span className="font-mono text-indigo-400 font-semibold block">
                        {lead.taskDueDate.toLocaleDateString([], { month: 'short', day: 'numeric' })} at{' '}
                        {lead.taskDueDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* TAB 3: MISSED / UNANSWERED INBOUND CALLS */}
          {activeTab === 'missed' && (
            <div className="space-y-3">
              {missedCalls.length === 0 ? (
                <div className="p-8 text-center text-zinc-500 rounded-xl border border-zinc-800 bg-zinc-950/20">
                  <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-500/50 mb-2" />
                  <p className="text-sm">No missed calls recorded for your clients.</p>
                </div>
              ) : (
                missedCalls.slice(0, 15).map((call) => (
                  <div key={call.id} className="p-3.5 rounded-xl border border-red-950/60 bg-red-950/10 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400">
                        <PhoneIncoming className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="font-mono font-medium text-white">{call.from}</p>
                        <p className="text-[11px] text-zinc-400">
                          {call.startedAt ? new Date(call.startedAt).toLocaleString() : 'Recent attempt'} · Status: <span className="text-red-300 capitalize">{call.status}</span>
                        </p>
                      </div>
                    </div>
                    <span className="text-[11px] text-zinc-500 font-mono">
                      Leg ID: {call.id.slice(0, 8)}
                    </span>
                  </div>
                ))
              )}
            </div>
          )}

          {/* TAB 4: COMPLETED / HISTORY */}
          {activeTab === 'completed' && (
            <div className="space-y-3">
              {tasks.completed.length === 0 ? (
                <div className="p-8 text-center text-zinc-500 rounded-xl border border-zinc-800 bg-zinc-950/20">
                  <p className="text-sm">No archived follow-ups.</p>
                </div>
              ) : (
                tasks.completed.map((lead) => (
                  <div key={lead.id} className="p-3.5 rounded-xl border border-zinc-800/80 bg-zinc-900/20 flex items-center justify-between text-xs opacity-90 hover:opacity-100 transition">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium text-zinc-200 hover:underline cursor-pointer" onClick={() => handleSelectLead(lead.id)}>
                          {lead.title}
                        </h4>
                        {lead.taskType === 'first_contact_done' && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-950/80 text-emerald-400 border border-emerald-800/60 font-mono">
                            First Contact Done
                          </span>
                        )}
                        <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950/70 text-emerald-300 border border-emerald-800/60 inline-flex items-center gap-1 font-medium">
                          <Globe className="w-3 h-3 text-emerald-400" />
                          {getLeadSource(lead)}
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-500 mt-0.5">
                        Client: {lead.contact?.name || lead.metadata?.customerName || 'Direct'} · Phone: {lead.contact?.phone || lead.metadata?.customerPhone || '—'}
                        {lead.createdAt && (
                          <span className="ml-1 text-zinc-400">
                            · Received: {new Date(lead.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                        {lead.firstContactAt && ` · Contacted: ${new Date(lead.firstContactAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                      </p>
                    </div>
                    <span className="text-emerald-400 flex items-center gap-1 font-medium shrink-0">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Completed
                    </span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}