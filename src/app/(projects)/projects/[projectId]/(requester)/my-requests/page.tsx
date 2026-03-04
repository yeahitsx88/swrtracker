'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiClient } from '@/lib/apiClient';
import { ApiClientError } from '@/lib/errors';
import type { TicketRecord } from '@/lib/contracts';
import { PaginationControls } from '@/components/forms';
import { TicketList } from '@/components/tickets';
import { Button, Card, ErrorBanner } from '@/components/ui';

const LIMIT = 20;

export default function MyRequestsPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const [tickets, setTickets] = useState<TicketRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function loadTickets() {
      setLoading(true);
      setError(null);
      try {
        const page = await apiClient.listTickets(projectId, LIMIT, offset);
        if (!active) return;
        setTickets(page.data);
        setTotal(page.total);
      } catch (err) {
        if (!active) return;
        if (err instanceof ApiClientError) {
          setError(err.message);
        } else {
          setError('Unable to load requester tickets.');
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadTickets();
    return () => {
      active = false;
    };
  }, [projectId, offset]);

  const submittedTickets = useMemo(
    () => tickets.filter((ticket) => ticket.status !== 'DRAFT'),
    [tickets],
  );

  async function cancelTicket(ticketId: string) {
    setError(null);
    try {
      await apiClient.requesterCancel(ticketId);
      const refreshed = await apiClient.listTickets(projectId, LIMIT, offset);
      setTickets(refreshed.data);
      setTotal(refreshed.total);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('Unable to cancel ticket.');
      }
    }
  }

  return (
    <Card
      title="My Requests"
      description="Requester dashboard backed by role-scoped ticket list APIs."
    >
      <div className="stack">
        {error ? <ErrorBanner message={error} /> : null}
        {loading ? <p className="muted">Loading tickets...</p> : null}
        {!loading ? <TicketList projectId={projectId} tickets={submittedTickets} /> : null}
        {submittedTickets.length > 0 ? (
          <div className="stack">
            <p className="muted">Quick cancel (requester-allowed active statuses only):</p>
            <div className="row">
              {submittedTickets.map((ticket) => (
                <Button
                  key={ticket.id}
                  variant="secondary"
                  onClick={() => void cancelTicket(ticket.id)}
                >
                  Cancel {ticket.ticketNumber ?? ticket.id.slice(0, 8)}
                </Button>
              ))}
            </div>
          </div>
        ) : null}
        <PaginationControls
          offset={offset}
          limit={LIMIT}
          total={total}
          onChange={setOffset}
        />
      </div>
    </Card>
  );
}
