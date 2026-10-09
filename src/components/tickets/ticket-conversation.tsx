'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { apiRequest, createIdempotencyKey } from '@/lib/apiClient';
import { getErrorMessage } from '@/lib/errors';
import { initials } from '@/lib/display-labels';
import type { TicketComment } from '@/modules/ticket/application/ticket-comments';
import { Card } from '@/components/ui';

/** Conversation between the requester and the survey team on one request. */
export function TicketConversation({ ticketId, actorId, revision = 0 }: { ticketId: string; actorId?: string; revision?: number }) {
  const [comments, setComments] = useState<TicketComment[]>();
  const [canComment, setCanComment] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [reload, setReload] = useState(0);
  const retryKey = useRef<{ body: string; key: string } | undefined>(undefined);

  useEffect(() => {
    let active = true;
    setError(undefined);
    apiRequest<{ comments: TicketComment[]; canComment: boolean }>(`/api/tickets/${ticketId}/comments`)
      .then(result => { if (active) { setComments(result.comments); setCanComment(result.canComment); } })
      .catch(cause => { if (active) setError(getErrorMessage(cause, 'Unable to load the conversation. Try again.')); });
    return () => { active = false; };
  }, [ticketId, revision, reload]);

  async function post(event: FormEvent) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || busy) return;
    // Reuse the key for an exact retry of the same text after a lost response.
    if (retryKey.current?.body !== body) retryKey.current = { body, key: createIdempotencyKey() };
    setBusy(true); setError(undefined);
    try {
      const result = await apiRequest<{ comment: TicketComment }>(`/api/tickets/${ticketId}/comments`, {
        method: 'POST', body: { body }, headers: { 'Idempotency-Key': retryKey.current.key },
      });
      setComments(items => [...(items ?? []).filter(item => item.id !== result.comment.id), result.comment]);
      setDraft(''); retryKey.current = undefined;
    } catch (cause) { setError(getErrorMessage(cause, 'Your comment was not confirmed. Retry to send the same text.')); }
    finally { setBusy(false); }
  }

  return (
    <Card title="Conversation" description="Questions and answers between the requester and the survey team. Comments stay with the request.">
      <div className="stack">
        {error ? <p className="error-banner" role="alert">{error} <button type="button" className="app-link" onClick={() => setReload(value => value + 1)}>Reload</button></p> : null}
        {!comments && !error ? <p className="muted" role="status">Loading conversation…</p> : null}
        {comments && !comments.length ? <p className="muted">No comments yet.{canComment ? ' Ask a question or add context for the team.' : ''}</p> : null}
        {comments?.length ? (
          <ol className="comment-thread" aria-label="Comments">
            {comments.map(comment => (
              <li key={comment.id} className={`comment${comment.authorId === actorId ? ' comment-own' : ''}`}>
                <span className="comment-avatar" aria-hidden="true">{initials(comment.authorName)}</span>
                <div className="comment-body">
                  <p className="comment-meta"><strong>{comment.authorId === actorId ? 'You' : comment.authorName}</strong> · <time dateTime={comment.createdAt}>{new Date(comment.createdAt).toLocaleString()}</time></p>
                  <p className="comment-text">{comment.body}</p>
                </div>
              </li>
            ))}
          </ol>
        ) : null}
        {canComment ? (
          <form className="stack form-narrow" onSubmit={post}>
            <label className="field"><span className="field-label">Add a comment</span>
              <textarea className="textarea" value={draft} maxLength={4000} onChange={event => setDraft(event.target.value)} placeholder="For example: control points are flagged at the north fence line" /></label>
            <div className="row"><button type="submit" className="button" disabled={busy || !draft.trim()}>{busy ? 'Posting…' : 'Post comment'}</button>
              <span className="muted field-help">The requester and the assigned crew are notified.</span></div>
          </form>
        ) : comments ? <p className="muted field-help">You can read this conversation. Posting is limited to the requester and survey staff on the request.</p> : null}
      </div>
    </Card>
  );
}
