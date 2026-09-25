'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
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

const TERMINAL = new Set(['COMPLETED', 'REJECTED', 'REQUESTER_CANCELED', 'FIELD_CANCELED', 'SURVEY_CANCELED']);

export default function SurveyOperationsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [tickets, setTickets] = useState<TicketRecord[]>([]);
  const [members, setMembers] = useState<ProjectMemberRecord[]>([]);
  const [metrics, setMetrics] = useState<AmeliaMetricsRecord | null>(null);
  const [messages, setMessages] = useState<LocalNotificationPreviewRecord[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function loadOperations() {
    setLoading(true);
    setError(null);
    try {
      const first = await apiClient.listTickets(projectId, 100, 0);
      const all = [...first.data];
      for (let offset = first.data.length; offset < first.total; offset += 100) {
        const page = await apiClient.listTickets(projectId, 100, offset);
        all.push(...page.data);
      }
      const [memberResponse, metricResponse, messageResponse] = await Promise.all([
        apiClient.listProjectMembers(projectId),
        apiClient.getProjectMetrics(projectId),
        apiClient.listLocalNotificationPreviews(projectId),
      ]);
      setTickets(all);
      setMembers(memberResponse.members);
      setMetrics(metricResponse.metrics);
      setMessages(messageResponse.messages);
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to load Survey operations.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadOperations(); }, [projectId]);

  const openTickets = useMemo(
    () => tickets.filter((ticket) => !TERMINAL.has(ticket.status))
      .sort((a, b) => Number(b.priority === 'HIGH') - Number(a.priority === 'HIGH') ||
        new Date(a.requestedDate).getTime() - new Date(b.requestedDate).getTime()),
    [tickets],
  );
  const approvedUnassigned = useMemo(
    () => openTickets.filter((ticket) => ticket.status === 'APPROVED' && !ticket.assignedInstrumentManId),
    [openTickets],
  );
  const partyChiefs = members.filter((member) => member.role === 'PARTY_CHIEF');
  const instrumentMen = members.filter((member) => member.role === 'INSTRUMENT_MAN');

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
    <div className="stack">
      {error ? <ErrorBanner message={error} /> : null}
      {success ? <SuccessBanner message={success} /> : null}
      <div className="row"><Button variant="secondary" disabled={loading} onClick={() => void loadOperations()}>{loading ? 'Loading…' : 'Refresh Operations'}</Button></div>

      <Card title="Amelia Queue Health" description="Current project snapshot. Counts describe work demand and flow, not employee productivity.">
        {metrics ? (
          <div className="stack">
            <div className="row">
              <strong>Open: {metrics.openTotal}</strong>
              <strong>Approved / no IM: {metrics.approvedWithoutInstrumentMan}</strong>
              <strong>Overdue Need-By: {metrics.overdueNeedBy}</strong>
              <strong>Completed: {metrics.completedTotal}</strong>
              <strong>Average cycle: {metrics.averageSubmissionToCompletionHours === null ? '—' : `${metrics.averageSubmissionToCompletionHours.toFixed(1)} hours`}</strong>
            </div>
            {metrics.openByAreaStatus.map((row) => (
              <p className="muted" key={`${row.areaId}:${row.status}`}>{row.areaName} · {row.status}: {row.count}</p>
            ))}
          </div>
        ) : <p className="muted">No metric snapshot loaded.</p>}
      </Card>

      <Card title="Approved Work Needing Assignment" description="Highest priority Amelia queue: approved SWRs remain here until an Instrument Man is assigned.">
        <div className="stack">
          {approvedUnassigned.length === 0 ? <p className="muted">No approved SWRs are waiting for an Instrument Man.</p> : null}
          {approvedUnassigned.map((ticket) => (
            <AssignmentRow key={ticket.id} ticket={ticket} partyChiefs={partyChiefs} instrumentMen={instrumentMen}
              busy={busy === ticket.id} onAssign={(pc, im) => run(ticket.id, () => apiClient.assignTicket(ticket.id, pc, im), 'Assignment saved.')} />
          ))}
        </div>
      </Card>

      <Card title="Open Requests" description="All nonterminal SWRs, ordered with HIGH priority first and earliest Need-By next.">
        <div className="stack">
          {openTickets.length === 0 ? <p className="muted">No open SWRs.</p> : null}
          {openTickets.map((ticket) => (
            <section className="panel" key={ticket.id}>
              <div className="stack">
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
            </section>
          ))}
        </div>
      </Card>

      <Card title="Local Message Preview" description="Private beta capture for requester and field-team notices. No external email is sent.">
        <div className="stack">
          <div className="row">
            <Button onClick={() => void run('capture', () => apiClient.operateLocalNotificationPreview(projectId, 'capture'), 'Queued messages captured locally.')}>Capture Queued</Button>
            <Button variant="secondary" onClick={() => void run('retry', () => apiClient.operateLocalNotificationPreview(projectId, 'retry-failed'), 'Failed messages queued for retry.')}>Retry Failed</Button>
          </div>
          {messages.length === 0 ? <p className="muted">No messages recorded.</p> : null}
          {messages.map((message) => (
            <article className="ticket-card" key={message.id}>
              <p className="ticket-headline">{message.subject}</p>
              <p>{message.body}</p>
              <p className="muted">To: {message.recipientName ?? message.recipientEmail} &lt;{message.recipientEmail}&gt;</p>
              <p className="muted">{message.deliveryState} · attempts {message.attemptCount} · {new Date(message.createdAt).toLocaleString()}</p>
              {message.lastError ? <p className="muted">Last error: {message.lastError}</p> : null}
            </article>
          ))}
        </div>
      </Card>
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
    <section className="panel">
      <div className="stack">
        <p className="ticket-headline">{ticket.ticketNumber ?? ticket.id}</p>
        <p>{ticket.description}</p>
        <div className="row">
          <label>Party Chief <select value={partyChiefId} onChange={(event) => setPartyChiefId(event.target.value)}><option value="">None</option>{partyChiefs.map((member) => <option key={member.userId} value={member.userId}>{member.name}</option>)}</select></label>
          <label>Instrument Man <select value={instrumentManId} onChange={(event) => setInstrumentManId(event.target.value)}><option value="">Unassigned</option>{instrumentMen.map((member) => <option key={member.userId} value={member.userId}>{member.name}</option>)}</select></label>
          <Button disabled={busy} onClick={() => void onAssign(partyChiefId || null, instrumentManId || null)}>{busy ? 'Saving…' : 'Save Assignment'}</Button>
        </div>
      </div>
    </section>
  );
}
