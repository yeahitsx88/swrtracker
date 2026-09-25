'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, ApiError, errorMessage } from '@/app/ui/api';
import { Shell } from '@/app/ui/shell';
import type { RequestTicket } from '@/app/ui/request-types';

interface TicketPage { data: RequestTicket[]; total: number; limit: number; offset: number }

export function RequestList({ projectId }: { projectId: string }) {
  const [page, setPage] = useState<TicketPage | null>(null);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState('');
  const [authNeeded, setAuthNeeded] = useState(false);
  useEffect(() => {
    let current = true; setPage(null); setError('');
    api<TicketPage>(`/api/tickets?projectId=${projectId}&limit=20&offset=${offset}`).then(result => {
      if (current) { setPage(result); setAuthNeeded(false); }
    }).catch(cause => {
      if (current) { setError(errorMessage(cause)); setAuthNeeded(cause instanceof ApiError && cause.status === 401); }
    });
    return () => { current = false; };
  }, [projectId, offset]);
  return <Shell projectId={projectId} signedIn={Boolean(page)}><p className="eyebrow">Project workspace</p><h1>Requests</h1>
    <p className="muted">Track the requests available to you in this project. Saved drafts are in the separate Drafts section.</p>
    <div className="actions"><Link className="button" href={`/project/${projectId}/request`}>New request</Link><Link href="/drafts">My drafts</Link></div>
    {error && <div className="notice error" role="alert">{error}{authNeeded && <p><Link href={`/login?next=${encodeURIComponent(`/project/${projectId}/requests`)}`}>Sign in to see requests</Link></p>}</div>}
    {!page && !error && <p className="notice" role="status">Loading requests…</p>}
    {page && <section className="panel" aria-label="Submitted requests">
      {!page.data.length && <><h2>No submitted requests</h2><p className="muted">Requests will appear here after submission.</p></>}
      {page.data.map(ticket => <article className="record" key={ticket.id}><span className="pill">{ticket.displayStatus}</span>
        <h2><Link href={`/tickets/${ticket.id}`}>{ticket.ticketNumber}</Link></h2>
        <p>{ticket.description?.slice(0, 180)}</p>
        <p className="muted">{ticket.craft}{ticket.requestedDate && ` · Requested for ${new Date(ticket.requestedDate).toLocaleString()}`}</p>
      </article>)}
      {page.total > 20 && <div className="actions"><button className="secondary" disabled={offset === 0} onClick={() => setOffset(offset - 20)}>Previous</button>
        <span>{offset + 1}–{Math.min(offset + 20, page.total)} of {page.total}</span>
        <button className="secondary" disabled={offset + 20 >= page.total} onClick={() => setOffset(offset + 20)}>Next</button></div>}
    </section>}
  </Shell>;
}
