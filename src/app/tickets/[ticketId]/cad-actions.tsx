'use client';

import { useRef, useState } from 'react';
import { CrewPicker, type Candidate } from './assignment-actions';
import { api, errorMessage, jsonBody } from '@/app/ui/api';

export function CadActions({ ticketId, allowed, canActivate, progressAction, disabled, onBusyChange, onChanged }: {
  ticketId: string; allowed: boolean; canActivate: boolean; disabled: boolean;
  progressAction: 'START' | 'SUBMIT_QA' | null;
  onBusyChange: (busy: boolean) => void; onChanged: () => void;
}) {
  const [assignee, setAssignee] = useState<Candidate | null>(null);
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  if (!allowed && !progressAction && !canActivate) return null;
  async function submit(action: 'SIGN_OFF' | 'PROGRESS' | 'ACTIVATE') {
    if (disabled || inFlight.current) return;
    if (action === 'ACTIVATE' && !assignee) { setError('Select a CAD assignee.'); return; }
    inFlight.current = true; setBusy(true); onBusyChange(true); setError('');
    try {
      await api(`/api/tickets/${ticketId}/${action === 'ACTIVATE' ? 'cad-activate' : action === 'SIGN_OFF' ? 'cad-sign-off' : 'cad-progress'}`,
        jsonBody(action === 'ACTIVATE' ? { assigneeId: assignee?.id } : action === 'SIGN_OFF' ? {} : { action: progressAction }));
      onChanged();
    } catch (cause) { setError(errorMessage(cause)); inFlight.current = false; setBusy(false); onBusyChange(false); }
  }
  if (canActivate) return <div>{!open ? <button disabled={disabled} onClick={() => setOpen(true)}>Assign CAD work</button> : <>
    <p>Select the CAD Technician or Lead who will perform this work.</p>
    <CrewPicker ticketId={ticketId} endpoint="cad-activate" role="CAD_TECHNICIAN" label="CAD assignee"
      value={assignee} onChange={setAssignee} disabled={disabled || busy} />
    {error && <p className="notice error" role="alert">{error}</p>}
    <div className="actions"><button disabled={disabled || busy} onClick={() => void submit('ACTIVATE')}>{busy ? 'Assigning…' : 'Confirm CAD assignment'}</button>
      <button className="secondary" disabled={disabled || busy} onClick={() => { setOpen(false); setError(''); }}>Back</button></div>
  </>}</div>;
  if (progressAction) return <div>
    <p>{progressAction === 'START' ? 'Begin the CAD work assigned to you.' : 'Send your completed CAD work to the CAD Lead for quality review.'}</p>
    {error && <p className="notice error" role="alert">{error}</p>}
    <button disabled={disabled || busy} onClick={() => void submit('PROGRESS')}>
      {busy ? 'Saving…' : progressAction === 'START' ? 'Start CAD work' : 'Submit for CAD review'}
    </button>
  </div>;
  return <div>{!confirm ? <button disabled={disabled} onClick={() => setConfirm(true)}>Sign off CAD review</button> : <>
    <p>Confirm that your CAD quality review is complete. This records you as the reviewer and marks the CAD work complete.</p>
    {error && <p className="notice error" role="alert">{error}</p>}
    <div className="actions"><button disabled={disabled || busy} onClick={() => void submit('SIGN_OFF')}>{busy ? 'Signing off…' : 'Confirm CAD completion'}</button>
      <button className="secondary" disabled={disabled || busy} onClick={() => { setConfirm(false); setError(''); }}>Back</button></div>
  </>}</div>;
}
