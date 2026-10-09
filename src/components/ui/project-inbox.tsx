'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { apiRequest } from '@/lib/apiClient';
import { getErrorMessage } from '@/lib/errors';
import type { ProjectInbox } from '@/modules/notification/application/project-inbox';
import { Button } from './button';
import { ErrorBanner } from './feedback';
import { Icon } from './icon';

import { INBOX_SEEN_EVENT } from './use-unread-notices';

/** Your notices for this project. Opening the page marks them seen. */
export function ProjectInboxPage({ projectId }: { projectId: string }) {
  const [offset, setOffset] = useState(0);
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<ProjectInbox>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    setData(undefined); setError(undefined);
    apiRequest<ProjectInbox>(`/api/projects/${projectId}/inbox?offset=${offset}`)
      .then(value => {
        if (!active) return;
        setData(value);
        if (value.unread > 0) {
          void apiRequest(`/api/projects/${projectId}/inbox/seen`, { method: 'POST' })
            .then(() => window.dispatchEvent(new Event(INBOX_SEEN_EVENT)))
            .catch(() => undefined);
        }
      })
      .catch(cause => { if (active) setError(getErrorMessage(cause, 'Unable to load notifications. Try again.')); });
    return () => { active = false; };
  }, [projectId, offset, revision]);

  return (
    <section className="panel stack" aria-labelledby="notifications-title">
      <div className="panel-header has-actions">
        <div className="panel-heading">
          <h1 id="notifications-title" className="panel-title">Notifications</h1>
          <p className="muted">Updates about your requests and work on this project, newest first.</p>
        </div>
        <div className="toolbar-group"><Button variant="secondary" onClick={() => setRevision(value => value + 1)}><Icon name="refresh" />Refresh</Button></div>
      </div>
      {error ? <ErrorBanner message={error} /> : !data ? <p className="muted" role="status">Loading notifications…</p> : <>
        {data.notices.length ? (
          <ul className="inbox-list" aria-label="Notifications">
            {data.notices.map(notice => (
              <li key={`${notice.source}:${notice.id}`} className={`inbox-item${notice.unread ? ' inbox-unread' : ''}`}>
                <span className="inbox-dot" aria-hidden="true" />
                <div className="inbox-body">
                  <p className="inbox-title">{notice.unread ? <span className="visually-hidden">New: </span> : null}{notice.title}</p>
                  {notice.message ? <p className="inbox-message">{notice.message}</p> : null}
                  <p className="inbox-meta">
                    <time dateTime={notice.createdAt}>{new Date(notice.createdAt).toLocaleString()}</time>
                    {notice.ticketId ? <> · <Link className="text-link" href={`/projects/${projectId}/tickets/${notice.ticketId}`}>Open request</Link></> : null}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        ) : <div className="empty-state" role="status"><strong>No notifications yet</strong><span>Updates about submissions, approvals, assignments, comments and returns will appear here.</span></div>}
        {offset > 0 || data.hasMore ? (
          <div className="row">
            <Button variant="secondary" disabled={!offset} onClick={() => setOffset(value => Math.max(0, value - 25))}>Newer</Button>
            <span role="status" className="muted">Page {offset / 25 + 1}</span>
            <Button variant="secondary" disabled={!data.hasMore} onClick={() => setOffset(value => value + 25)}>Older</Button>
          </div>
        ) : null}
      </>}
    </section>
  );
}
