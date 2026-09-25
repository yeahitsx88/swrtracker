'use client';

import { useRef, useState } from 'react';
import { api, errorMessage, jsonBody } from '@/app/ui/api';
import type { RequestTicket } from '@/app/ui/request-types';
import { CrewPicker, type Candidate } from './assignment-actions';

export function ReassignmentActions({ ticket, disabled, onBusyChange, onChanged }: {
  ticket: RequestTicket; disabled: boolean; onBusyChange: (busy: boolean) => void; onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [chief, setChief] = useState<Candidate | null>(ticket.assignedPartyChiefId
    ? { id: ticket.assignedPartyChiefId, name: ticket.partyChiefName ?? 'Current Party Chief' } : null);
  const [instrument, setInstrument] = useState<Candidate | null>(ticket.assignedInstrumentManId
    ? { id: ticket.assignedInstrumentManId, name: ticket.instrumentManName ?? 'Current Instrument Man' } : null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const capability = ticket.reassignment;
  if (!capability) return null;
  const slim = capability.crewBuild === 'SLIM';
  async function reassign() {
    if (disabled || inFlight.current || !capability) return;
    const chiefId = slim ? null : capability.canChangePartyChief ? chief?.id ?? null : ticket.assignedPartyChiefId;
    const instrumentId = instrument?.id ?? null;
    if (!slim && !chiefId) { setError('Select a Party Chief.'); return; }
    if (capability.instrumentManRequired && !instrumentId) { setError('Select an Instrument Man.'); return; }
    if (chiefId === ticket.assignedPartyChiefId && instrumentId === ticket.assignedInstrumentManId) {
      setError('Select a different crew member before saving.'); return;
    }
    if (!reason.trim() || reason.trim().length > 500) { setError('Enter a reassignment reason of 1–500 characters.'); return; }
    inFlight.current = true; setBusy(true); onBusyChange(true); setError('');
    try {
      await api(`/api/tickets/${ticket.id}/reassign-crew`, jsonBody({
        assignedPartyChiefId: chiefId, assignedInstrumentManId: instrumentId, reason: reason.trim(),
      }));
      onChanged();
    } catch (cause) { setError(errorMessage(cause)); inFlight.current = false; setBusy(false); onBusyChange(false); }
  }
  return <section className="panel"><h2>Crew reassignment</h2>
    {!open ? <button disabled={disabled} onClick={() => setOpen(true)}>Reassign crew</button> : <>
      <p>Choose the replacement crew and explain the change. The request keeps its current work status.</p>
      {ticket.status === 'PENDING_PC_APPROVAL' && <p className="notice">The field report remains pending approval after reassignment.</p>}
      {capability.canChangePartyChief && <CrewPicker ticketId={ticket.id} endpoint="reassign-crew" role="PARTY_CHIEF" label="Party Chief" value={chief} onChange={setChief} disabled={disabled || busy} />}
      {!slim && !capability.canChangePartyChief && <p>Party Chief: {ticket.partyChiefName ?? 'You'} (unchanged)</p>}
      <CrewPicker ticketId={ticket.id} endpoint="reassign-crew" role="INSTRUMENT_MAN" label="Instrument Man" value={instrument} onChange={setInstrument} disabled={disabled || busy} />
      <p>{capability.instrumentManRequired ? 'An Instrument Man is required.' : 'Instrument Man is optional. Clear the selection to remove this assignment.'}</p>
      <label className="field">Reassignment reason (required)<textarea value={reason} maxLength={500} disabled={disabled || busy} onChange={event => setReason(event.target.value)} /></label>
      {error && <p className="notice error" role="alert">{error}</p>}
      <div className="actions"><button disabled={disabled || busy} onClick={() => void reassign()}>{busy ? 'Saving…' : 'Confirm reassignment'}</button>
        <button className="secondary" disabled={disabled || busy} onClick={() => { setOpen(false); setError(''); }}>Back</button></div>
    </>}
  </section>;
}
