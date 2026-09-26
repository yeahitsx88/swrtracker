'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError, errorMessage, jsonBody } from '@/app/ui/api';
import { Shell } from '@/app/ui/shell';
import type { RequestDraft } from '@/app/ui/request-types';

interface DeletedDraft extends RequestDraft {
  requesterName: string;
  companyName: string;
  draftDeletedAt: string;
  draftDeletedReason: 'REQUESTER_DELETED' | 'USER_DEACTIVATED' | 'AUTO_EXPIRED';
}
interface DraftPage { data: DeletedDraft[]; total: number; canRecover: boolean }
const deletionReasons = {
  REQUESTER_DELETED: 'Deleted by requester',
  USER_DEACTIVATED: 'Requester deactivated or removed from project',
  AUTO_EXPIRED: 'Expired after inactivity',
};
const pageSize = 10;

export function DeletedDrafts({ projectId }: { projectId: string }) {
  const [page, setPage] = useState<DraftPage | null>(null);
  const [offset, setOffset] = useState(0);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const [authNeeded, setAuthNeeded] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let current = true;
    setPage(null); setError(''); setSelected(null); setReason('');
    api<DraftPage>(`/api/tickets/drafts?mode=deleted&projectId=${projectId}&limit=${pageSize}&offset=${offset}`)
      .then(result => {
        if (!current) return;
        if (!result.data.length && offset > 0) {
          setOffset(Math.max(0, Math.ceil(result.total / pageSize) - 1) * pageSize);
          return;
        }
        setPage(result); setAuthNeeded(false);
      }).catch(cause => {
        if (current) {
          setError(errorMessage(cause)); setNotice('');
          setAuthNeeded(cause instanceof ApiError && cause.status === 401);
        }
      });
    return () => { current = false; };
  }, [projectId, offset, revision]);

  async function recover(event: FormEvent, draft: DeletedDraft) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setActionError(''); setNotice('');
    try {
      await api('/api/tickets/drafts', jsonBody({ action: 'recover', projectId, ticketId: draft.id, reason }));
      setNotice(`Draft recovered for ${draft.requesterName}. Ask the requester to open and save it promptly; recovery does not reset the seven-day inactivity timer.`);
      setSelected(null); setReason(''); setRevision(value => value + 1);
    } catch (cause) {
      setActionError(errorMessage(cause));
      if (cause instanceof ApiError && [401, 403, 404, 409].includes(cause.status)) {
        setPage(null); setSelected(null); setRevision(value => value + 1);
      }
      setAuthNeeded(cause instanceof ApiError && cause.status === 401);
    } finally { setBusy(false); }
  }

  return <Shell signedIn={Boolean(page)}>
    <p className="eyebrow">Project administration</p><h1>Deleted drafts</h1>
    <p className="muted">Recover a draft within 30 days of deletion. A written reason is required and recorded in the audit log.</p>
    <p className="muted">Recovery returns the draft to its requester. It does not restore their account or project access.</p>
    <div className="actions"><Link href="/projects">Back to projects</Link>
      <button className="secondary" disabled={busy} onClick={() => { setActionError(''); setNotice(''); setRevision(value => value + 1); }}>Refresh drafts</button></div>
    {(error || actionError) && <div className="notice error" role="alert">{actionError || error}
      {authNeeded && <p><Link href={`/login?next=${encodeURIComponent(`/project/${projectId}/deleted-drafts`)}`}>Sign in to view deleted drafts</Link></p>}</div>}
    {notice && <div className="notice" role="status">{notice}</div>}
    {!page && !error && <p role="status">Loading deleted drafts…</p>}
    {page && <>
      {!page.canRecover && <p className="notice warning">This project is read only. Draft recovery requires an active project.</p>}
      <section className="panel" aria-label="Deleted drafts available for recovery">
        {!page.data.length && <><h2>No deleted drafts available</h2><p>No drafts within the recovery window are visible to you in this project.</p></>}
        {page.data.map(draft => <article className="record" key={draft.id}>
          <span className="pill">{deletionReasons[draft.draftDeletedReason]}</span>
          <h2 style={{ overflowWrap: 'anywhere' }}>{draft.craft || 'Untitled request'}</h2>
          <p><strong>{draft.requesterName}</strong> · {draft.companyName}</p>
          <p className="description">{draft.description || 'No description saved.'}</p>
          <p className="muted">Deleted {new Date(draft.draftDeletedAt).toLocaleString()}</p>
          <p className="muted">Recover before {new Date(new Date(draft.draftDeletedAt).getTime() + 30 * 86400000).toLocaleString()}</p>
          {page.canRecover && (selected === draft.id ? <form onSubmit={event => void recover(event, draft)}>
            <label className="field">Recovery reason
              <textarea autoFocus required minLength={10} value={reason} disabled={busy} onChange={event => setReason(event.target.value)} />
              <small>Explain why this draft should be restored. At least 10 characters.</small>
            </label>
            <div className="actions"><button disabled={busy || reason.trim().length < 10}>{busy ? 'Recovering…' : 'Confirm recovery'}</button>
              <button type="button" className="secondary" disabled={busy} onClick={() => { setSelected(null); setReason(''); }}>Cancel</button></div>
          </form> : <button className="secondary" disabled={busy} onClick={() => { setSelected(draft.id); setReason(''); setActionError(''); setNotice(''); }}>Recover draft</button>)}
        </article>)}
        {(offset > 0 || page.total > pageSize) && <div className="actions">
          <button className="secondary" disabled={busy || offset === 0} onClick={() => setOffset(offset - pageSize)}>Previous</button>
          <span>{offset + 1}–{Math.min(offset + pageSize, page.total)} of {page.total}</span>
          <button className="secondary" disabled={busy || offset + pageSize >= page.total} onClick={() => setOffset(offset + pageSize)}>Next</button>
        </div>}
      </section>
    </>}
  </Shell>;
}
