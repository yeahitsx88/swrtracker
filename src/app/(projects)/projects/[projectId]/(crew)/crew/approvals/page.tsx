'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiClient } from '@/lib/apiClient';
import { getErrorMessage } from '@/lib/errors';
import type { TicketRecord } from '@/lib/contracts';
import { ApprovalActions, TicketCard } from '@/components/tickets';
import { Button, Card, ErrorBanner } from '@/components/ui';

export default function CrewApprovalsPage() {
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
      setError(getErrorMessage(err, 'Unable to load approval queue.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadTickets();
  }, [projectId]);

  const pendingApprovals = useMemo(
    () => tickets.filter((ticket) => ticket.status === 'PENDING_PC_APPROVAL'),
    [tickets],
  );

  async function runAction(ticketId: string, action: () => Promise<void>) {
    setError(null);
    setBusyTicketId(ticketId);
    try {
      await action();
      await loadTickets();
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to process approval action.'));
    } finally {
      setBusyTicketId(null);
    }
  }

  return (
    <Card
      title="Party Chief Approvals"
      description="Queue of tickets in pending PC approval state. Conflict and RBAC errors are shown directly."
    >
      <div className="stack">
        {error ? <ErrorBanner message={error} /> : null}
        <div className="row">
          <Button variant="secondary" onClick={() => void loadTickets()} disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh'}
          </Button>
        </div>
        {loading ? <p className="muted">Loading approval queue...</p> : null}
        {!loading && pendingApprovals.length === 0 ? <p className="muted">No pending approvals.</p> : null}
        {pendingApprovals.map((ticket) => (
          <section key={ticket.id} className="panel">
            <div className="stack">
              <TicketCard ticket={ticket} detailHref={`/projects/${projectId}/tickets/${ticket.id}`} />
              <ApprovalActions
                ticket={ticket}
                busy={busyTicketId === ticket.id}
                onApprove={(id) => runAction(id, () => apiClient.approvePcStatus(id).then(() => undefined))}
                onReject={(id, reason) => runAction(id, () => apiClient.rejectPcStatus(id, reason).then(() => undefined))}
              />
            </div>
          </section>
        ))}
      </div>
    </Card>
  );
}
