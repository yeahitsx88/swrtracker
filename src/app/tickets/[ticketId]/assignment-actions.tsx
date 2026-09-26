'use client';

import { useEffect, useRef, useState } from 'react';
import { api, errorMessage, jsonBody } from '@/app/ui/api';
import type { RequestTicket } from '@/app/ui/request-types';

export interface Candidate { id: string; name: string }
interface CandidatePage { candidates: Candidate[]; hasMore: boolean }

export function CrewPicker({ ticketId, role, label, value, onChange, disabled, endpoint = 'assign' }: {
  endpoint?: 'assign' | 'reassign-crew' | 'reassign-superintendent' | 'cad-activate';
  ticketId: string; role: 'PARTY_CHIEF' | 'INSTRUMENT_MAN' | 'SURVEY_SUPERINTENDENT' | 'CAD_TECHNICIAN'; label: string;
  value: Candidate | null; onChange: (candidate: Candidate | null) => void; disabled: boolean;
}) {
  const [text, setText] = useState('');
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [revision, setRevision] = useState(0);
  const [page, setPage] = useState<CandidatePage | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let current = true; setPage(null); setError('');
    api<CandidatePage>(`/api/tickets/${ticketId}/${endpoint}?role=${role}&search=${encodeURIComponent(search)}&limit=20&offset=${offset}`)
      .then(result => { if (current) setPage(result); })
      .catch(cause => { if (current) setError(errorMessage(cause)); });
    return () => { current = false; };
  }, [ticketId, endpoint, role, search, offset, revision]);
  return <fieldset disabled={disabled} style={{ border: '1px solid #ccd4d8', borderRadius: 8, padding: 16, marginBottom: 16 }}>
    <legend>{label}</legend>
    <p aria-live="polite">Selected: {value?.name ?? 'None'} {value && <button className="secondary" onClick={() => onChange(null)}>Clear {label}</button>}</p>
    <label className="field">Search {label}<input value={text} maxLength={200} onChange={event => setText(event.target.value)} /></label>
    <button className="secondary" onClick={() => { setSearch(text.trim()); setOffset(0); setRevision(n => n + 1); }}>Search {label}</button>
    {error && <p className="notice error" role="alert">{error}</p>}
    {!page && !error && <p role="status">Loading crew…</p>}
    {page && <><div className="actions" style={{ marginTop: 12 }}>{page.candidates.map(candidate =>
      <button key={candidate.id} className="secondary" aria-pressed={value?.id === candidate.id} onClick={() => onChange(candidate)}>{candidate.name}</button>)}</div>
      {!page.candidates.length && <p>No matching crew members. Try another name or ask your administrator to check project memberships.</p>}
      {(offset > 0 || page.hasMore) && <div className="actions"><button className="secondary" disabled={!offset} onClick={() => setOffset(offset - 20)}>Previous {label}</button>
        <span>Page {offset / 20 + 1}</span><button className="secondary" disabled={!page.hasMore} onClick={() => setOffset(offset + 20)}>Next {label}</button></div>}
    </>}
  </fieldset>;
}

export function AssignmentActions({ ticket, disabled, onBusyChange, onAssigned }: {
  ticket: RequestTicket; disabled: boolean; onBusyChange: (busy: boolean) => void; onAssigned: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [chief, setChief] = useState<Candidate | null>(null);
  const [instrument, setInstrument] = useState<Candidate | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  if (!ticket.assignment) return null;
  const slim = ticket.assignment.crewBuild === 'SLIM';
  async function assign() {
    if (disabled || inFlight.current) return;
    if (slim ? !instrument : !chief) { setError(slim ? 'Select an Instrument Man.' : 'Select a Party Chief.'); return; }
    inFlight.current = true; setBusy(true); onBusyChange(true); setError('');
    try {
      await api(`/api/tickets/${ticket.id}/assign`, jsonBody({
        assignedPartyChiefId: slim ? null : chief?.id ?? null,
        assignedInstrumentManId: instrument?.id ?? null,
      }));
      onAssigned();
    } catch (cause) { setError(errorMessage(cause)); inFlight.current = false; setBusy(false); onBusyChange(false); }
  }
  return <section className="panel"><h2>Crew assignment</h2>
    {!open ? <button disabled={disabled} onClick={() => setOpen(true)}>Assign crew</button> : <>
      <p>{slim ? 'Select the Instrument Man who will perform this work.' : 'Select a Party Chief. You may also assign an Instrument Man.'}</p>
      {!slim && <CrewPicker ticketId={ticket.id} role="PARTY_CHIEF" label="Party Chief" value={chief} onChange={setChief} disabled={disabled || busy} />}
      <CrewPicker ticketId={ticket.id} role="INSTRUMENT_MAN" label="Instrument Man" value={instrument} onChange={setInstrument} disabled={disabled || busy} />
      {error && <p className="notice error" role="alert">{error}</p>}
      <div className="actions"><button disabled={disabled || busy} onClick={() => void assign()}>{busy ? 'Assigning…' : 'Confirm assignment'}</button>
        <button className="secondary" disabled={disabled || busy} onClick={() => { setOpen(false); setError(''); }}>Back</button></div>
    </>}
  </section>;
}
