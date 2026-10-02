'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiClient } from '@/lib/apiClient';
import { getErrorMessage } from '@/lib/errors';
import { RetryableMutation } from '@/lib/retryable-mutation';
import { formatCalendarDate } from '@/lib/calendar-date';
import { ticketTypeLabel } from '@/lib/display-labels';
import { useAreaNames } from '@/lib/use-area-names';
import { Icon } from '@/components/ui/icon';
import type { TicketRecord } from '@/lib/contracts';
import { PaginationControls } from '@/components/forms';
import { Button, Card, ErrorBanner, Select, SuccessBanner } from '@/components/ui';

export default function DraftsPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const areaNames = useAreaNames(projectId);
  const [tickets, setTickets] = useState<TicketRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [limit, setLimit] = useState(20);
  const [deleting, setDeleting] = useState(false);
  const busy = useRef(false);
  const attempt = useRef(new RetryableMutation<{ ticketId:string; expectedVersion:number }>());

  async function loadDrafts() {
    setLoading(true);
    setError(null);
    try {
      const page = await apiClient.listTickets(projectId, limit, offset, { status: 'DRAFT' });
      setTickets(page.data);
      setTotal(page.total);
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to load draft tickets.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDrafts();
  }, [projectId, offset, limit]);

  async function remove(ticket:TicketRecord) {
    if (busy.current) return;
    busy.current = true; setDeleting(true); setError(null); setSuccess(null);
    try {
      await attempt.current.run({ ticketId:ticket.id, expectedVersion:ticket.rowVersion ?? 0 },
        (input,key) => apiClient.deleteDraft(input.ticketId,input.expectedVersion,key));
      setTickets(items => items.filter(item => item.id !== ticket.id)); setTotal(count => count-1);
      setSuccess('Draft deleted. Project IT can restore it within 30 days; its files and history are retained.');
      if (tickets.length === 1 && offset > 0) setOffset(value => Math.max(0,value-limit));
    } catch (err) { setError(getErrorMessage(err,'Unable to confirm deletion. Retry the same draft; no permanent purge occurs.')); }
    finally { busy.current = false; setDeleting(false); }
  }

  return (
    <Card actions={<Link className="button" href={`/projects/${projectId}/request/new`}><Icon name="plus" />Start a new request</Link>} title="Drafts" description="Saved progress, not submitted work. Resume a draft when you’re ready; deleted drafts can be recovered by Project IT within 30 days.">
      <div className="stack">
        {error ? <ErrorBanner message={error} /> : null}
        {success ? <SuccessBanner message={success} /> : null}
        
        {loading ? <p className="muted">Loading drafts...</p> : null}
        {!loading && tickets.length === 0 && !error ? <div className="empty-state"><strong>No saved drafts</strong><span>Start a request and use Save Draft at any step.</span></div> : null}
        {!loading ? tickets.map(ticket => <article className="ticket-card request-card" key={ticket.id}>
          <div className="request-card-top"><span className="badge status-badge tone-neutral">Draft</span>
            {ticket.draftLastSavedAt ? <span className="meta-item muted"><Icon name="clock" size={15} />Saved {new Date(ticket.draftLastSavedAt).toLocaleString()}</span> : null}</div>
          <p className={`request-title${ticket.description ? '' : ' request-title-empty'}`}>{ticket.description ? ticket.description.length > 160 ? `${ticket.description.slice(0,160)}…` : ticket.description : 'Untitled draft'}</p>
          <div className="meta-row">
            {ticket.aorNodeId && areaNames.get(ticket.aorNodeId) ? <span className="meta-item"><Icon name="pin" size={15} />{areaNames.get(ticket.aorNodeId)!.path}</span> : null}
            <span className="meta-item">{ticketTypeLabel(ticket.ticketType)}</span>
            <span className="meta-item"><Icon name="calendar" size={15} />{ticket.requestedDate ? `Need-By ${formatCalendarDate(ticket.requestedDate)}` : 'No Need-By yet'}</span>
          </div>
          <div className="card-actions"><Link className="button" href={`/projects/${projectId}/request/new?draft=${ticket.id}`}>Resume draft</Link>
            <Link className="button button-secondary" href={`/projects/${projectId}/tickets/${ticket.id}`}>Saved details and files</Link>
            <Button variant="secondary" disabled={deleting || Boolean(attempt.current.pending && attempt.current.pending.input.ticketId !== ticket.id)} onClick={() => void remove(ticket)}>{attempt.current.pending?.input.ticketId === ticket.id ? 'Retry Delete Draft' : 'Delete Draft'}</Button></div>
        </article>) : null}
        {error ? (
          <Button variant="secondary" disabled={deleting || Boolean(attempt.current.pending)} onClick={() => void loadDrafts()}>
            Retry
          </Button>
        ) : null}
        <label className="field"><span className="field-label">Drafts per page</span><Select disabled={deleting || Boolean(attempt.current.pending)} value={limit} onChange={event => { setLimit(Number(event.target.value)); setOffset(0); }}>{[10,20,50,100].map(size => <option key={size} value={size}>{size}</option>)}</Select></label>
        <PaginationControls
          offset={offset}
          limit={limit}
          total={total}
          onChange={next => { if (!deleting && !attempt.current.pending) setOffset(next); }}
        />
      </div>
    </Card>
  );
}
