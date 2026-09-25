'use client';

import { useRef, useState } from 'react';
import { api, errorMessage, jsonBody } from '@/app/ui/api';
import type { RequestTicket } from '@/app/ui/request-types';

export function SurveyCancelActions({ ticket, disabled, onBusyChange, onChanged }: {
  ticket: RequestTicket; disabled: boolean; onBusyChange: (busy: boolean) => void; onChanged: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const caps = ticket.surveyCancelActions;
  if (!caps.canInitiate && !caps.canApprove && !caps.pending) return null;
  async function submit() {
    if (disabled || inFlight.current) return;
    if (caps.canInitiate && !reason.trim()) { setError('Enter a written cancellation reason.'); return; }
    inFlight.current = true; setBusy(true); onBusyChange(true); setError('');
    try {
      await api(`/api/tickets/${ticket.id}/survey-cancel`, jsonBody(caps.canApprove
        ? { action: 'APPROVE' } : { action: 'INITIATE', reason: reason.trim() }));
      onChanged();
    } catch (cause) { setError(errorMessage(cause)); inFlight.current = false; setBusy(false); onBusyChange(false); }
  }
  return <section className="panel"><h2>Survey cancellation</h2>
    {caps.pending && <p className="notice warning">A survey cancellation is awaiting approval. The request remains in its current work status until approved.</p>}
    {(caps.canInitiate || caps.canApprove) && (!confirming ? <button className="danger" disabled={disabled} onClick={() => setConfirming(true)}>
      {caps.canApprove ? 'Review cancellation' : caps.immediate ? 'Cancel survey work' : 'Request survey cancellation'}</button> : <>
      <p>{caps.canApprove || caps.immediate ? 'Confirming permanently cancels this request. This cannot be undone.' : 'Your cancellation request requires approval from the next survey lead in the chain.'}</p>
      {caps.canInitiate && <label className="field">Cancellation reason (required)<textarea disabled={busy || disabled} value={reason} onChange={event => setReason(event.target.value)} /></label>}
      {error && <p className="notice error" role="alert">{error}</p>}
      <div className="actions"><button className="danger" disabled={busy || disabled} onClick={() => void submit()}>{busy ? 'Saving…' : caps.canApprove || caps.immediate ? 'Confirm cancellation' : 'Send for approval'}</button>
        <button className="secondary" disabled={busy || disabled} onClick={() => setConfirming(false)}>Back</button></div>
    </>)}
  </section>;
}
