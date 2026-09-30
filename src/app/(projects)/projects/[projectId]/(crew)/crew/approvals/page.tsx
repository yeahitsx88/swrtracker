'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiClient } from '@/lib/apiClient';
import { getErrorMessage } from '@/lib/errors';
import { useTicketPage } from '@/lib/use-ticket-page';
import { PaginationControls } from '@/components/forms';
import { ApprovalActions, TicketCard } from '@/components/tickets';
import { Button, Card, ErrorBanner } from '@/components/ui';

export default function CrewApprovalsPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busyTicketId, setBusyTicketId] = useState<string | null>(null);
  const approvals = useTicketPage(projectId, page, size, { queue: 'pcApprovals' }, true, revision);
  const total = approvals.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / size));
  useEffect(() => { if (approvals.data && page > pages) setPage(pages); }, [approvals.data, page, pages]);
  useEffect(() => { setPage(1); }, [projectId]);

  async function runAction(ticketId: string, action: () => Promise<void>) {
    setError(null);
    setBusyTicketId(ticketId);
    try {
      await action();
      setRevision((current) => current + 1);
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
        {approvals.error ? <ErrorBanner message={approvals.error} /> : null}
        <div className="row">
          <Button variant="secondary" onClick={() => setRevision((current) => current + 1)} disabled={approvals.loading}>
            {approvals.loading ? 'Refreshing...' : 'Refresh'}
          </Button>
          <label className="field">Rows<select className="select" value={size} onChange={(event) => { setSize(Number(event.target.value)); setPage(1); }}>{[10, 25, 50, 100].map((count) => <option key={count} value={count}>{count}</option>)}</select></label>
        </div>
        {approvals.loading ? <p className="muted" role="status">Loading approval queue...</p> : null}
        {!approvals.loading && !approvals.error && total === 0 ? <p className="muted">No pending approvals.</p> : null}
        {approvals.data?.data.map((ticket) => (
          <section key={ticket.id} className="panel">
            <div className="stack">
              <TicketCard ticket={ticket} detailHref={`/projects/${projectId}/tickets/${ticket.id}`} />
              {ticket.status === 'PENDING_FIELD_VALIDATION' ? (
                <div className="row">
                  <Button disabled={busyTicketId === ticket.id} onClick={() => {
                    const reason = window.prompt('Validated return reason');
                    if (reason?.trim()) void runAction(ticket.id, () => apiClient.validateFieldInability(ticket.id, reason).then(() => undefined));
                  }}>Validate and Return</Button>
                  <Button variant="secondary" disabled={busyTicketId === ticket.id} onClick={() => {
                    const reason = window.prompt('Reason to reject the inability report');
                    if (reason?.trim()) void runAction(ticket.id, () => apiClient.rejectFieldInability(ticket.id, reason).then(() => undefined));
                  }}>Reject and Resume</Button>
                </div>
              ) : (
                <ApprovalActions
                  ticket={ticket}
                  busy={busyTicketId === ticket.id}
                  onApprove={(id) => runAction(id, () => apiClient.approvePcStatus(id).then(() => undefined))}
                  onReject={(id, reason) => runAction(id, () => apiClient.rejectPcStatus(id, reason).then(() => undefined))}
                />
              )}
            </div>
          </section>
        ))}
        {!approvals.loading && total > 0 ? <PaginationControls offset={(page - 1) * size} limit={size} total={total} onChange={(offset) => setPage(Math.floor(offset / size) + 1)} /> : null}
      </div>
    </Card>
  );
}
