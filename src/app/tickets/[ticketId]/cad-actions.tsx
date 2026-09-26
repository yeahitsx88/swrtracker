'use client';

import { useRef, useState } from 'react';
import { api, errorMessage, jsonBody } from '@/app/ui/api';

export function CadActions({ ticketId, allowed, progressAction, disabled, onBusyChange, onChanged }: {
  ticketId: string; allowed: boolean; disabled: boolean;
  progressAction: 'START' | 'SUBMIT_QA' | null;
  onBusyChange: (busy: boolean) => void; onChanged: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  if (!allowed && !progressAction) return null;
  async function submit(signOff: boolean) {
    if (disabled || inFlight.current) return;
    inFlight.current = true; setBusy(true); onBusyChange(true); setError('');
    try {
      await api(`/api/tickets/${ticketId}/${signOff ? 'cad-sign-off' : 'cad-progress'}`,
        jsonBody(signOff ? {} : { action: progressAction }));
      onChanged();
    } catch (cause) { setError(errorMessage(cause)); inFlight.current = false; setBusy(false); onBusyChange(false); }
  }
  if (progressAction) return <div>
    <p>{progressAction === 'START' ? 'Begin the CAD work assigned to you.' : 'Send your completed CAD work to the CAD Lead for quality review.'}</p>
    {error && <p className="notice error" role="alert">{error}</p>}
    <button disabled={disabled || busy} onClick={() => void submit(false)}>
      {busy ? 'Saving…' : progressAction === 'START' ? 'Start CAD work' : 'Submit for CAD review'}
    </button>
  </div>;
  return <div>{!confirm ? <button disabled={disabled} onClick={() => setConfirm(true)}>Sign off CAD review</button> : <>
    <p>Confirm that your CAD quality review is complete. This records you as the reviewer and marks the CAD work complete.</p>
    {error && <p className="notice error" role="alert">{error}</p>}
    <div className="actions"><button disabled={disabled || busy} onClick={() => void submit(true)}>{busy ? 'Signing off…' : 'Confirm CAD completion'}</button>
      <button className="secondary" disabled={disabled || busy} onClick={() => { setConfirm(false); setError(''); }}>Back</button></div>
  </>}</div>;
}
