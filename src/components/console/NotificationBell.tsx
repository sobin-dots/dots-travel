'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Bell,
  CheckCheck,
  AlertTriangle,
  Clock,
  CalendarClock,
  UserCheck,
  ArrowRight,
  ExternalLink,
} from 'lucide-react';
import { useTaskNotifications, TaskNotification } from '@/hooks/useTaskNotifications';

export function NotificationBell() {
  const router = useRouter();
  const {
    recentNotifications,
    unreadCount,
    overdueCount,
    markAsRead,
    markAllAsRead,
    formatRelativeTime,
  } = useTaskNotifications();

  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getNotificationIcon = (type: TaskNotification['type']) => {
    switch (type) {
      case 'task_overdue':
        return <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />;
      case 'upcoming_reminder':
        return <Clock className="w-4 h-4 text-amber-400 shrink-0" />;
      case 'task_rescheduled':
        return <CalendarClock className="w-4 h-4 text-sky-400 shrink-0" />;
      case 'task_assigned':
        return <UserCheck className="w-4 h-4 text-emerald-400 shrink-0" />;
      default:
        return <Bell className="w-4 h-4 text-zinc-400 shrink-0" />;
    }
  };

  const getIconBg = (type: TaskNotification['type']) => {
    switch (type) {
      case 'task_overdue':
        return 'bg-rose-950/70 border-rose-800/80';
      case 'upcoming_reminder':
        return 'bg-amber-950/70 border-amber-800/80';
      case 'task_rescheduled':
        return 'bg-sky-950/70 border-sky-800/80';
      case 'task_assigned':
        return 'bg-emerald-950/70 border-emerald-800/80';
      default:
        return 'bg-zinc-800 border-zinc-700';
    }
  };

  const handleNotificationClick = (n: TaskNotification) => {
    markAsRead(n.id);
    setIsOpen(false);
    router.push(n.link);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-lg text-zinc-300 hover:text-white hover:bg-zinc-800/80 border border-zinc-800 transition cursor-pointer flex items-center justify-center"
        aria-label="View task notifications"
        title={unreadCount > 0 ? `${unreadCount} unread task notifications` : 'No unread notifications'}
      >
        <Bell className="w-4 h-4" />

        {/* Badge: Red pulse if overdue tasks exist, Amber if normal unread */}
        {unreadCount > 0 && (
          <span
            className={`absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 text-[10px] font-bold rounded-full flex items-center justify-center leading-none ${
              overdueCount > 0
                ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/40 animate-pulse'
                : 'bg-amber-500 text-zinc-950 shadow-md shadow-amber-500/20'
            }`}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Popover */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl z-50 overflow-hidden text-xs">
          {/* Header */}
          <div className="px-4 py-3 border-b border-zinc-800/80 flex items-center justify-between bg-zinc-900/90">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-white text-sm">Notifications</span>
              {unreadCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  {unreadCount} unread
                </span>
              )}
            </div>

            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllAsRead}
                className="text-[11px] text-zinc-400 hover:text-indigo-300 flex items-center gap-1 transition cursor-pointer"
                title="Mark all as read"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>Mark all read</span>
              </button>
            )}
          </div>

          {/* List of recent 5 notifications */}
          <div className="max-h-[380px] overflow-y-auto divide-y divide-zinc-800/50">
            {recentNotifications.length === 0 ? (
              <div className="py-10 text-center px-4">
                <div className="w-10 h-10 rounded-full bg-zinc-800/60 border border-zinc-700/50 flex items-center justify-center mx-auto mb-2 text-zinc-400">
                  <CheckCheck className="w-5 h-5 text-emerald-400" />
                </div>
                <div className="text-zinc-300 font-medium mb-1">All caught up!</div>
                <div className="text-zinc-500 text-[11px]">No overdue or pending task notifications right now.</div>
              </div>
            ) : (
              recentNotifications.map((n) => (
                <div
                  key={n.id}
                  onClick={() => handleNotificationClick(n)}
                  className={`p-3.5 hover:bg-zinc-800/60 transition cursor-pointer flex items-start gap-3 ${
                    !n.read ? 'bg-indigo-950/20' : ''
                  }`}
                >
                  {/* Severity/Type Icon */}
                  <div className={`p-2 rounded-lg border shrink-0 mt-0.5 ${getIconBg(n.type)}`}>
                    {getNotificationIcon(n.type)}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="font-semibold text-zinc-200 truncate">{n.title}</span>
                        {!n.read && (
                          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" title="Unread" />
                        )}
                      </div>
                      <span className="text-[10px] text-zinc-500 whitespace-nowrap shrink-0">
                        {formatRelativeTime(n.timestamp)}
                      </span>
                    </div>

                    <p className="text-zinc-400 text-[11px] line-clamp-2 leading-relaxed mb-1.5">
                      {n.message}
                    </p>

                    <div className="flex items-center gap-2 text-[10px] text-zinc-500">
                      <span className="text-indigo-400/90 hover:underline inline-flex items-center gap-1 font-medium">
                        Open in Cockpit <ExternalLink className="w-2.5 h-2.5" />
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer: View All Notifications */}
          <div className="p-2 border-t border-zinc-800 bg-zinc-950/60">
            <Link
              href="/console/notifications"
              onClick={() => setIsOpen(false)}
              className="w-full py-2 px-3 rounded-lg bg-zinc-800/80 hover:bg-zinc-800 text-indigo-300 hover:text-indigo-200 text-center font-medium flex items-center justify-center gap-1.5 transition text-xs"
            >
              <span>View all notifications</span>
              <ArrowRight className="w-3.5 h-3.5 text-indigo-400" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
