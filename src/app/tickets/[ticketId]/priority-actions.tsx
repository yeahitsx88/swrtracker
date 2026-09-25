'use client';

import { useRef, useState } from 'react';
import { api, errorMessage, jsonBody } from '@/app/ui/api';
import type { RequestTicket } from '@/app/ui/request-types';

const labels = { NORMAL: 'Normal', MEDIUM: 'Medium', MED_HIGH: 'Medium high', HIGH: 'High' };
export function PriorityActions({ ticket, disabled, onBusyChange, onChanged }: {
  ticket: RequestTicket; disabled: boolean; onBusyChange: (busy: boolean) => void; onChanged: () => void;
}) {
  const [mode, setMode] = useState<'elevate' | 'lower' | null>(null);
  const [target, setTarget] = useState('');
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const inFlight = useRef(false);
  const caps = ticket.priorityActions;
  if (!caps.canElevate && !caps.lowerChoices.length) return null;
  function lower() {
    if (ticket.priority === 'HIGH') dialog.current?.showModal();
    else setMode('lower');
  }
  async function submit() {
    if (!mode || disabled || inFlight.current) return;
    if (!reason.trim()) { setError('Enter a written reason for changing priority.'); return; }
    if (mode === 'lower' && !target) { setError('Select a lower priority.'); return; }
    inFlight.current = true; setBusy(true); onBusyChange(true); setError('');
    try {
      await api(`/api/tickets/${ticket.id}/${mode === 'elevate' ? 'elevate-priority' : 'lower-priority'}`,
        jsonBody(mode === 'elevate' ? { reason: reason.trim() }
          : { priority: target, reason: reason.trim(), highDowngradeConfirmed: confirmed }));
      onChanged();
    } catch (cause) { setError(errorMessage(cause)); inFlight.current = false; setBusy(false); onBusyChange(false); }
  }
  return <section className="panel"><h2>Priority</h2><p>Current priority: <strong>{labels[ticket.priority]}</strong></p>
    <dialog ref={dialog} aria-labelledby="priority-confirm-title"><h2 id="priority-confirm-title">Lower a High-priority request?</h2>
      <p>This reduces its operational priority. Confirm before entering the required reason.</p>
      <div className="actions"><button onClick={() => { dialog.current?.close(); setConfirmed(true); setMode('lower'); }}>Continue to reason</button>
        <button className="secondary" onClick={() => dialog.current?.close()}>Keep High priority</button></div></dialog>
    {!mode ? <div className="actions">{caps.canElevate && <button disabled={disabled} onClick={() => setMode('elevate')}>Elevate to High</button>}
      {caps.lowerChoices.length > 0 && <button className="secondary" disabled={disabled} onClick={lower}>Lower priority</button>}</div> : <>
      {mode === 'lower' && <label className="field">New priority<select value={target} disabled={busy || disabled} onChange={event => setTarget(event.target.value)}>
        <option value="">Choose priority</option>{caps.lowerChoices.map(value => <option key={value} value={value}>{labels[value]}</option>)}</select></label>}
      <label className="field">Priority change reason<textarea disabled={busy || disabled} value={reason} onChange={event => setReason(event.target.value)} /></label>
      {error && <p className="notice error" role="alert">{error}</p>}
      <div className="actions"><button disabled={busy || disabled} onClick={() => void submit()}>{busy ? 'Saving…' : 'Save priority'}</button>
        <button className="secondary" disabled={busy || disabled} onClick={() => { setMode(null); setConfirmed(false); setError(''); setReason(''); setTarget(''); }}>Back</button></div>
    </>}
  </section>;
}
