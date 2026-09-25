'use client';

import { useRef, useState } from 'react';
import { api, errorMessage, jsonBody } from '@/app/ui/api';
import type { RequestTicket } from '@/app/ui/request-types';

type Action = 'start' | 'complete' | 'COMPLETED' | 'DELAYED' | 'FIELD_CANCELED' | 'APPROVE' | 'REJECT' | 'RESTART';
const labels: Record<Action, string> = { start: 'Start work', complete: 'Complete work', COMPLETED: 'Report completion',
  DELAYED: 'Report delay', FIELD_CANCELED: 'Request field cancellation', APPROVE: 'Approve field report',
  REJECT: 'Return to work', RESTART: 'Restart work' };
const statuses = { COMPLETED: 'Completion', DELAYED: 'Delay', FIELD_CANCELED: 'Field cancellation' };

export function FieldActions({ ticket, disabled, onBusyChange, onChanged }: {
  ticket: RequestTicket; disabled: boolean; onBusyChange: (busy: boolean) => void; onChanged: () => void;
}) {
  const [action, setAction] = useState<Action | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const available: Action[] = [];
  const caps = ticket.fieldActions;
  if (caps.canStart) available.push('start');
  if (caps.canCompleteDirectly) available.push('complete');
  if (caps.canReport) available.push('COMPLETED', 'DELAYED');
  if (caps.canRequestFieldCancel) available.push('FIELD_CANCELED');
  if (caps.canResolve) available.push('APPROVE', 'REJECT');
  if (caps.canRestart) available.push('RESTART');
  if (!available.length && !ticket.pendingFieldStatus) return null;
  const hasReason = action && ['DELAYED', 'FIELD_CANCELED', 'REJECT'].includes(action);
  async function submit() {
    if (!action || disabled || inFlight.current) return;
    if (action === 'DELAYED' && !reason.trim()) { setError('Enter a reason for the delay.'); return; }
    inFlight.current = true; setBusy(true); onBusyChange(true); setError('');
    const endpoint = action === 'start' || action === 'complete' ? action : 'field-status';
    const body = ['COMPLETED', 'DELAYED', 'FIELD_CANCELED'].includes(action)
      ? { action: 'SUBMIT', requestedStatus: action, reason: reason.trim() }
      : { action, reason: reason.trim() };
    try { await api(`/api/tickets/${ticket.id}/${endpoint}`, jsonBody(body)); onChanged(); }
    catch (cause) { setError(errorMessage(cause)); inFlight.current = false; setBusy(false); onBusyChange(false); }
  }
  return <section className="panel"><h2>Field work</h2>
    {ticket.pendingFieldStatus && <div className="notice"><p>{statuses[ticket.pendingFieldStatus]} is awaiting field lead approval.</p>
      {ticket.pendingFieldReason && <p className="description">{ticket.pendingFieldReason}</p>}</div>}
    {!action ? <div className="actions">{available.map(value => <button key={value} disabled={disabled} onClick={() => { setAction(value); setReason(''); setError(''); }}>{labels[value]}</button>)}</div> : <>
      <h3>{labels[action]}</h3>
      <p>{action === 'FIELD_CANCELED' ? 'This requests approval to permanently cancel the field work.'
        : action === 'APPROVE' && ticket.pendingFieldStatus === 'FIELD_CANCELED' ? 'Approving permanently cancels this request.'
        : action === 'COMPLETED' || action === 'DELAYED' ? 'Your field report will be sent for approval.'
        : action === 'REJECT' ? 'This rejects the pending report and returns the request to In Progress.'
        : 'Confirm this update to the request.'}</p>
      {hasReason && <label className="field">{action === 'DELAYED' ? 'Delay reason (required)' : 'Reason (optional)'}<textarea disabled={disabled || busy} value={reason} onChange={event => setReason(event.target.value)} /></label>}
      {error && <p className="notice error" role="alert">{error}</p>}
      <div className="actions"><button disabled={disabled || busy} onClick={() => void submit()}>{busy ? 'Saving…' : 'Confirm update'}</button>
        <button className="secondary" disabled={disabled || busy} onClick={() => setAction(null)}>Back</button></div>
    </>}
  </section>;
}
