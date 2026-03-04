'use client';

import type { TicketRecord } from '@/lib/contracts';
import { Button } from '@/components/ui';

interface ApprovalActionsProps {
  ticket: TicketRecord;
  busy?: boolean;
  onApprove: (ticketId: string) => Promise<void>;
  onReject: (ticketId: string, reason?: string) => Promise<void>;
}

function approveLabel(ticket: TicketRecord): string {
  if (ticket.pendingPcOutcome === 'DELAYED') return 'Mark Delayed';
  if (ticket.pendingPcOutcome === 'FIELD_CANCELED') return 'Approve Field Cancel';
  return 'Approve Completed';
}

export function ApprovalActions({ ticket, busy = false, onApprove, onReject }: ApprovalActionsProps) {
  if (ticket.status !== 'PENDING_PC_APPROVAL') {
    return <p className="muted">This ticket is not waiting for Party Chief approval.</p>;
  }

  return (
    <div className="row">
      <Button disabled={busy} onClick={() => void onApprove(ticket.id)}>
        {approveLabel(ticket)}
      </Button>
      <Button
        variant="secondary"
        disabled={busy}
        onClick={() => {
          const reason = window.prompt('Optional reject reason');
          void onReject(ticket.id, reason ?? undefined);
        }}
      >
        Reject to In Progress
      </Button>
    </div>
  );
}
