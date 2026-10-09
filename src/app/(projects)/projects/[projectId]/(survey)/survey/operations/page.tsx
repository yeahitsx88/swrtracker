'use client';

import {RecordCollection} from '@/components/ui/record-collection';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiClient } from '@/lib/apiClient';
import { getErrorMessage } from '@/lib/errors';
import type {
  LocalNotificationPreviewRecord,
  TicketRecord,
} from '@/lib/contracts';
import { Button, Card, ErrorBanner, SuccessBanner } from '@/components/ui';
import { StatusBadge } from '@/components/ui/status-badge';
import { OperationsHealth } from '@/components/ui/operations-health';
import { SurveyCommandOverview } from '@/components/ui/survey-command-overview';
import { KpiExplorer } from '@/components/ui/kpi-explorer';
import type { AmeliaMetrics } from '@/modules/reporting/application/amelia-metrics';
import { operationsServerPage, operationsPage, operationsStatusLabel } from '@/lib/operations-view';
import { useTicketPage } from '@/lib/use-ticket-page';
import type { TicketPriority, TicketStatus } from '@/lib/contracts';
import './operations.css';
import { Icon } from '@/components/ui/icon';
import { formatCalendarDate } from '@/lib/calendar-date';
import { humanizeCode, priorityLabel } from '@/lib/display-labels';
import {TeamDelegation} from '@/components/ui/team-delegation';
import {useProjectWorkspace} from '@/components/ui/project-shell-header';
import {useTicketWorkflowReview} from '@/components/tickets/ticket-workflow-review';
import type {CommandOwner} from '@/lib/frozen-command';
import {CrewAssignment} from '@/components/ui/crew-assignment';

