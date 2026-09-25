'use client';

import { useRef, useState } from 'react';
import { api, errorMessage, jsonBody } from '@/app/ui/api';
import type { RequestTicket } from '@/app/ui/request-types';
import { CrewPicker, type Candidate } from './assignment-actions';

export function SuperintendentActions({ ticket, disabled, onBusyChange, onChanged }: {
  ticket: RequestTicket; disabled: boolean; onBusyChange: (busy: boolean) => void; onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Candidate | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  if (!ticket.superintendentReassignment) return null;
  async function save() {
    if (disabled || inFlight.current) return;
    if (!selected) { setError('Select a Superintendent.'); return; }
    if (selected.id === ticket.surveySuperintendentId) { setError('Select a different Superintendent.'); return; }
    if (!reason.trim() || reason.trim().length > 500) { setError('Enter a reassignment reason of 1–500 characters.'); return; }
    inFlight.current = true; setBusy(true); onBusyChange(true); setError('');
    try {
      await api(`/api/tickets/${ticket.id}/reassign-superintendent`, jsonBody({ superintendentId: selected.id, reason: reason.trim() }));
      onChanged();
    } catch (cause) { setError(errorMessage(cause)); inFlight.current = false; setBusy(false); onBusyChange(false); }
  }
  return <section className="panel"><h2>Superintendent responsibility</h2>
    <p>Current Superintendent: {ticket.superintendentName ?? 'Not assigned'}</p>
    {!open ? <button disabled={disabled} onClick={() => setOpen(true)}>Reassign Superintendent</button> : <>
      <p>Choose a Superintendent who covers this location. This changes responsibility for this request and preserves its current work status and pending reports.</p>
      <CrewPicker ticketId={ticket.id} endpoint="reassign-superintendent" role="SURVEY_SUPERINTENDENT" label="Superintendent" value={selected} onChange={setSelected} disabled={disabled || busy} />
      <label className="field">Superintendent reassignment reason (required)<textarea value={reason} maxLength={500} disabled={disabled || busy} onChange={event => setReason(event.target.value)} /></label>
      {error && <p className="notice error" role="alert">{error}</p>}
      <div className="actions"><button disabled={disabled || busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Confirm Superintendent'}</button>
        <button className="secondary" disabled={disabled || busy} onClick={() => { setOpen(false); setError(''); }}>Back</button></div>
    </>}
  </section>;
}
