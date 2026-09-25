'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/apiClient';
import type { TicketHistoryItem } from '@/lib/contracts';

interface TicketHistoryProps {
  ticketId: string;
}

const LABELS: Record<string, string> = {
  'ticket.returned_for_correction': 'Returned for correction',
  'ticket.assignment_recorded': 'Assignment recorded',
  'ticket.need_by_revised': 'Need-By date revised',
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

function summary(item: TicketHistoryItem): string | null {
  const details = item.details;
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

export function TicketHistory({ ticketId }: TicketHistoryProps) {
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
  }, [ticketId]);

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

  return (
    <ol className="ticket-history" aria-label="SWR history">
      {orderedHistory.map((item) => {
        const detail = summary(item);
        return (
          <li key={`${item.source}:${item.id}`} className="ticket-card">
            <p className="ticket-headline">{humanize(item.type)}</p>
            <p className="muted">
              {new Date(item.occurredAt).toLocaleString()}
              {item.actor ? ` · ${item.actor.name}` : ''}
            </p>
            {detail ? <p>{detail}</p> : null}
          </li>
        );
      })}
    </ol>
  );
}
