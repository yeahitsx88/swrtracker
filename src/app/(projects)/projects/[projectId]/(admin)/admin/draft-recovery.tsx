'use client';
import {HeadingHelp} from '@/components/ui/heading-help';

import {RecordCollection} from '@/components/ui/record-collection';
import { useRef, useState, useSyncExternalStore } from 'react';
import { apiClient,apiRequest } from '@/lib/apiClient';
import { ApiClientError, getErrorMessage } from '@/lib/errors';
import { CommandOwner,FrozenCommand } from '@/lib/frozen-command';
import type { DeletedDraftRecord, DeletedDraftsResponse } from '@/lib/contracts';
import { Button, Card, ErrorBanner, Select, SuccessBanner, Textarea } from '@/components/ui';
import { Field, PaginationControls } from '@/components/forms';

export function DraftRecovery({ projectId,owner }: { projectId:string;owner:CommandOwner }) {
  const token='draft-recovery';useSyncExternalStore(owner.subscribe,owner.snapshot,owner.snapshot);const blocked=owner.blocked(token);
  const [page, setPage] = useState<DeletedDraftsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [limit,setLimit] = useState(20), [offset,setOffset] = useState(0);
  const [selected,setSelected] = useState<DeletedDraftRecord | null>(null);
  const [reason,setReason] = useState('');
  const [error,setError] = useState<string | null>(null), [success,setSuccess] = useState<string | null>(null);
  const [stale,setStale] = useState(false),[closed,setClosed]=useState(false),[readFailed,setReadFailed]=useState(false);
  const busy = useRef(false);
  const attempt = useRef(new FrozenCommand<{ id:string; expectedVersion:number; reason:string }>());
  async function load(nextOffset=offset,nextLimit=limit) {
    if (busy.current || blocked || attempt.current.pending || attempt.current.command&&!attempt.current.stale) return;
    busy.current = true; setLoading(true); setError(null);
    try { const [current,context]=await Promise.all([apiClient.listDeletedDrafts(projectId,nextLimit,nextOffset),apiRequest<{project:{status:string}}>(`/api/projects/${projectId}/template`)]);if(!attempt.current.reload())return;setPage(current);setOffset(nextOffset);setLimit(nextLimit);setSelected(null);setReason('');setStale(false);setReadFailed(false);setClosed(context.project.status==='ARCHIVED');owner.release(token); }
    catch (err) { setReadFailed(attempt.current.stale);setError(err instanceof ApiClientError && err.status===403 ? 'Draft recovery requires a current independent Project Admin grant. Tenant Admin alone does not grant this access.' : getErrorMessage(err,'Unable to load current deleted drafts. Keep this review held and retry.')); }
    finally { busy.current = false; setLoading(false); }
  }
  async function restore() {
    if (!selected || closed || busy.current || stale || !owner.claim(token)) return;
    const command=attempt.current.begin({id:selected.id,expectedVersion:selected.rowVersion,reason:reason.trim()},crypto.randomUUID());if(!command){if(!attempt.current.locked)owner.release(token);return;}
    busy.current = true; setLoading(true); setError(null); setSuccess(null);
    try {
      await apiClient.restoreDraft(projectId,command.body.id,command.body.expectedVersion,command.body.reason,command.key);attempt.current.success();owner.release(token);
      setPage(current => current ? { ...current, data:current.data.filter(item => item.id!==selected.id), total:current.total-1 } : null);
      setSelected(null); setReason(''); setSuccess('Draft restored to its requester with the same ID, files and history. No operational role or request approval was granted.');
    } catch (err) { setError(getErrorMessage(err,'Unable to confirm recovery. Retry the same action.')); attempt.current.fail(err instanceof ApiClientError?err.status:undefined);if(attempt.current.stale)setStale(true);if(!attempt.current.locked)owner.release(token); }
    finally { busy.current = false; setLoading(false); }
  }
  const locked = loading || attempt.current.locked || blocked;
  return <Card title="Deleted Draft Recovery" description="A current independently granted Project Admin can restore an unsubmitted draft within 30 days with a recorded reason. Records and files are retained; no permanent purge runs.">
    <div className="stack">
      {closed?<p role="status">Archived project — deleted draft recovery is read-only.</p>:null}
      {stale?<p role="alert">{readFailed?'Current deleted-draft information could not be loaded.':'This recovery changed.'} Your reviewed recovery remains held. Refresh deleted drafts must successfully read current records and project context before choosing and reviewing again.</p>:null}
      {error ? <ErrorBanner message={error} /> : null}{success ? <SuccessBanner message={success} /> : null}
      <Button variant="secondary" disabled={blocked||loading||attempt.current.pending||!!attempt.current.command&&!attempt.current.stale} onClick={() => void load()}>{loading ? 'Loading…' : page ? 'Refresh deleted drafts' : 'View deleted drafts'}</Button>
      {page ? <>
        <label className="field"><span className="field-label">Drafts per page</span><Select value={limit} disabled={locked} onChange={event => void load(0,Number(event.target.value))}>{[10,20,50,100].map(size => <option key={size}>{size}</option>)}</Select></label>
        {page.data.length===0 ? <p className="muted">No deleted drafts on this page. Submitted and completed requests are never part of this recovery list.</p> : null}
        <RecordCollection label="deleted drafts" records={<>{page.data.map(draft => <article key={draft.id} className="ticket-card">
          <p className="ticket-headline">{draft.description ? draft.description.length > 160 ? `${draft.description.slice(0,160)}…` : draft.description : 'Untitled draft'}</p>
          <p className="muted">{draft.requesterName} · Deleted {new Date(draft.deletedAt).toLocaleString()}</p>
          {draft.recoverable ? <Button variant="secondary" disabled={closed || locked || stale} onClick={() => { setSelected(draft); setReason(''); setSuccess(null); }}>Review recovery</Button> : <p className="muted">Recovery window ended. Record and files remain retained.</p>}
        </article>)}</>}/>
        <PaginationControls offset={offset} limit={limit} total={page.total} onChange={next => { if (!locked) void load(next); }} />
      </> : null}
      {selected ? <section className="stack" aria-label="Confirm draft recovery">
        <HeadingHelp label="Restore Draft" heading={<h3>Restore {selected.requesterName}’s Draft?</h3>} help={<span>The requester must still be an active Requester on this project. This restores saved progress, not a submitted request. Archived projects remain read-only.</span>}/>
        <dl className="detail-grid">
          <div><dt>Saved Details</dt><dd>{selected.description || 'Untitled draft'}</dd></div>
          <div><dt>Draft ID</dt><dd>{selected.id}</dd></div>
        </dl>
        <Field label="Recovery reason (at least 10 characters)"><Textarea disabled={closed || locked || stale} value={reason} onChange={event => setReason(event.target.value)} /></Field>
        {stale ? <p role="status">This record changed. Refresh the recovery list before proceeding.</p> : null}
        {attempt.current.command&&!attempt.current.stale ? <p role="status">Recovery is unconfirmed. Retry the same action before changing the reason or refreshing.</p> : null}
        <div className="row"><Button disabled={closed || blocked || loading || stale || reason.trim().length<10} onClick={() => void restore()}>{attempt.current.command&&!attempt.current.stale ? 'Retry Unchanged Draft Recovery' : 'Confirm Restore Draft'}</Button><Button variant="secondary" disabled={locked} onClick={() => setSelected(null)}>Cancel</Button></div>
      </section> : null}
    </div>
  </Card>;
}
