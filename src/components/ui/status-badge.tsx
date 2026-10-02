import type { TicketStatus } from '@/lib/contracts';
import { TICKET_STATUS_LABELS } from '@/lib/contracts';
import { statusTone } from '@/lib/display-labels';
import { cn } from './cn';

/** `viewerIsRequester` only changes wording: staff see "Canceled by requester" instead of "Canceled by You". */
export function StatusBadge({ status, viewerIsRequester = true }: { status: TicketStatus; viewerIsRequester?: boolean }) {
  const label = status === 'REQUESTER_CANCELED' && !viewerIsRequester ? 'Canceled by requester' : TICKET_STATUS_LABELS[status];
  return (
    <span className={cn('badge', 'status-badge', `tone-${statusTone(status)}`)}>
      {label}
    </span>
  );
}
