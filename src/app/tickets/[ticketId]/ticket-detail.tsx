'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, ApiError, errorMessage } from '@/app/ui/api';
import { Shell } from '@/app/ui/shell';
import { Attachments } from '@/app/ui/attachments';
import type { RequestTicket } from '@/app/ui/request-types';
import { RequesterActions } from './requester-actions';
import { ReviewActions } from './review-actions';
import { AssignmentActions } from './assignment-actions';
import { ReassignmentActions } from './reassignment-actions';
import { SuperintendentActions } from './superintendent-actions';
import { FieldActions } from './field-actions';
import { SurveyCancelActions } from './survey-cancel-actions';
import { PriorityActions } from './priority-actions';
import { CadActions } from './cad-actions';

const typeLabels: Record<string, string> = {
  LAYOUT: 'Field layout', CHECK_OUT: 'Equipment check-out', AS_BUILT: 'As-built survey',
  TOPO: 'Topographic survey', PERMIT: 'Permit survey',
};
const cadLabels = { NOT_REQUIRED: 'Not required', NOT_STARTED: 'Not started',
  IN_PROGRESS: 'In progress', QA_PENDING: 'Awaiting CAD review', COMPLETE: 'Complete' };

export function TicketDetail({ ticketId }: { ticketId: string }) {
  const [ticket, setTicket] = useState<RequestTicket | null>(null);
  const [error, setError] = useState('');
  const [authNeeded, setAuthNeeded] = useState(false);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  useEffect(() => {
    let current = true; setLoading(true); setError('');
    api<{ ticket: RequestTicket }>(`/api/tickets/${ticketId}`).then(result => {
      if (current) { setTicket(result.ticket); setAuthNeeded(false); }
    }).catch(cause => {
      if (current) { setTicket(null); setError(errorMessage(cause)); setAuthNeeded(cause instanceof ApiError && cause.status === 401); }
    }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [ticketId, revision]);
  return <Shell projectId={ticket?.projectId} signedIn={Boolean(ticket)}>
    <p className="eyebrow">{ticket?.projectName ?? 'Survey support'}</p>
    <h1>{ticket?.ticketNumber ?? 'Request details'}</h1>
    {loading && <p role="status">Loading request…</p>}
    {error && <div className="notice error" role="alert">{error}
      {authNeeded && <p><Link href={`/login?next=${encodeURIComponent(`/tickets/${ticketId}`)}`}>Sign in to view this request</Link></p>}</div>}
    {ticket && !loading && <>
      <span className="pill">{ticket.displayStatus}</span>
      <section className="panel"><h2>{ticket.craft || 'Work details'}</h2>
        <dl className="details"><div><dt>Location</dt><dd>{ticket.locationName ?? 'Not selected'}</dd></div>
          <div><dt>Request type</dt><dd>{ticket.ticketType ? typeLabels[ticket.ticketType] : 'Not selected'}</dd></div>
          <div><dt>Department</dt><dd>{ticket.departmentName ?? 'Not selected'}</dd></div>
          <div><dt>Requested for</dt><dd>{ticket.requestedDate ? new Date(ticket.requestedDate).toLocaleString() : 'Not selected'}</dd></div>
          <div><dt>Submitted</dt><dd>{ticket.submittedAt ? new Date(ticket.submittedAt).toLocaleString() : 'Not submitted'}</dd></div></dl>
        <h2>Description</h2><p className="description">{ticket.description || 'No description yet.'}</p>
      </section>
      {ticket.rejectionReason && <section className="notice warning"><h2>Reason for rejection</h2><p className="description">{ticket.rejectionReason}</p></section>}
      {ticket.delayedReason && <section className="notice warning"><h2>Delay information</h2><p className="description">{ticket.delayedReason}</p></section>}
      {ticket.cancelReason && <section className="notice"><h2>Cancellation information</h2><p className="description">{ticket.cancelReason}</p></section>}
      <section className="panel"><h2>CAD work</h2>
        {ticket.cad ? <><p>{cadLabels[ticket.cad.status]}</p>
          {ticket.cad.completedAt && <p>Completed: {new Date(ticket.cad.completedAt).toLocaleString()}</p>}</>
          : <p>No CAD work record is available for this request.</p>}
        <CadActions ticketId={ticket.id} allowed={ticket.canSignOffCad} canActivate={ticket.canActivateCad} progressAction={ticket.cadProgressAction} disabled={attachmentBusy || actionBusy}
          onBusyChange={setActionBusy} onChanged={() => { setActionBusy(false); setRevision(value => value + 1); }} />
      </section>
      {(ticket.partyChiefName || ticket.instrumentManName || ticket.superintendentName) && <section className="panel"><h2>Assigned crew</h2>
        <dl className="details">{ticket.partyChiefName && <div><dt>Party Chief</dt><dd>{ticket.partyChiefName}</dd></div>}
          {ticket.instrumentManName && <div><dt>Instrument Man</dt><dd>{ticket.instrumentManName}</dd></div>}
          {ticket.superintendentName && <div><dt>Superintendent</dt><dd>{ticket.superintendentName}</dd></div>}</dl>
      </section>}
      <ReviewActions ticket={ticket} disabled={attachmentBusy || actionBusy} onBusyChange={setActionBusy} onReviewed={() => { setActionBusy(false); setRevision(value => value + 1); }} />
      <AssignmentActions ticket={ticket} disabled={attachmentBusy || actionBusy} onBusyChange={setActionBusy} onAssigned={() => { setActionBusy(false); setRevision(value => value + 1); }} />
      <ReassignmentActions ticket={ticket} disabled={attachmentBusy || actionBusy} onBusyChange={setActionBusy} onChanged={() => { setActionBusy(false); setRevision(value => value + 1); }} />
      <SuperintendentActions ticket={ticket} disabled={attachmentBusy || actionBusy} onBusyChange={setActionBusy} onChanged={() => { setActionBusy(false); setRevision(value => value + 1); }} />
      <FieldActions ticket={ticket} disabled={attachmentBusy || actionBusy} onBusyChange={setActionBusy} onChanged={() => { setActionBusy(false); setRevision(value => value + 1); }} />
      <SurveyCancelActions ticket={ticket} disabled={attachmentBusy || actionBusy} onBusyChange={setActionBusy} onChanged={() => { setActionBusy(false); setRevision(value => value + 1); }} />
      <PriorityActions ticket={ticket} disabled={attachmentBusy || actionBusy} onBusyChange={setActionBusy} onChanged={() => { setActionBusy(false); setRevision(value => value + 1); }} />
      <RequesterActions ticket={ticket} disabled={attachmentBusy || actionBusy} onBusyChange={setActionBusy} onCanceled={() => setRevision(value => value + 1)} />
      <Attachments key={revision} ticketId={ticket.id} disabled={actionBusy} onBusyChange={setAttachmentBusy} />
      <div className="actions"><button className="secondary" disabled={attachmentBusy || actionBusy} onClick={() => setRevision(value => value + 1)}>Refresh status</button>
        {ticket.status === 'DRAFT' && <Link className="button" href={`/project/${ticket.projectId}/request?draft=${ticket.id}`}>Continue draft</Link>}
        <Link href={`/project/${ticket.projectId}/requests`}>Project requests</Link></div>
    </>}
  </Shell>;
}
