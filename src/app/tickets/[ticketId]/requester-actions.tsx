'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, errorMessage, jsonBody } from '@/app/ui/api';
import type { RequestDraft, RequestTicket } from '@/app/ui/request-types';

export function RequesterActions({ ticket, disabled, onBusyChange, onCanceled }: {
  ticket: RequestTicket; disabled: boolean; onBusyChange: (busy: boolean) => void;
  onCanceled: () => void;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const { canCancel, canResubmit } = ticket.requesterActions;
  if (!canCancel && !canResubmit) return null;

  async function act(action: 'cancel' | 'resubmit') {
    if (disabled || inFlight.current) return;
    inFlight.current = true; setBusy(true); onBusyChange(true); setError('');
    let navigating = false;
    try {
      if (action === 'cancel') {
        await api(`/api/tickets/${ticket.id}/cancel-request`, jsonBody({}));
        setConfirming(false); onCanceled();
      } else {
        const result = await api<{ ticket: RequestDraft }>('/api/tickets/drafts', jsonBody({
          action: 'save', projectId: ticket.projectId, parentTicketId: ticket.id,
        }));
        router.push(`/project/${ticket.projectId}/request?draft=${result.ticket.id}`);
        navigating = true;
      }
    } catch (cause) { setError(errorMessage(cause)); }
    finally {
      if (!navigating) { inFlight.current = false; setBusy(false); onBusyChange(false); }
    }
  }

  return <section className="panel" aria-label="Manage your request"><h2>Manage your request</h2>
    {error && <p className="notice error" role="alert">{error}</p>}
    {canResubmit && <div>
      <p>Create a new draft with these work details after discussing the rejection with the survey team. Choose a new requested date and attach any needed files again.</p>
      <button disabled={disabled || busy} onClick={() => void act('resubmit')}>{busy ? 'Working…' : 'Revise and resubmit'}</button>
    </div>}
    {canCancel && (confirming ? <div className="notice warning" role="group" aria-label="Confirm cancellation">
      <p>Cancel {ticket.ticketNumber}? This permanently cancels the request and notifies the survey team.</p>
      <div className="actions"><button className="danger" disabled={disabled || busy} onClick={() => void act('cancel')}>{busy ? 'Canceling…' : 'Confirm cancellation'}</button>
        <button className="secondary" disabled={busy} onClick={() => setConfirming(false)}>Keep request</button></div>
    </div> : <div className="actions"><button className="danger" disabled={disabled || busy} onClick={() => setConfirming(true)}>Cancel request</button></div>)}
  </section>;
}
