'use client';

import { useMemo, useState, useEffect, useCallback } from 'react';
import { useConsole } from '@/context/ConsoleContext';

export type TaskNotificationType = 'task_overdue' | 'upcoming_reminder' | 'task_rescheduled' | 'task_assigned';

export interface TaskNotification {
  id: string;
  type: TaskNotificationType;
  title: string;
  message: string;
  severity: 'urgent' | 'warning' | 'info';
  leadId: string;
  leadTitle: string;
  clientName: string;
  clientPhone?: string;
  destination?: string;
  dueAt?: string;
  note?: string;
  timestamp: string; // ISO string
  read: boolean;
  link: string;
}

function formatRelativeTime(dateString: string): string {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHours = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSec < 60) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  } catch {
    return 'Recently';
  }
}

function formatOverdueDuration(dueAtString: string): string {
  try {
    const dueAt = new Date(dueAtString);
    const now = new Date();
    const diffMs = now.getTime() - dueAt.getTime();
    if (diffMs <= 0) return 'Just now';

    const diffMin = Math.floor(diffMs / (60 * 1000));
    const diffHours = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMin < 60) return `${diffMin}m`;
    if (diffHours < 24) return `${diffHours}h`;
    return `${diffDays}d`;
  } catch {
    return '';
  }
}

