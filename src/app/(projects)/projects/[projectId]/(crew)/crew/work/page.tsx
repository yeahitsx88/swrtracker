'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiClient } from '@/lib/apiClient';
import { ApiClientError } from '@/lib/errors';
import type { TicketRecord } from '@/lib/contracts';
import { CrewWorkActions, TicketCard } from '@/components/tickets';
import { Card, ErrorBanner } from '@/components/ui';

export default function CrewWorkPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const [tickets, setTickets] = useState<TicketRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyTicketId, setBusyTicketId] = useState<string | null>(null);

  async function loadTickets() {
    setLoading(true);
    setError(null);
    try {
      const page = await apiClient.listTickets(projectId, 50, 0);
      setTickets(page.data);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('Unable to load crew tickets.');
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadTickets();
  }, [projectId]);

  const actionableTickets = useMemo(
    () => tickets.filter((ticket) => ['ASSIGNED', 'IN_PROGRESS', 'DELAYED'].includes(ticket.status)),
    [tickets],
  );

  async function runAction(ticketId: string, action: () => Promise<void>) {
    setError(null);
    setBusyTicketId(ticketId);
    try {
      await action();
      await loadTickets();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('Unable to complete workflow action.');
      }
    } finally {
      setBusyTicketId(null);
    }
  }

  return (
    <Card
      title="Crew Work"
      description="Assigned Party Chief and Instrument Man actions. Backend validates transitions and permissions."
    >
      <div className="stack">
        {error ? <ErrorBanner message={error} /> : null}
        {loading ? <p className="muted">Loading crew work queue...</p> : null}
        {!loading && actionableTickets.length === 0 ? <p className="muted">No actionable crew tickets.</p> : null}
        {actionableTickets.map((ticket) => (
          <section key={ticket.id} className="panel">
            <div className="stack">
              <TicketCard ticket={ticket} detailHref={`/projects/${projectId}/tickets/${ticket.id}`} />
              <CrewWorkActions
                ticket={ticket}
                busy={busyTicketId === ticket.id}
                onStart={(id) => runAction(id, () => apiClient.startTicket(id).then(() => undefined))}
                onSubmitComplete={(id) => runAction(id, () => apiClient.completeTicket(id).then(() => undefined))}
                onDelay={(id, reason) => runAction(id, () => apiClient.delayTicket(id, reason).then(() => undefined))}
                onFieldCancel={(id, reason) => runAction(id, () => apiClient.requestFieldCancel(id, reason).then(() => undefined))}
                onRestartDelay={(id) => runAction(id, () => apiClient.restartDelayedTicket(id).then(() => undefined))}
              />
            </div>
          </section>
        ))}
      </div>
    </Card>
  );
}
