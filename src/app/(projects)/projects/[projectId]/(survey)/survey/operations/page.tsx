'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiClient } from '@/lib/apiClient';
import { getErrorMessage } from '@/lib/errors';
import type {
  AmeliaMetricsRecord,
  LocalNotificationPreviewRecord,
  ProjectMemberRecord,
  TicketRecord,
} from '@/lib/contracts';
import { Button, Card, ErrorBanner, SuccessBanner } from '@/components/ui';
import { StatusBadge } from '@/components/ui/status-badge';
import { OperationsHealth } from '@/components/ui/operations-health';
import { operationsServerPage, operationsPage, operationsStatusLabel } from '@/lib/operations-view';
import { useTicketPage } from '@/lib/use-ticket-page';
import type { TicketPriority, TicketStatus } from '@/lib/contracts';
import './operations.css';

export default function SurveyOperationsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [revision, setRevision] = useState(0);
  const [members, setMembers] = useState<ProjectMemberRecord[]>([]);
  const [metrics, setMetrics] = useState<AmeliaMetricsRecord | null>(null);
  const [messages, setMessages] = useState<LocalNotificationPreviewRecord[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [tab, setTab] = useState<'assignment' | 'open' | 'messages'>('assignment');
  const [query, setQuery] = useState('');
  const [area, setArea] = useState('');
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [delivery, setDelivery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const queueRef = useRef<HTMLDivElement>(null);

  async function loadOperations() { setRevision(value => value + 1); }

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setMetrics(null);
    apiClient.getProjectMetrics(projectId)
      .then(response => { if (active) setMetrics(response.metrics); })
      .catch(err => { if (active) setError(getErrorMessage(err, 'Unable to load Survey operations.')); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [projectId, revision]);

  useEffect(() => {
    if (!metrics || tab !== 'assignment') return;
    let active = true;
    setMembers([]);
    apiClient.listProjectMembers(projectId).then(response => { if (active) setMembers(response.members); })
      .catch(err => { if (active) setError(getErrorMessage(err, 'Unable to load crew choices.')); });
    return () => { active = false; };
  }, [projectId, metrics, tab]);

  const [messagesLoading, setMessagesLoading] = useState(false);
  useEffect(() => {
    if (!metrics || tab !== 'messages') return;
    let active = true;
    setMessagesLoading(true); setMessages([]);
    apiClient.listLocalNotificationPreviews(projectId).then(response => { if (active) setMessages(response.messages); })
      .catch(err => { if (active) setError(getErrorMessage(err, 'Unable to load messages.')); })
      .finally(() => { if (active) setMessagesLoading(false); });
    return () => { active = false; };
  }, [projectId, metrics, tab]);

  const ticketQuery = useTicketPage(projectId, page, pageSize, {
    queue: tab === 'assignment' ? 'assignment' : 'open', query: query.trim() || undefined,
    areaId: area || undefined, status: tab === 'open' && status ? status as TicketStatus : undefined,
    priority: priority ? priority as TicketPriority : undefined,
  }, !!metrics && tab !== 'messages', revision);
  useEffect(() => {
    if (ticketQuery.data && page > Math.max(1, Math.ceil(ticketQuery.data.total / pageSize))) setPage(Math.max(1, Math.ceil(ticketQuery.data.total / pageSize)));
  }, [ticketQuery.data, page, pageSize]);
  const partyChiefs = members.filter((member) => member.role === 'PARTY_CHIEF');
  const instrumentMen = members.filter((member) => member.role === 'INSTRUMENT_MAN');
  const areas = [...new Map(metrics?.openByAreaStatus.map(row => [row.areaId, row.areaName]) ?? []).entries()];
  const filteredMessages = messages.filter(message => (!delivery || message.deliveryState === delivery) &&
    [message.subject, message.body, message.recipientName, message.recipientEmail, message.ticketNumber].some(value => value?.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())));
  const ticketPage = operationsServerPage(ticketQuery.data?.data ?? [], ticketQuery.data?.total ?? 0, page, pageSize);
  const messagePage = operationsPage(filteredMessages, page, pageSize);
  const currentPage = tab === 'messages' ? messagePage : ticketPage;
  function selectTab(next: typeof tab) { setTab(next); setQuery(''); setPage(1); }
  function expandRows(open: boolean) { queueRef.current?.querySelectorAll('details.ops-queue-row').forEach(row => { (row as HTMLDetailsElement).open = open; }); }

  async function run(key: string, action: () => Promise<unknown>, message: string) {
    setBusy(key); setError(null); setSuccess(null);
    try {
      await action();
      setSuccess(message);
      await loadOperations();
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to complete Survey action.'));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="stack ops-workspace">
      {error ? <ErrorBanner message={error} /> : null}
      {ticketQuery.error ? <ErrorBanner message={ticketQuery.error} /> : null}
      {success ? <SuccessBanner message={success} /> : null}
      <div className="row"><Button variant="secondary" disabled={loading} onClick={() => void loadOperations()}>{loading ? 'Loading…' : 'Refresh Operations'}</Button></div>

      {metrics ? <OperationsHealth metrics={metrics} projectId={projectId} /> : <p className="muted" role="status">{loading ? 'Loading queue health…' : 'No metric snapshot loaded. Refresh to try again.'}</p>}

      <div className="ops-tabs" role="tablist" aria-label="Operations queues">
        {([['assignment', 'Need Assignment', metrics?.approvedWithoutInstrumentMan ?? '—'], ['open', 'Open Requests', metrics?.openTotal ?? '—'], ['messages', 'Local Messages', messages.length || '—']] as const).map(([key, label, count], index) =>
          <button key={key} type="button" role="tab" id={`tab-${key}`} aria-controls={`panel-${key}`} aria-selected={tab === key} tabIndex={tab === key ? 0 : -1}
            onClick={() => selectTab(key)} onKeyDown={event => {
              const keys = ['assignment', 'open', 'messages'] as const;
              const next = event.key === 'ArrowRight' ? (index + 1) % 3 : event.key === 'ArrowLeft' ? (index + 2) % 3 : event.key === 'Home' ? 0 : event.key === 'End' ? 2 : -1;
              const nextTab = keys[next];
              if (nextTab) { event.preventDefault(); selectTab(nextTab); document.getElementById(`tab-${nextTab}`)?.focus(); }
            }}>{label}<span>{count}</span></button>)}
      </div>
      <div className="ops-queue" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} ref={queueRef} aria-busy={loading || ticketQuery.loading || (tab === 'messages' && messagesLoading)}>
      {ticketQuery.loading || (tab === 'messages' && messagesLoading) ? <p className="muted">Loading this view…</p> : null}
      <div className="ops-filters">
        <label className="ops-search">{tab === 'messages' ? 'Search messages' : 'Find a request'}<input type="search" placeholder={tab === 'messages' ? 'Subject, recipient or request number' : 'Number, details, contact or requester'} value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} /></label>
        {tab !== 'messages' ? <>
          <label>Area<select value={area} onChange={event => { setArea(event.target.value); setPage(1); }}><option value="">All Areas</option>{areas.map(([id,name]) => <option key={id} value={id}>{name}</option>)}</select></label>
          {tab === 'open' ? <label>Status<select value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option value="">All open statuses</option>{[...new Set(metrics?.openByAreaStatus.map(row => row.status) ?? [])].map(value => <option key={value} value={value}>{operationsStatusLabel(value)}</option>)}</select></label> : null}
          <label>Priority<select value={priority} onChange={event => { setPriority(event.target.value); setPage(1); }}><option value="">All priorities</option>{['NORMAL','MEDIUM','MED_HIGH','HIGH'].map(value => <option key={value}>{value}</option>)}</select></label>
        </> : <label>Delivery<select value={delivery} onChange={event => { setDelivery(event.target.value); setPage(1); }}><option value="">All delivery states</option>{['QUEUED','CAPTURED','SENT','FAILED'].map(value => <option key={value}>{value}</option>)}</select></label>}
        <Button variant="secondary" onClick={() => { setQuery(''); setArea(''); setStatus(''); setPriority(''); setDelivery(''); setPage(1); }}>Clear filters</Button>
      </div>
      <div className="ops-pagination">
        <span role="status">{currentPage.first}–{currentPage.last} of {currentPage.total} {tab === 'messages' ? 'messages' : 'requests'}</span>
        <label>Items per page<select value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(1); }}>{[10,25,50,100].map(size => <option key={size}>{size}</option>)}</select></label>
        <Button variant="secondary" disabled={currentPage.page === 1} onClick={() => setPage(currentPage.page - 1)}>Previous</Button>
        <span>Page {currentPage.page} of {currentPage.pages}</span>
        <Button variant="secondary" disabled={currentPage.page === currentPage.pages} onClick={() => setPage(currentPage.page + 1)}>Next</Button>
      </div>
      <div className="ops-disclosure-controls"><Button variant="secondary" onClick={() => expandRows(true)}>Expand page</Button><Button variant="secondary" onClick={() => expandRows(false)}>Collapse all</Button></div>

      {tab === 'assignment' ? <Card className="ops-list" title="Need Assignment" description="Approved requests awaiting an Instrument Man. Expand a row to assign crew.">
        <div className="stack">
          {!ticketQuery.loading && !ticketQuery.error && ticketPage.total === 0 ? <p className="muted">No requests match this view. Clear filters to see the full queue.</p> : null}
          {ticketPage.items.map((ticket) => (
            <AssignmentRow key={`${ticket.id}:${ticket.assignedPartyChiefId}:${ticket.assignedInstrumentManId}`} ticket={ticket} partyChiefs={partyChiefs} instrumentMen={instrumentMen}
              busy={busy === ticket.id || members.length === 0} onAssign={(pc, im) => run(ticket.id, () => apiClient.assignTicket(ticket.id, pc, im), 'Assignment saved.')} />
          ))}
        </div>
      </Card> : null}

      {tab === 'open' ? <Card className="ops-list" title="Open Requests" description="High priority first, then earliest Need-By. Expand a row for review actions.">
        <div className="stack">
          {!ticketQuery.loading && !ticketQuery.error && ticketPage.total === 0 ? <p className="muted">No requests match this view. Clear filters to see the full queue.</p> : null}
          {ticketPage.items.map((ticket) => (
            <details className="ops-queue-row" key={ticket.id}>
              <summary><span>{ticket.ticketNumber ?? 'Draft request'} <span className="ops-row-title">{ticket.description}</span></span></summary>
              <div className="stack ops-row-body">
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <Link className="app-link" href={`/projects/${projectId}/tickets/${ticket.id}`}>{ticket.ticketNumber ?? ticket.id}</Link>
                  <StatusBadge status={ticket.status} />
                </div>
                <p>{ticket.description}</p>
                <p className="muted">Need-By {new Date(ticket.requestedDate).toLocaleDateString()} · Priority {ticket.priority}</p>
                <div className="row">
                  {ticket.status === 'SUBMITTED' ? <Button disabled={busy === ticket.id} onClick={() => void run(ticket.id, () => apiClient.approveTicket(ticket.id), 'SWR approved.')}>Approve</Button> : null}
                  {['SUBMITTED', 'APPROVED', 'ASSIGNED', 'IN_PROGRESS', 'DELAYED'].includes(ticket.status) ? (
                    <Button variant="secondary" disabled={busy === ticket.id} onClick={() => {
                      const reason = window.prompt('Return reason');
                      if (reason?.trim()) void run(ticket.id, () => apiClient.returnForCorrection(ticket.id, reason), 'SWR returned for correction.');
                    }}>Return</Button>
                  ) : null}
                  <Button variant="secondary" disabled={busy === ticket.id} onClick={() => {
                    const next = ticket.priority === 'HIGH' ? 'NORMAL' : 'HIGH';
                    const reason = window.prompt(`Reason to set priority ${next}`);
                    if (reason?.trim()) void run(ticket.id, () => apiClient.revisePriority(ticket.id, next, reason), 'Priority revised.');
                  }}>Set {ticket.priority === 'HIGH' ? 'Normal' : 'High'}</Button>
                  <Button variant="secondary" disabled={busy === ticket.id} onClick={() => {
                    const date = window.prompt('New Need-By date (YYYY-MM-DD)');
                    const reason = date ? window.prompt('Reason for Need-By change') : null;
                    if (date && reason?.trim()) void run(ticket.id, () => apiClient.reviseNeedBy(ticket.id, date, reason), 'Need-By revised.');
                  }}>Revise Need-By</Button>
                  <Button variant="secondary" disabled={busy === ticket.id} onClick={() => {
                    const reason = window.prompt('Cancellation reason');
                    if (reason?.trim()) void run(ticket.id, () => apiClient.surveyCancel(ticket.id, reason), 'SWR canceled.');
                  }}>Cancel</Button>
                </div>
              </div>
            </details>
          ))}
        </div>
      </Card> : null}

      {tab === 'messages' ? <Card className="ops-list" title="Local Messages" description="Local previews for requester and field-team notices. No external email is sent.">
        <div className="stack">
          <div className="row">
            <Button onClick={() => void run('capture', () => apiClient.operateLocalNotificationPreview(projectId, 'capture'), 'Queued messages captured locally.')}>Capture Queued</Button>
            <Button variant="secondary" onClick={() => void run('retry', () => apiClient.operateLocalNotificationPreview(projectId, 'retry-failed'), 'Failed messages queued for retry.')}>Retry Failed</Button>
          </div>
          {messagePage.total === 0 ? <p className="muted">No messages match this view. Clear filters or capture queued notices.</p> : null}
          {messagePage.items.map((message) => (
            <details className="ops-queue-row" key={message.id}>
              <summary>{message.subject}</summary><div className="stack ops-row-body">
              <p>{message.body}</p>
              <p className="muted">To: {message.recipientName ?? message.recipientEmail} &lt;{message.recipientEmail}&gt;</p>
              <p className="muted">{message.deliveryState} · attempts {message.attemptCount} · {new Date(message.createdAt).toLocaleString()}</p>
              {message.lastError ? <p className="muted">Last error: {message.lastError}</p> : null}
            </div></details>
          ))}
        </div>
      </Card> : null}
      </div>
    </div>
  );
}

