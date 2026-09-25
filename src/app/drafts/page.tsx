'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, ApiError, errorMessage } from '../ui/api';
import { Shell } from '../ui/shell';
import type { RequestDraft } from '../ui/request-types';

interface DraftPage { data: RequestDraft[]; total: number; limit: number; offset: number }

export default function DraftsPage() {
  const [page, setPage] = useState<DraftPage | null>(null);
  const [offset, setOffset] = useState(0);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState('');
  const [authNeeded, setAuthNeeded] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let current = true; setPage(null); setError('');
    api<DraftPage>(`/api/tickets/drafts?limit=20&offset=${offset}`).then(result => {
      if (current) { setPage(result); setAuthNeeded(false); }
    }).catch(cause => {
      if (current) { setError(errorMessage(cause)); setAuthNeeded(cause instanceof ApiError && cause.status === 401); }
    });
    return () => { current = false; };
  }, [offset, revision]);
  async function remove(id: string) {
    setBusy(true); setError('');
    try {
      await api(`/api/tickets/drafts?ticketId=${id}`, { method: 'DELETE' });
      if (page?.data.length === 1 && offset > 0) setOffset(offset - 20);
      else setRevision(value => value + 1);
    } catch (cause) { setError(errorMessage(cause)); setAuthNeeded(cause instanceof ApiError && cause.status === 401); }
    finally { setBusy(false); }
  }
  return <Shell><p className="eyebrow">Your workspace</p><h1>Drafts</h1>
    <p className="muted">Finish a saved request before sending it to the survey team. Drafts expire after seven days without a save.</p>
    {error && <div className="notice error" role="alert">{error}{authNeeded && <p><Link href="/login?next=%2Fdrafts">Sign in to see your drafts</Link></p>}</div>}
    {!page && !error && <p role="status">Loading drafts…</p>}
    {page && <section className="panel" aria-label="Saved drafts">
      {!page.data.length && <><h2>No saved drafts</h2><p className="muted">Open your project’s request link to start a new request.</p></>}
      {page.data.map(draft => <article className="record" key={draft.id}>
        <span className="pill">Draft</span><h2>{draft.craft || 'Untitled request'}</h2>
        <p>{draft.description ? draft.description.slice(0, 180) : 'No description yet.'}</p>
        <p className="muted">{draft.draftLastSavedAt ? `Saved ${new Date(draft.draftLastSavedAt).toLocaleString()}` : 'Not yet saved'}</p>
        <div className="actions"><Link className="button secondary" href={`/project/${draft.projectId}/request?draft=${draft.id}`}>Continue request</Link>
          <button className="danger" disabled={busy} onClick={() => void remove(draft.id)}>Delete draft</button></div>
      </article>)}
      {page.total > 20 && <div className="actions"><button className="secondary" disabled={offset === 0 || busy} onClick={() => setOffset(offset - 20)}>Previous</button>
        <span>{offset + 1}–{Math.min(offset + 20, page.total)} of {page.total}</span>
        <button className="secondary" disabled={offset + 20 >= page.total || busy} onClick={() => setOffset(offset + 20)}>Next</button></div>}
    </section>}
  </Shell>;
}
