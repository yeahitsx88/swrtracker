'use client';

import { useRef, useState } from 'react';
import { apiClient } from '@/lib/apiClient';
import { ApiClientError, getErrorMessage } from '@/lib/errors';
import { RetryableMutation } from '@/lib/retryable-mutation';
import type { DeletedDraftRecord, DeletedDraftsResponse } from '@/lib/contracts';
import { Button, Card, ErrorBanner, Select, SuccessBanner, Textarea } from '@/components/ui';
import { Field, PaginationControls } from '@/components/forms';

export function DraftRecovery({ projectId }: { projectId:string }) {
  const [page, setPage] = useState<DeletedDraftsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [limit,setLimit] = useState(20), [offset,setOffset] = useState(0);
  const [selected,setSelected] = useState<DeletedDraftRecord | null>(null);
  const [reason,setReason] = useState('');
  const [error,setError] = useState<string | null>(null), [success,setSuccess] = useState<string | null>(null);
  const [stale,setStale] = useState(false);
  const busy = useRef(false);
  const attempt = useRef(new RetryableMutation<{ id:string; expectedVersion:number; reason:string }>());
  async function load(nextOffset=offset,nextLimit=limit) {
    if (busy.current || attempt.current.pending) return;
    busy.current = true; setLoading(true); setError(null);
    try { setPage(await apiClient.listDeletedDrafts(projectId,nextLimit,nextOffset)); setOffset(nextOffset); setLimit(nextLimit); setSelected(null); setReason(''); setStale(false); }
    catch (err) { setError(err instanceof ApiClientError && err.status===403 ? 'Recovery requires a current Project Admin role on this project. Tenant administration alone does not grant it.' : getErrorMessage(err,'Unable to load deleted drafts. Retry.')); }
    finally { busy.current = false; setLoading(false); }
  }
  async function restore() {
    if (!selected || busy.current || stale) return;
    busy.current = true; setLoading(true); setError(null); setSuccess(null);
    try {
      await attempt.current.run({ id:selected.id, expectedVersion:selected.rowVersion, reason:reason.trim() },
        (input,key) => apiClient.restoreDraft(projectId,input.id,input.expectedVersion,input.reason,key));
      setPage(current => current ? { ...current, data:current.data.filter(item => item.id!==selected.id), total:current.total-1 } : null);
      setSelected(null); setReason(''); setSuccess('Draft restored to its requester with the same ID, files and history. No operational role or request approval was granted.');
    } catch (err) { setError(getErrorMessage(err,'Unable to confirm recovery. Retry the same action.')); if (err instanceof ApiClientError && err.code==='WORKFLOW_STALE_STATE') setStale(true); }
    finally { busy.current = false; setLoading(false); }
  }
  const locked = loading || Boolean(attempt.current.pending);
  return <Card title="Deleted Draft Recovery" description="Project Admin only. Restore an unsubmitted draft within 30 days with a recorded reason. Records and files are retained; no permanent purge runs.">
    <div className="stack">
      {error ? <ErrorBanner message={error} /> : null}{success ? <SuccessBanner message={success} /> : null}
      <Button variant="secondary" disabled={locked} onClick={() => void load()}>{loading ? 'Loading…' : page ? 'Refresh deleted drafts' : 'View deleted drafts'}</Button>
      {page ? <>
        <label className="field"><span className="field-label">Drafts per page</span><Select value={limit} disabled={locked} onChange={event => void load(0,Number(event.target.value))}>{[10,20,50,100].map(size => <option key={size}>{size}</option>)}</Select></label>
        {page.data.length===0 ? <p className="muted">No deleted drafts on this page. Submitted and completed requests are never part of this recovery list.</p> : null}
        {page.data.map(draft => <article key={draft.id} className="ticket-card">
          <p className="ticket-headline">{draft.description ? draft.description.length > 160 ? `${draft.description.slice(0,160)}…` : draft.description : 'Untitled draft'}</p>
          <p className="muted">{draft.requesterName} · Deleted {new Date(draft.deletedAt).toLocaleString()}</p>
          {draft.recoverable ? <Button variant="secondary" disabled={locked || stale} onClick={() => { setSelected(draft); setReason(''); setSuccess(null); }}>Review recovery</Button> : <p className="muted">Recovery window ended. Record and files remain retained.</p>}
        </article>)}
        <PaginationControls offset={offset} limit={limit} total={page.total} onChange={next => { if (!locked) void load(next); }} />
      </> : null}
      {selected ? <section className="stack" aria-label="Confirm draft recovery">
        <h3>Restore {selected.requesterName}’s draft?</h3>
        <p>The requester must still be an active Requester on this project. This restores saved progress, not a submitted request. Archived projects remain read-only.</p>
        <Field label="Recovery reason (at least 10 characters)"><Textarea disabled={locked || stale} value={reason} onChange={event => setReason(event.target.value)} /></Field>
        {stale ? <p role="status">This record changed. Refresh the recovery list before proceeding.</p> : null}
        {attempt.current.pending ? <p role="status">Recovery is unconfirmed. Retry the same action before changing the reason or refreshing.</p> : null}
        <div className="row"><Button disabled={loading || stale || reason.trim().length<10} onClick={() => void restore()}>{attempt.current.pending ? 'Retry Restore' : 'Confirm Restore Draft'}</Button><Button variant="secondary" disabled={locked} onClick={() => setSelected(null)}>Cancel</Button></div>
      </section> : null}
    </div>
  </Card>;
}