function AssignmentRow({ ticket, partyChiefs, instrumentMen, busy, onAssign }: {
  ticket: TicketRecord; partyChiefs: ProjectMemberRecord[]; instrumentMen: ProjectMemberRecord[]; busy: boolean;
  onAssign: (partyChiefId: string | null, instrumentManId: string | null) => Promise<void>;
}) {
  const [partyChiefId, setPartyChiefId] = useState(ticket.assignedPartyChiefId ?? '');
  const [instrumentManId, setInstrumentManId] = useState(ticket.assignedInstrumentManId ?? '');
  return (
    <details className="ops-queue-row">
      <summary><span>{ticket.ticketNumber ?? 'Draft request'} <span className="ops-row-title">{ticket.description}</span></span></summary>
      <div className="stack ops-row-body">
        <p>{ticket.description}</p>
        <div className="row">
          <label>Party Chief <select value={partyChiefId} onChange={(event) => setPartyChiefId(event.target.value)}><option value="">None</option>{partyChiefs.map((member) => <option key={member.userId} value={member.userId}>{member.name}</option>)}</select></label>
          <label>Instrument Man <select value={instrumentManId} onChange={(event) => setInstrumentManId(event.target.value)}><option value="">Unassigned</option>{instrumentMen.map((member) => <option key={member.userId} value={member.userId}>{member.name}</option>)}</select></label>
          <Button disabled={busy} onClick={() => void onAssign(partyChiefId || null, instrumentManId || null)}>{busy ? 'Saving…' : 'Save Assignment'}</Button>
        </div>
      </div>
    </details>
  );
}
