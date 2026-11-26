'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Bell,
  CheckCheck,
  AlertTriangle,
  Clock,
  CalendarClock,
  UserCheck,
  Search,
  ExternalLink,
  RefreshCw,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Filter,
} from 'lucide-react';
import { useTaskNotifications, TaskNotification, TaskNotificationType } from '@/hooks/useTaskNotifications';
import { useConsole } from '@/context/ConsoleContext';

export default function NotificationsPage() {
  const router = useRouter();
  const { fetchData, loading } = useConsole();
  const {
    notifications,
    unreadCount,
    overdueCount,
    markAsRead,
    markAllAsRead,
    formatRelativeTime,
  } = useTaskNotifications();

  const [activeFilter, setActiveFilter] = useState<'all' | 'unread' | 'task_overdue' | 'upcoming_reminder' | 'task_rescheduled' | 'task_assigned'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Counts per filter tab
  const counts = useMemo(() => {
    return {
      all: notifications.length,
      unread: notifications.filter((n) => !n.read).length,
      task_overdue: notifications.filter((n) => n.type === 'task_overdue').length,
      upcoming_reminder: notifications.filter((n) => n.type === 'upcoming_reminder').length,
      task_rescheduled: notifications.filter((n) => n.type === 'task_rescheduled').length,
      task_assigned: notifications.filter((n) => n.type === 'task_assigned').length,
    };
  }, [notifications]);

  // Filtered and searched list
  const filteredNotifications = useMemo(() => {
    let list = notifications;

    if (activeFilter === 'unread') {
      list = list.filter((n) => !n.read);
    } else if (activeFilter !== 'all') {
      list = list.filter((n) => n.type === activeFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (n) =>
          n.title.toLowerCase().includes(q) ||
          n.clientName.toLowerCase().includes(q) ||
          n.leadTitle.toLowerCase().includes(q) ||
          (n.destination && n.destination.toLowerCase().includes(q)) ||
          (n.note && n.note.toLowerCase().includes(q)) ||
          n.message.toLowerCase().includes(q)
      );
    }

    return list;
  }, [notifications, activeFilter, searchQuery]);

  const getNotificationBadge = (type: TaskNotificationType) => {
    switch (type) {
      case 'task_overdue':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-950/80 text-rose-300 border border-rose-800/80 uppercase tracking-wider">
            <AlertTriangle className="w-3 h-3 text-rose-400" /> Overdue
          </span>
        );
      case 'upcoming_reminder':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-950/80 text-amber-300 border border-amber-800/80 uppercase tracking-wider">
            <Clock className="w-3 h-3 text-amber-400" /> Due Soon
          </span>
        );
      case 'task_rescheduled':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-sky-950/80 text-sky-300 border border-sky-800/80 uppercase tracking-wider">
            <CalendarClock className="w-3 h-3 text-sky-400" /> Rescheduled
          </span>
        );
      case 'task_assigned':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950/80 text-emerald-300 border border-emerald-800/80 uppercase tracking-wider">
            <UserCheck className="w-3 h-3 text-emerald-400" /> Assigned
          </span>
        );
    }
  };

  const handleCardClick = (n: TaskNotification) => {
    markAsRead(n.id);
    router.push(n.link);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800/80">
        <div>
          <div className="flex items-center gap-2 text-xs text-zinc-400 mb-1">
            <Link href="/console" className="hover:text-zinc-200 transition">
              Console
            </Link>
            <span>/</span>
            <span className="text-zinc-200 font-medium">Notifications</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-gradient-to-tr from-indigo-600/30 to-violet-500/20 border border-indigo-500/30 text-indigo-400">
              <Bell className="w-5 h-5" />
            </div>
            Task Notifications
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1">
            Stay on track with assigned tasks, rescheduled callbacks, upcoming reminders, and overdue follow-ups.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={fetchData}
            disabled={loading}
            className="px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-xs text-zinc-300 flex items-center gap-1.5 transition cursor-pointer"
            title="Refresh notifications"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Sync</span>
          </button>

          {unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllAsRead}
              className="px-3 py-2 rounded-lg bg-indigo-600/20 border border-indigo-500/40 hover:bg-indigo-600/30 text-xs text-indigo-200 font-medium flex items-center gap-1.5 transition cursor-pointer"
            >
              <CheckCheck className="w-3.5 h-3.5 text-indigo-400" />
              <span>Mark all as read</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabs & Search Filter */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        {/* Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
          <button
            type="button"
            onClick={() => setActiveFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              activeFilter === 'all'
                ? 'bg-zinc-800 text-white border border-zinc-700'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
            }`}
          >
            All
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-zinc-800 text-zinc-300">
              {counts.all}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveFilter('unread')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              activeFilter === 'unread'
                ? 'bg-zinc-800 text-white border border-zinc-700'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
            }`}
          >
            Unread
            {counts.unread > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 font-bold">
                {counts.unread}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveFilter('task_overdue')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              activeFilter === 'task_overdue'
                ? 'bg-rose-950/70 text-rose-200 border border-rose-800/80'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
            }`}
          >
            Overdue
            {counts.task_overdue > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-rose-900/60 text-rose-300 font-bold">
                {counts.task_overdue}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveFilter('upcoming_reminder')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              activeFilter === 'upcoming_reminder'
                ? 'bg-amber-950/70 text-amber-200 border border-amber-800/80'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
            }`}
          >
            Upcoming
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-zinc-800 text-zinc-300">
              {counts.upcoming_reminder}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveFilter('task_rescheduled')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              activeFilter === 'task_rescheduled'
                ? 'bg-sky-950/70 text-sky-200 border border-sky-800/80'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
            }`}
          >
            Rescheduled
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-zinc-800 text-zinc-300">
              {counts.task_rescheduled}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveFilter('task_assigned')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              activeFilter === 'task_assigned'
                ? 'bg-emerald-950/70 text-emerald-200 border border-emerald-800/80'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
            }`}
          >
            Assigned
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-zinc-800 text-zinc-300">
              {counts.task_assigned}
            </span>
          </button>
        </div>

        {/* Search input */}
        <div className="relative min-w-[240px] sm:min-w-[280px]">
          <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by client, title, destination..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-indigo-500/60 transition"
          />
        </div>
      </div>

      {/* Notifications List */}
      <div className="space-y-2.5">
        {filteredNotifications.length === 0 ? (
          <div className="p-12 text-center border border-zinc-800/80 rounded-2xl bg-zinc-900/40">
            <div className="w-12 h-12 rounded-full bg-zinc-800/60 border border-zinc-700/50 flex items-center justify-center mx-auto mb-3 text-zinc-400">
              <CheckCircle2 className="w-6 h-6 text-emerald-400" />
            </div>
            <h3 className="text-zinc-200 font-semibold text-base mb-1">No notifications found</h3>
            <p className="text-zinc-500 text-xs max-w-sm mx-auto">
              {searchQuery
                ? 'No notifications match your search query. Try clearing the search.'
                : activeFilter === 'unread'
                ? 'You have read all your task notifications. Great work!'
                : 'There are no active task notifications for this filter.'}
            </p>
          </div>
        ) : (
          filteredNotifications.map((n) => (
            <div
              key={n.id}
              className={`p-4 rounded-xl border transition flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                !n.read
                  ? 'bg-zinc-900/90 border-indigo-500/30 shadow-md shadow-indigo-950/20'
                  : 'bg-zinc-900/40 border-zinc-800/80 hover:border-zinc-700'
              }`}
            >
              <div className="flex items-start gap-3.5 min-w-0 flex-1">
                {/* Type Indicator Icon */}
                <div
                  className={`p-2.5 rounded-xl border shrink-0 mt-0.5 ${
                    n.type === 'task_overdue'
                      ? 'bg-rose-950/70 border-rose-800/80 text-rose-400'
                      : n.type === 'upcoming_reminder'
                      ? 'bg-amber-950/70 border-amber-800/80 text-amber-400'
                      : n.type === 'task_rescheduled'
                      ? 'bg-sky-950/70 border-sky-800/80 text-sky-400'
                      : 'bg-emerald-950/70 border-emerald-800/80 text-emerald-400'
                  }`}
                >
                  {n.type === 'task_overdue' && <AlertTriangle className="w-4 h-4" />}
                  {n.type === 'upcoming_reminder' && <Clock className="w-4 h-4" />}
                  {n.type === 'task_rescheduled' && <CalendarClock className="w-4 h-4" />}
                  {n.type === 'task_assigned' && <UserCheck className="w-4 h-4" />}
                </div>

                {/* Content */}
                <div className="space-y-1 min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {getNotificationBadge(n.type)}
                    <h3 className="font-semibold text-zinc-100 text-sm truncate">{n.title}</h3>
                    {!n.read && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                        New
                      </span>
                    )}
                    <span className="text-[11px] text-zinc-500 ml-auto sm:ml-0">
                      • {formatRelativeTime(n.timestamp)}
                    </span>
                  </div>

                  <p className="text-xs text-zinc-300 leading-relaxed">{n.message}</p>

                  {/* Context chips */}
                  <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] text-zinc-400">
                    <span className="font-medium text-zinc-300">Client: {n.clientName}</span>
                    {n.destination && (
                      <>
                        <span className="text-zinc-600">•</span>
                        <span>Destination: {n.destination}</span>
                      </>
                    )}
                    {n.dueAt && (
                      <>
                        <span className="text-zinc-600">•</span>
                        <span className="text-amber-400/90 font-mono">
                          Due: {new Date(n.dueAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 shrink-0 sm:self-center pt-2 sm:pt-0 border-t sm:border-t-0 border-zinc-800/80">
                {!n.read && (
                  <button
                    type="button"
                    onClick={() => markAsRead(n.id)}
                    className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition text-xs"
                    title="Mark as read"
                  >
                    <CheckCheck className="w-4 h-4" />
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => handleCardClick(n)}
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs flex items-center gap-1.5 transition shadow-sm shadow-indigo-600/30 cursor-pointer"
                >
                  <span>Open in Cockpit</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
