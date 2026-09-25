'use client';

import { useRef, useState } from 'react';
import { api, errorMessage, jsonBody } from '@/app/ui/api';
import type { RequestTicket } from '@/app/ui/request-types';

export function ReviewActions({ ticket, disabled, onBusyChange, onReviewed }: {
  ticket: RequestTicket; disabled: boolean; onBusyChange: (busy: boolean) => void; onReviewed: () => void;
}) {
  const [mode, setMode] = useState<'approve' | 'reject' | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  if (!ticket.reviewActions.canReview) return null;
  async function submit() {
    if (!mode || disabled || inFlight.current) return;
    if (mode === 'reject' && !reason.trim()) { setError('Enter a reason for rejecting this request.'); return; }
    inFlight.current = true; setBusy(true); onBusyChange(true); setError('');
    try {
      await api(`/api/tickets/${ticket.id}/${mode}`, jsonBody(mode === 'reject' ? { rejectionReason: reason.trim() } : {}));
      onReviewed();
    } catch (cause) {
      setError(errorMessage(cause));
      inFlight.current = false; setBusy(false); onBusyChange(false);
    }
  }
  return <section className="panel"><h2>Review request</h2>
    {!mode ? <div className="actions"><button disabled={disabled} onClick={() => setMode('approve')}>Approve request</button>
      <button className="danger" disabled={disabled} onClick={() => setMode('reject')}>Reject request</button></div> : <>
      <p>{mode === 'approve' ? 'Approve this request for survey assignment?' : 'Explain why this request cannot proceed. The requester will see this reason.'}</p>
      {mode === 'reject' && <label className="field">Rejection reason<textarea value={reason} disabled={busy || disabled} onChange={event => setReason(event.target.value)} required /></label>}
      {error && <p className="notice error" role="alert">{error}</p>}
      <div className="actions"><button disabled={busy || disabled} onClick={() => void submit()}>{busy ? 'Saving decision…' : mode === 'approve' ? 'Confirm approval' : 'Confirm rejection'}</button>
        <button className="secondary" disabled={busy || disabled} onClick={() => { setMode(null); setError(''); }}>Back</button></div>
    </>}
  </section>;
}
