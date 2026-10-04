'use client';

import Link from 'next/link';
import { AdministrationRecords, AdministrationSection } from '@/components/ui/administration-records';
import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/apiClient';
import type { TicketHistoryItem } from '@/lib/contracts';
import { formatCalendarDate } from '@/lib/calendar-date';

interface TicketHistoryProps {
  ticketId: string;
  refreshRevision?: number;
}

const LABELS: Record<string, string> = {
  'ticket.returned_for_correction': 'Returned for correction',
  'ticket.assignment_recorded': 'Assignment recorded',
  'ticket.need_by_revised': 'Need-By date revised',
  'ticket.follow_up_created': 'Follow-up SWR created',
  'attachment.uploaded': 'Attachment uploaded',
  'attachment.downloaded': 'Attachment downloaded',
};

const LIFECYCLE_ORDER: Record<string, number> = {
  CREATED: 0,
  SUBMITTED: 10,
  RETURNED_FOR_CORRECTION: 20,
  APPROVED: 30,
  ASSIGNMENT_RECORDED: 40,
  ASSIGNED: 40,
  IN_PROGRESS: 50,
  DELAYED: 60,
  PENDING_FIELD_VALIDATION: 70,
  COMPLETED: 100,
  REQUESTER_CANCELED: 100,
  FIELD_CANCELED: 100,
  SURVEY_CANCELED: 100,
};

function lifecycleOrder(type: string): number {
  const normalized = type.replace(/^(ticket|attachment)\./, '').toUpperCase();
  return LIFECYCLE_ORDER[normalized] ?? 80;
}

function humanize(value: string): string {
  return LABELS[value] ?? value.replace(/^(ticket|attachment)\./, '').toLowerCase().replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/** Notification and event names for the same moment, e.g. ASSIGNED notice vs assignment row. */
function foldKey(type: string): string {
  const normalized = type.replace(/^(ticket|attachment)\./, '').toUpperCase();
  return normalized === 'ASSIGNMENT_RECORDED' ? 'ASSIGNED' : normalized;
}

function summary(item: TicketHistoryItem): string | null {
  const details = item.details;
  if (typeof details.oldDate === 'string' && typeof details.newDate === 'string') {
    return `${formatCalendarDate(details.oldDate)} → ${formatCalendarDate(details.newDate)}${typeof details.reason === 'string' ? ` · ${details.reason}` : ''}`;
  }
  if (typeof details.reason === 'string') return details.reason;
  if (typeof details.filename === 'string') return details.filename;
  if (item.source === 'ASSIGNMENT') {
    const names = [details.partyChiefName, details.instrumentManName].filter((name) => typeof name === 'string');
    return names.length ? names.join(' · ') : null;
  }
  if (item.source === 'NOTIFICATION' && typeof details.deliveryState === 'string') {
    return `Delivery: ${humanize(details.deliveryState)}`;
  }
  return null;
}

export function TicketHistory({ ticketId, refreshRevision = 0 }: TicketHistoryProps) {
  const [history, setHistory] = useState<TicketHistoryItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    apiClient.getTicketHistory(ticketId)
      .then((response) => { if (active) setHistory(response.history); })
      .catch((err: unknown) => { if (active) setError(err instanceof Error ? err.message : 'Unable to load history'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [ticketId, refreshRevision]);

  if (loading) return <p className="muted">Loading history…</p>;
  if (error) return <p role="alert" className="error-message">{error}</p>;
  if (history.length === 0) return <p className="muted">No history recorded.</p>;

  const orderedHistory = [...history].sort((left, right) => {
    const byTime = new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime();
    if (byTime !== 0) return byTime;
    const byLifecycle = lifecycleOrder(right.type) - lifecycleOrder(left.type);
    if (byLifecycle !== 0) return byLifecycle;
    return left.source.localeCompare(right.source);
  });

  // Presentation only: a notification recorded with the same event is shown on that event's row.
  const notices = new Map<TicketHistoryItem, TicketHistoryItem[]>();
  const shown = orderedHistory.filter((item) => {
    if (item.source !== 'NOTIFICATION') return true;
    const owner = orderedHistory.find((candidate) => candidate.source !== 'NOTIFICATION' &&
      foldKey(candidate.type) === foldKey(item.type) &&
      Math.abs(new Date(candidate.occurredAt).getTime() - new Date(item.occurredAt).getTime()) < 10_000);
    if (!owner) return true;
    notices.set(owner, [...(notices.get(owner) ?? []), item]);
    return false;
  });

  return <AdministrationSection title="Recorded Request History" open><AdministrationRecords label="request history" rows={shown} id={item=>`${item.source}:${item.id}`} columns={[
    {key:'occurred',label:'Time',text:item=>item.occurredAt,render:item=>new Date(item.occurredAt).toLocaleString()},
    {key:'type',label:'Event',text:item=>humanize(item.type)},
    {key:'actor',label:'Actor',text:item=>item.actor?.name??'System'},
    {key:'detail',label:'Evidence',text:item=>summary(item)??''},
    {key:'notices',label:'Related notices',text:item=>(notices.get(item)??[]).map(n=>`${humanize(n.type)} · ${typeof n.details.deliveryState==='string'?humanize(n.details.deliveryState):'Recorded'}`).join('; ')}
  ]} actions={item=>typeof item.details.followUpTicketId==='string'&&typeof item.details.projectId==='string'?<Link className="app-link" href={`/projects/${item.details.projectId}/tickets/${item.details.followUpTicketId}`}>Open follow-up request</Link>:null}/></AdministrationSection>;
}