export default function SurveyOperationsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [revision, setRevision] = useState(0);
  const workflow = useTicketWorkflowReview(() => setRevision(current => current + 1));
  const workspace=useProjectWorkspace();
  const actionDisabled=workflow.active||workspace?.project.status!=='ACTIVE';
  const [metrics, setMetrics] = useState<AmeliaMetrics | null>(null);
  const [scopeSnapshot, setScopeSnapshot] = useState<Awaited<ReturnType<typeof apiClient.getKpiCharts>> | null>(null);
  const superintendent = scopeSnapshot?.analytics.supportsLinkedCrewScope === true;
  const [messages, setMessages] = useState<LocalNotificationPreviewRecord[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [tab, setTab] = useState<'overview' | 'assignment' | 'open' | 'messages'>('overview');
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
    setScopeSnapshot(null);
    apiClient.getKpiCharts(projectId, {})
      .then(response => { if (active) { setMetrics(response.metrics); setScopeSnapshot(response); } })
      .catch(err => { if (active) setError(getErrorMessage(err, 'Unable to load Survey operations.')); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [projectId, revision]);

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
  }, !!metrics && (tab === 'assignment' || tab === 'open'), revision);
  useEffect(() => {
    if (ticketQuery.data && page > Math.max(1, Math.ceil(ticketQuery.data.total / pageSize))) setPage(Math.max(1, Math.ceil(ticketQuery.data.total / pageSize)));
  }, [ticketQuery.data, page, pageSize]);
  const areas = [...new Map(metrics?.openByAreaStatus.map(row => [row.areaId, row.areaName]) ?? []).entries()];
  const filteredMessages = messages.filter(message => (!delivery || message.deliveryState === delivery) &&
    [message.subject, message.body, message.recipientName, message.recipientEmail, message.ticketNumber].some(value => value?.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())));
  const ticketPage = operationsServerPage(ticketQuery.data?.data ?? [], ticketQuery.data?.total ?? 0, page, pageSize);
  const messagePage = operationsPage(filteredMessages, page, pageSize);
  const currentPage = tab === 'messages' ? messagePage : ticketPage;
  const tabs = ([['overview', 'Overview', null], ['assignment', 'Need Assignment', metrics?.approvedWithoutInstrumentMan ?? '—'], ['open', 'Open Requests', metrics?.openTotal ?? '—'], ['messages', 'Local Messages', messages.length || '—']] as const).filter(([key]) => !superintendent || key !== 'messages');
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
      {workflow.dialog}
      {error ? <ErrorBanner message={error} /> : null}
      {ticketQuery.error ? <ErrorBanner message={ticketQuery.error} /> : null}
      {success ? <SuccessBanner message={success} /> : null}
      <div className="toolbar"><h2 className="panel-title">Survey Operations</h2><Button variant="secondary" disabled={loading||workflow.active} onClick={() => void loadOperations()}><Icon name="refresh" />{loading ? 'Loading…' : 'Refresh Operations'}</Button></div>

      {metrics ? <OperationsHealth metrics={metrics} projectId={projectId} areaWide={scopeSnapshot?.analytics.supportsLinkedCrewScope} /> : <p className="muted" role="status">{loading ? 'Loading queue health…' : 'No metric snapshot loaded. Refresh to try again.'}</p>}
      <div className="ops-tabs" role="tablist" aria-label="Operations views">
        {tabs.map(([key, label, count], index) =>
          <button key={key} type="button" role="tab" id={`tab-${key}`} aria-controls={`panel-${key}`} aria-selected={tab === key} tabIndex={tab === key ? 0 : -1}
            onClick={() => selectTab(key)} onKeyDown={event => {
              const keys = tabs.map(([key]) => key);
              const next = event.key === 'ArrowRight' ? (index + 1) % keys.length : event.key === 'ArrowLeft' ? (index + keys.length - 1) % keys.length : event.key === 'Home' ? 0 : event.key === 'End' ? keys.length - 1 : -1;
              const nextTab = keys[next];
              if (nextTab) { event.preventDefault(); selectTab(nextTab); document.getElementById(`tab-${nextTab}`)?.focus(); }
            }}>{label}{count !== null ? <span>{count}</span> : null}</button>)}
      </div>
      {tab === 'overview' ? <div role="tabpanel" id="panel-overview" aria-labelledby="tab-overview">
        {metrics?.charts ? scopeSnapshot?.analytics.supportsLinkedCrewScope ? <KpiExplorer key={`${projectId}:${revision}`} projectId={projectId} initialMeasure="all" initialData={scopeSnapshot} /> : <SurveyCommandOverview projectId={projectId} initialMetrics={metrics} revision={revision} /> : null}
      </div> : <div className="ops-queue" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} ref={queueRef} aria-busy={loading || ticketQuery.loading || (tab === 'messages' && messagesLoading)}>
      {ticketQuery.loading || (tab === 'messages' && messagesLoading) ? <p className="muted">Loading this view…</p> : null}
      <div className="ops-filters">
        <label className="ops-search">{tab === 'messages' ? 'Search messages' : 'Find a request'}<input type="search" placeholder={tab === 'messages' ? 'Subject, recipient or request number' : 'Number, details, contact or requester'} value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} /></label>
        {tab !== 'messages' ? <>
          <label>Area<select value={area} onChange={event => { setArea(event.target.value); setPage(1); }}><option value="">All Areas</option>{areas.map(([id,name]) => <option key={id} value={id}>{name}</option>)}</select></label>
          {tab === 'open' ? <label>Status<select value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option value="">All open statuses</option>{[...new Set(metrics?.openByAreaStatus.map(row => row.status) ?? [])].map(value => <option key={value} value={value}>{operationsStatusLabel(value)}</option>)}</select></label> : null}
          <label>Priority<select value={priority} onChange={event => { setPriority(event.target.value); setPage(1); }}><option value="">All priorities</option>{['NORMAL','MEDIUM','MED_HIGH','HIGH'].map(value => <option key={value} value={value}>{priorityLabel(value)}</option>)}</select></label>
        </> : <label>Delivery<select value={delivery} onChange={event => { setDelivery(event.target.value); setPage(1); }}><option value="">All delivery states</option>{['QUEUED','CAPTURED','SENT','FAILED'].map(value => <option key={value} value={value}>{humanizeCode(value)}</option>)}</select></label>}
        <Button variant="secondary" onClick={() => { setQuery(''); setArea(''); setStatus(''); setPriority(''); setDelivery(''); setPage(1); }}>Clear filters</Button>
      </div>
      <div className="ops-pagination">
        <span role="status">{currentPage.first}–{currentPage.last} of {currentPage.total} {tab === 'messages' ? 'messages' : 'requests'}</span>
        <label>{tab === 'messages' ? 'Messages per page' : 'Requests per page'}<select value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(1); }}>{[10,25,50,100].map(size => <option key={size}>{size}</option>)}</select></label>
        <Button variant="secondary" disabled={currentPage.page === 1} onClick={() => setPage(currentPage.page - 1)}>Previous {tab === 'messages' ? 'message' : 'request'} page</Button>
        <span>Page {currentPage.page} of {currentPage.pages}</span>
        <Button variant="secondary" disabled={currentPage.page === currentPage.pages} onClick={() => setPage(currentPage.page + 1)}>Next {tab === 'messages' ? 'message' : 'request'} page</Button>
      </div>
      <div className="ops-disclosure-controls"><Button variant="secondary" onClick={() => expandRows(true)}>Expand page</Button><Button variant="secondary" onClick={() => expandRows(false)}>Collapse all</Button></div>

      {tab === 'assignment' ? <Card className="ops-list" title="Need Assignment" description={superintendent ? 'Area-wide approved requests awaiting an Instrument Man. Expand a row to review the request.' : 'Approved requests awaiting an Instrument Man. Expand a row to assign crew.'}>
        <div className="stack">
          {!ticketQuery.loading && !ticketQuery.error && ticketPage.total === 0 ? <p className="muted">No requests match this view. Clear filters to see the full queue.</p> : null}
          <RecordCollection preserveOrder label="operation requests on this page" records={<>{ticketPage.items.map((ticket) => (
            <AssignmentRow key={`${ticket.id}:${ticket.assignedPartyChiefId}:${ticket.assignedInstrumentManId}`} ticket={ticket}
              readOnly={superintendent} projectId={projectId}
              disabled={actionDisabled} owner={workflow.owner} onDelegated={()=>void loadOperations()} />
          ))}</>}/>
        </div>
      </Card> : null}

      {tab === 'open' ? <Card className="ops-list" title="Open Requests" description={superintendent ? 'Area-wide workload, high priority first, then earliest Need-By. Open a request for applicable actions.' : 'High priority first, then earliest Need-By. Expand a row for review actions.'}>
        <div className="stack">
          {!ticketQuery.loading && !ticketQuery.error && ticketPage.total === 0 ? <p className="muted">No requests match this view. Clear filters to see the full queue.</p> : null}
          <RecordCollection preserveOrder label="operation requests on this page" records={<>{ticketPage.items.map((ticket) => (
            <details className="ops-queue-row" key={ticket.id}>
              <summary><span>{ticket.ticketNumber ?? 'Draft request'} <span className="ops-row-title">{ticket.description}</span></span></summary>
              <div className="stack ops-row-body">
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <Link className="app-link" href={`/projects/${projectId}/tickets/${ticket.id}`}>{ticket.ticketNumber ?? ticket.id}</Link>
                  <StatusBadge status={ticket.status} viewerIsRequester={false} />
                </div>
                <p>{ticket.description}</p>
                <p className="muted">Need-By {ticket.requestedDate ? formatCalendarDate(ticket.requestedDate) : 'Not set'} · {priorityLabel(ticket.priority)} priority</p>
                {!superintendent ? <div className="row">
                  {ticket.status === 'SUBMITTED' ? <Button disabled={actionDisabled||busy===ticket.id} onClick={() => workflow.open(ticket,'approve')}>Approve Request</Button> : null}
                  {['SUBMITTED','APPROVED','ASSIGNED','IN_PROGRESS','DELAYED'].includes(ticket.status)?<Button variant="secondary" disabled={actionDisabled||busy===ticket.id} onClick={()=>workflow.open(ticket,'return')}>Return for Correction</Button>:null}
                  <Button variant="secondary" disabled={actionDisabled||busy===ticket.id} onClick={()=>workflow.open(ticket,ticket.priority==='HIGH'?'normal':'high')}>Set {ticket.priority==='HIGH'?'Normal':'High'} Priority</Button>
                  <Button variant="secondary" disabled={actionDisabled||busy===ticket.id} onClick={()=>workflow.open(ticket,'need-by')}>Revise Need-By Date</Button>
                  <Button variant="danger" disabled={actionDisabled||busy===ticket.id} onClick={()=>workflow.open(ticket,'cancel')}>Cancel Request</Button>
                </div> : null}
              </div>
            </details>
          ))}</>}/>
        </div>
      </Card> : null}

      {tab === 'messages' ? <Card className="ops-list" title="Local Messages" description="Local previews for requester and field-team notices. No external email is sent.">
        <div className="stack">
          <div className="row">
            <Button onClick={() => void run('capture', () => apiClient.operateLocalNotificationPreview(projectId, 'capture'), 'Queued messages captured locally.')}>Capture Queued</Button>
            <Button variant="secondary" onClick={() => void run('retry', () => apiClient.operateLocalNotificationPreview(projectId, 'retry-failed'), 'Failed messages queued for retry.')}>Retry Failed</Button>
          </div>
          {messagePage.total === 0 ? <p className="muted">No messages match this view. Clear filters or capture queued notices.</p> : null}
          <RecordCollection label="local messages" records={<>{messagePage.items.map((message) => (
            <details className="ops-queue-row" key={message.id}>
              <summary>{message.subject}</summary><div className="stack ops-row-body">
              <p>{message.body}</p>
              <p className="muted">To: {message.recipientName ?? message.recipientEmail} &lt;{message.recipientEmail}&gt;</p>
              <p className="muted">{humanizeCode(message.deliveryState)} · attempts {message.attemptCount} · {new Date(message.createdAt).toLocaleString()}</p>
              {message.lastError ? <p className="muted">Last error: {message.lastError}</p> : null}
            </div></details>
          ))}</>}/>
        </div>
      </Card> : null}
      </div>}
    </div>
  );
}

function AssignmentRow({ ticket,disabled,owner,readOnly,projectId,onDelegated }: {
  ticket: TicketRecord; disabled:boolean; owner:CommandOwner; readOnly?:boolean; projectId:string;onDelegated:()=>void;
}) {
  return <details className="ops-queue-row">
    <summary><span>{ticket.ticketNumber??'Request'} <span className="ops-row-title">{ticket.description}</span></span></summary>
    <div className="stack ops-row-body"><p>{ticket.description}</p>
      <TeamDelegation ticket={ticket} canDelegate={!readOnly} disabled={disabled} owner={owner} onDelegated={onDelegated}/>
      <div className="row"><CrewAssignment ticket={ticket} owner={owner} disabled={disabled} restrictToSelectedTeam={readOnly} allowChiefOnly={ticket.status==='APPROVED'} onSaved={onDelegated}/><Link className="app-link" href={`/projects/${projectId}/tickets/${ticket.id}`}>Open request {ticket.ticketNumber}</Link></div>
    </div>
  </details>;
}
