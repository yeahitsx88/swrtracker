'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiClient } from '@/lib/apiClient';
import { getErrorMessage } from '@/lib/errors';
import { useTicketPage } from '@/lib/use-ticket-page';
import { PaginationControls } from '@/components/forms';
import { CrewWorkActions, TicketCard } from '@/components/tickets';
import { Button, Card, ErrorBanner } from '@/components/ui';
import { ScopedKpiEntry } from '@/components/ui/scoped-kpi-entry';

export default function CrewWorkPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busyTicketId, setBusyTicketId] = useState<string | null>(null);
  const work = useTicketPage(projectId, page, size, { queue: 'fieldWork' }, true, revision);
  const total = work.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / size));
  useEffect(() => { if (work.data && page > pages) setPage(pages); }, [work.data, page, pages]);
  useEffect(() => { setPage(1); }, [projectId]);

  async function runAction(ticketId: string, action: () => Promise<void>) {
    setError(null);
    setBusyTicketId(ticketId);
    try {
      await action();
      setRevision((current) => current + 1);
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to complete workflow action.'));
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
        <ScopedKpiEntry projectId={projectId} audience="field" />
        {error ? <ErrorBanner message={error} /> : null}
        {work.error ? <ErrorBanner message={work.error} /> : null}
        <div className="row">
          <Button variant="secondary" onClick={() => setRevision((current) => current + 1)} disabled={work.loading}>
            {work.loading ? 'Refreshing...' : 'Refresh'}
          </Button>
          <label className="field">Rows<select className="select" value={size} onChange={(event) => { setSize(Number(event.target.value)); setPage(1); }}>{[10, 25, 50, 100].map((count) => <option key={count} value={count}>{count}</option>)}</select></label>
        </div>
        {work.loading ? <p className="muted" role="status">Loading crew work queue...</p> : null}
        {!work.loading && !work.error && total === 0 ? <p className="muted">No actionable crew tickets.</p> : null}
        {work.data?.data.map((ticket) => (
          <section key={ticket.id} className="panel">
            <div className="stack">
              <TicketCard ticket={ticket} detailHref={`/projects/${projectId}/tickets/${ticket.id}`} />
              <CrewWorkActions
                ticket={ticket}
                busy={busyTicketId === ticket.id}
                onStart={(id) => runAction(id, () => apiClient.startTicket(id).then(() => undefined))}
                onSubmitComplete={(id) => runAction(id, () => apiClient.completeTicket(id).then(() => undefined))}
                onDelay={(id, reason) => runAction(id, () => apiClient.delayTicket(id, reason).then(() => undefined))}
                onReportInability={(id, reason) => runAction(id, () => apiClient.reportFieldInability(id, reason).then(() => undefined))}
                onFlagStopWork={(id, reason) => runAction(id, () => apiClient.surveyCancel(id, reason).then(() => undefined))}
                onRestartDelay={(id) => runAction(id, () => apiClient.restartDelayedTicket(id).then(() => undefined))}
              />
            </div>
          </section>
        ))}
        {!work.loading && total > 0 ? <PaginationControls offset={(page - 1) * size} limit={size} total={total} onChange={(offset) => setPage(Math.floor(offset / size) + 1)} /> : null}
      </div>
    </Card>
  );
}
