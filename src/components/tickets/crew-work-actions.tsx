'use client';

import type { TicketRecord } from '@/lib/contracts';
import { Button } from '@/components/ui';

interface CrewWorkActionsProps {
  ticket: TicketRecord;
  busy?: boolean;
  onStart: (ticketId: string) => Promise<void>;
  onSubmitComplete: (ticketId: string) => Promise<void>;
  onDelay: (ticketId: string, reason: string) => Promise<void>;
  onReportInability: (ticketId: string, reason: string) => Promise<void>;
  onFlagStopWork: (ticketId: string, reason: string) => Promise<void>;
  onRestartDelay: (ticketId: string) => Promise<void>;
}

export function CrewWorkActions({
  ticket,
  busy = false,
  onStart,
  onSubmitComplete,
  onDelay,
  onReportInability,
  onFlagStopWork,
  onRestartDelay,
}: CrewWorkActionsProps) {
  if (ticket.status === 'ASSIGNED') {
    return <Button disabled={busy} onClick={() => void onStart(ticket.id)}>Start Work</Button>;
  }

  if (ticket.status === 'IN_PROGRESS') {
    return (
      <div className="row">
        <Button disabled={busy} onClick={() => void onSubmitComplete(ticket.id)}>
          Complete Work
        </Button>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => {
            const reason = window.prompt('Delay reason');
            if (reason) {
              void onDelay(ticket.id, reason);
            }
          }}
        >
          Mark Delayed
        </Button>
        <Button
          variant="danger"
          disabled={busy}
          onClick={() => {
            const reason = window.prompt('Why is the work unable to be performed?');
            if (reason?.trim()) void onReportInability(ticket.id, reason);
          }}
        >
          Report Unable to Perform
        </Button>
        <Button
          variant="danger"
          disabled={busy}
          onClick={() => {
            const reason = window.prompt('Why should this SWR be permanently stopped?');
            if (reason?.trim()) void onFlagStopWork(ticket.id, reason);
          }}
        >
          Flag Stop Work
        </Button>
      </div>
    );
  }

  if (ticket.status === 'DELAYED') {
    return (
      <div className="row">
        <Button disabled={busy} onClick={() => void onRestartDelay(ticket.id)}>Restart Delay</Button>
        <Button
          variant="danger"
          disabled={busy}
          onClick={() => {
            const reason = window.prompt('Why should this SWR be permanently stopped?');
            if (reason?.trim()) void onFlagStopWork(ticket.id, reason);
          }}
        >
          Flag Stop Work
        </Button>
      </div>
    );
  }

  return <p className="muted">No crew action available for this state.</p>;
}
