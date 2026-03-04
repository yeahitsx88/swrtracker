'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiClient } from '@/lib/apiClient';
import { getErrorMessage } from '@/lib/errors';
import type { TicketRecord, TicketStatus } from '@/lib/contracts';
import { PaginationControls } from '@/components/forms';
import { TicketList } from '@/components/tickets';
import { Button, Card, ErrorBanner } from '@/components/ui';

const LIMIT = 20;
const CANCELABLE_STATUSES = new Set<TicketStatus>([
  'SUBMITTED',
  'APPROVED',
  'ASSIGNED',
  'IN_PROGRESS',
  'PENDING_PC_APPROVAL',
  'DELAYED',
  'REJECTED',
]);

export default function MyRequestsPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const [tickets, setTickets] = useState<TicketRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyCancelId, setBusyCancelId] = useState<string | null>(null);

  async function loadTickets() {
    setLoading(true);
    setError(null);
    try {
      const page = await apiClient.listTickets(projectId, LIMIT, offset);
      setTickets(page.data);
      setTotal(page.total);
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to load requester tickets.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadTickets();
  }, [projectId, offset]);

  const submittedTickets = useMemo(
    () => tickets.filter((ticket) => ticket.status !== 'DRAFT'),
    [tickets],
  );

  const cancelableTickets = useMemo(
    () => submittedTickets.filter((ticket) => CANCELABLE_STATUSES.has(ticket.status)),
    [submittedTickets],
  );

  async function cancelTicket(ticketId: string) {
    const confirm = window.confirm('Cancel this ticket as requester? This action is permanent.');
    if (!confirm) return;

    setError(null);
    setBusyCancelId(ticketId);
    try {
      await apiClient.requesterCancel(ticketId);
      await loadTickets();
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to cancel ticket.'));
    } finally {
      setBusyCancelId(null);
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
        {cancelableTickets.length > 0 ? (
          <div className="stack">
            <p className="muted">Quick cancel for active requester-cancelable tickets:</p>
            <div className="row">
              {cancelableTickets.map((ticket) => (
                <Button
                  key={ticket.id}
                  variant="secondary"
                  disabled={busyCancelId === ticket.id}
                  onClick={() => void cancelTicket(ticket.id)}
                >
                  {busyCancelId === ticket.id ? 'Canceling...' : `Cancel ${ticket.ticketNumber ?? ticket.id.slice(0, 8)}`}
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