export function useTaskNotifications() {
  const { leadsList, currentUser, currentOrg } = useConsole();
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [isLoaded, setIsLoaded] = useState(false);

  // Storage key per user & org
  const storageKey = useMemo(() => {
    const orgId = currentOrg?.id || 'default_org';
    const userId = currentUser?.id || 'default_user';
    return `travel_notifications_read_${orgId}_${userId}`;
  }, [currentOrg?.id, currentUser?.id]);

  // Load read notifications from localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setReadIds(new Set(parsed));
        }
      }
    } catch {
      // Ignore localStorage read errors
    } finally {
      setIsLoaded(true);
    }
  }, [storageKey]);

  // Save read notification IDs
  const persistReadIds = useCallback((newSet: Set<string>) => {
    setReadIds(newSet);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(storageKey, JSON.stringify(Array.from(newSet)));
      } catch {
        // Ignore localStorage write errors
      }
    }
  }, [storageKey]);

  const markAsRead = useCallback((notificationId: string) => {
    setReadIds((prev) => {
      if (prev.has(notificationId)) return prev;
      const next = new Set(prev);
      next.add(notificationId);
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(storageKey, JSON.stringify(Array.from(next)));
        } catch {}
      }
      return next;
    });
  }, [storageKey]);

  // Generate all task notifications dynamically from leadsList
  const allNotifications = useMemo(() => {
    if (!currentUser?.id || !leadsList?.length) return [];

    const now = new Date();
    const isElevated = currentOrg?.role === 'owner' || currentOrg?.role === 'admin';
    const notifications: TaskNotification[] = [];

    // Filter leads relevant to the user
    const userLeads = leadsList.filter((lead: any) => {
      if (isElevated) return true;
      return lead.assignedToId === currentUser.id;
    });

    for (const lead of userLeads) {
      const clientName = lead.contact?.name || lead.title || 'Client Enquiry';
      const clientPhone = lead.contact?.phone || lead.metadata?.customerPhone || undefined;
      const destination = lead.destination || lead.city || undefined;
      const link = `/console/sales-cockpit?leadId=${lead.id}`;
      const isLeadClosed = lead.stage === 'confirmed' || lead.stage === 'lost';

      // 1. OVERDUE TASK
      // Case A: Scheduled follow-up is overdue
      if (!isLeadClosed && lead.nextFollowUpAt) {
        const followUpDate = new Date(lead.nextFollowUpAt);
        if (followUpDate < now) {
          const overdueFor = formatOverdueDuration(lead.nextFollowUpAt);
          const notifId = `overdue-followup-${lead.id}-${lead.nextFollowUpAt}`;
          notifications.push({
            id: notifId,
            type: 'task_overdue',
            title: 'Follow-up Call Overdue',
            message: `Scheduled follow-up for ${clientName} was due ${followUpDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}${overdueFor ? ` (overdue by ${overdueFor})` : ''}.`,
            severity: 'urgent',
            leadId: lead.id,
            leadTitle: lead.title,
            clientName,
            clientPhone,
            destination,
            dueAt: lead.nextFollowUpAt,
            note: lead.metadata?.followUpNote,
            timestamp: lead.nextFollowUpAt,
            read: readIds.has(notifId),
            link,
          });
        }
      }

      // Case B: First contact deadline passed
      if (!isLeadClosed && !lead.firstContactAt && lead.firstContactDueAt) {
        const firstContactDate = new Date(lead.firstContactDueAt);
        if (firstContactDate < now) {
          const overdueFor = formatOverdueDuration(lead.firstContactDueAt);
          const notifId = `overdue-firstcontact-${lead.id}-${lead.firstContactDueAt}`;
          notifications.push({
            id: notifId,
            type: 'task_overdue',
            title: 'Initial Contact Overdue',
            message: `First response deadline for ${clientName} expired${overdueFor ? ` ${overdueFor} ago` : ''}. Client waiting for enquiry response.`,
            severity: 'urgent',
            leadId: lead.id,
            leadTitle: lead.title,
            clientName,
            clientPhone,
            destination,
            dueAt: lead.firstContactDueAt,
            timestamp: lead.firstContactDueAt,
            read: readIds.has(notifId),
            link,
          });
        }
      }

      // 2. UPCOMING REMINDER (Due in next 15 minutes)
      if (!isLeadClosed && lead.nextFollowUpAt) {
        const followUpDate = new Date(lead.nextFollowUpAt);
        const diffMs = followUpDate.getTime() - now.getTime();
        // If due between 0 and 15 minutes from now
        if (diffMs > 0 && diffMs <= 15 * 60 * 1000) {
          const minutesLeft = Math.max(1, Math.ceil(diffMs / (60 * 1000)));
          const notifId = `upcoming-${lead.id}-${lead.nextFollowUpAt}`;
          notifications.push({
            id: notifId,
            type: 'upcoming_reminder',
            title: `Follow-up in ${minutesLeft}m`,
            message: `Follow-up call with ${clientName} scheduled for ${followUpDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`,
            severity: 'warning',
            leadId: lead.id,
            leadTitle: lead.title,
            clientName,
            clientPhone,
            destination,
            dueAt: lead.nextFollowUpAt,
            note: lead.metadata?.followUpNote,
            timestamp: now.toISOString(),
            read: readIds.has(notifId),
            link,
          });
        }
      }

      // 3. TASK RESCHEDULED
      if (lead.metadata?.followUpNote && lead.nextFollowUpAt) {
        const followUpDate = new Date(lead.nextFollowUpAt);
        const notifId = `rescheduled-${lead.id}-${lead.nextFollowUpAt}-${lead.metadata.followUpNote.slice(0, 15)}`;
        notifications.push({
          id: notifId,
          type: 'task_rescheduled',
          title: 'Task Rescheduled',
          message: `Follow-up for ${clientName} rescheduled to ${followUpDate.toLocaleDateString([], { month: 'short', day: 'numeric' })} at ${followUpDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. Note: "${lead.metadata.followUpNote}"`,
          severity: 'warning',
          leadId: lead.id,
          leadTitle: lead.title,
          clientName,
          clientPhone,
          destination,
          dueAt: lead.nextFollowUpAt,
          note: lead.metadata.followUpNote,
          timestamp: lead.updatedAt || lead.nextFollowUpAt,
          read: readIds.has(notifId),
          link,
        });
      }

      // 4. TASK ASSIGNED (Assigned to logged-in user)
      if (lead.assignedToId === currentUser.id && lead.assignedAt) {
        const notifId = `assigned-${lead.id}-${lead.assignedAt}`;
        notifications.push({
          id: notifId,
          type: 'task_assigned',
          title: 'New Task Assigned',
          message: `${clientName} (${lead.title || 'Travel Enquiry'}) has been assigned to you.`,
          severity: 'info',
          leadId: lead.id,
          leadTitle: lead.title,
          clientName,
          clientPhone,
          destination,
          timestamp: lead.assignedAt || lead.createdAt || now.toISOString(),
          read: readIds.has(notifId),
          link,
        });
      }
    }

    // Sort order:
    // 1. Unread first, then read
    // 2. Urgent (Overdue) > Warning (Upcoming/Rescheduled) > Info (Assigned)
    // 3. Newest timestamp / nearest due date first
    const severityScore = { urgent: 3, warning: 2, info: 1 };

    notifications.sort((a, b) => {
      if (a.read !== b.read) return a.read ? 1 : -1;
      const scoreDiff = severityScore[b.severity] - severityScore[a.severity];
      if (scoreDiff !== 0) return scoreDiff;
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });

    return notifications;
  }, [leadsList, currentUser?.id, currentOrg?.role, readIds]);

  const markAllAsRead = useCallback(() => {
    const allIds = new Set(allNotifications.map((n) => n.id));
    persistReadIds(allIds);
  }, [allNotifications, persistReadIds]);

  const unreadCount = useMemo(() => {
    return allNotifications.filter((n) => !n.read).length;
  }, [allNotifications]);

  const overdueCount = useMemo(() => {
    return allNotifications.filter((n) => n.type === 'task_overdue').length;
  }, [allNotifications]);

  const recentNotifications = useMemo(() => {
    return allNotifications.slice(0, 5);
  }, [allNotifications]);

  return {
    notifications: allNotifications,
    recentNotifications,
    unreadCount,
    overdueCount,
    isLoaded,
    markAsRead,
    markAllAsRead,
    formatRelativeTime,
  };
}
