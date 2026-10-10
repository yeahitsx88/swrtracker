'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { apiClient, apiRequest } from '@/lib/apiClient';
import { getErrorMessage } from '@/lib/errors';
import type { AuditLogPage } from '@/modules/audit/application/tenant-audit-log';
import { Card } from './card';
import { ErrorBanner } from './feedback';
import { Icon } from './icon';
import { ResizableTable, ResizableTh } from './resizable-table';

type Filters = { projectId: string; source: string; eventType: string; actor: string; from: string; to: string };
const EMPTY: Filters = { projectId: '', source: '', eventType: '', actor: '', from: '', to: '' };

function query(filters: Filters, extra: Record<string, string> = {}): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...filters, ...extra })) if (value.trim()) search.set(key, value.trim());
  return search.toString();
}

/** Tenant Admin view of request and administrative audit events, with CSV export. */
export function TenantAuditLog() {
  const [draft, setDraft] = useState<Filters>(EMPTY);
  const [applied, setApplied] = useState<Filters>(EMPTY);
  const [offset, setOffset] = useState(0);
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [page, setPage] = useState<AuditLogPage>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    apiClient.projectAdministration().then(result => setProjects(result.projects.map(project => ({ id: project.id, name: project.name })))).catch(() => setProjects([]));
  }, []);
  useEffect(() => {
    let active = true;
    setPage(undefined); setError(undefined);
    apiRequest<AuditLogPage>(`/api/audit-log?${query(applied, { offset: String(offset) })}`)
      .then(result => { if (active) setPage(result); })
      .catch(cause => { if (active) setError(getErrorMessage(cause, 'Unable to load the audit log.')); });
    return () => { active = false; };
  }, [applied, offset]);

  const set = (key: keyof Filters) => (value: string) => setDraft(previous => ({ ...previous, [key]: value }));
  function apply(event: FormEvent) { event.preventDefault(); setOffset(0); setApplied(draft); }

  return (
    <Card title="Audit Log" description="Request history and administrative changes across every project in this tenant. Read-only; newest first."
      actions={<a className="button button-secondary" href={`/api/audit-log?${query(applied, { format: 'csv' })}`}><Icon name="file" />Export CSV</a>}>
      <form className="request-filter-bar" onSubmit={apply} aria-label="Filter the audit log">
        <label className="field"><span className="field-label">Project</span>
          <select className="select" value={draft.projectId} onChange={event => set('projectId')(event.target.value)}><option value="">All projects</option>
            {projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
        <label className="field"><span className="field-label">Source</span>
          <select className="select" value={draft.source} onChange={event => set('source')(event.target.value)}><option value="">Requests and administration</option>
            <option value="REQUEST">Request history</option><option value="ADMIN">Administration</option></select></label>
        <label className="field"><span className="field-label">Event type</span>
          <input className="input" value={draft.eventType} onChange={event => set('eventType')(event.target.value)} placeholder="e.g. ticket.approved" /></label>
        <label className="field"><span className="field-label">Actor</span>
          <input className="input" value={draft.actor} onChange={event => set('actor')(event.target.value)} placeholder="Name contains" /></label>
        <label className="field"><span className="field-label">From</span><input className="input" type="date" value={draft.from} onChange={event => set('from')(event.target.value)} /></label>
        <label className="field"><span className="field-label">Through</span><input className="input" type="date" value={draft.to} onChange={event => set('to')(event.target.value)} /></label>
        <div className="request-filter-actions"><button type="submit" className="button button-secondary">Apply</button>
          <button type="button" className="button button-ghost" onClick={() => { setDraft(EMPTY); setOffset(0); setApplied(EMPTY); }}>Clear</button></div>
      </form>
      {error ? <ErrorBanner message={error} /> : null}
      {!page && !error ? <p className="muted" role="status">Loading audit events…</p> : null}
      {page ? (page.rows.length ? (
        <div className="table-scroll">
          <ResizableTable storageKey="tenant-audit-log" className="simple-table audit-table">
            <thead><tr><ResizableTh column="when" scope="col">When</ResizableTh><ResizableTh column="project" scope="col">Project</ResizableTh><ResizableTh column="event" scope="col">Event</ResizableTh><ResizableTh column="actor" scope="col">Actor</ResizableTh><ResizableTh column="subject" scope="col">Subject</ResizableTh><ResizableTh column="details" scope="col">Details</ResizableTh></tr></thead>
            <tbody>{page.rows.map(row => (
              <tr key={`${row.source}:${row.id}`}>
                <td><time dateTime={row.occurredAt}>{new Date(row.occurredAt).toLocaleString()}</time></td>
                <td>{row.projectName ?? 'Tenant'}</td>
                <td><span className="chip">{row.source === 'REQUEST' ? 'Request' : 'Admin'}</span> <code>{row.eventType}</code></td>
                <td>{row.actorName ?? 'System'}</td>
                <td>{row.ticketId && row.projectId ? <Link className="text-link" href={`/projects/${row.projectId}/tickets/${row.ticketId}`}>{row.subject ?? 'Request'}</Link> : row.subject ?? '—'}</td>
                <td><details><summary>View</summary><pre className="audit-details">{JSON.stringify(row.details, null, 2)}</pre></details></td>
              </tr>
            ))}</tbody>
          </ResizableTable>
        </div>
      ) : <div className="empty-state"><strong>No matching events</strong><span>Broaden the dates or clear filters.</span></div>) : null}
      {page && (offset > 0 || page.hasMore) ? (
        <div className="row">
          <button type="button" className="button button-secondary" disabled={!offset} onClick={() => setOffset(value => Math.max(0, value - 50))}>Newer</button>
          <span className="muted" role="status">Events {offset + 1}–{offset + page.rows.length}</span>
          <button type="button" className="button button-secondary" disabled={!page.hasMore} onClick={() => setOffset(value => value + 50)}>Older</button>
        </div>
      ) : null}
    </Card>
  );
}
