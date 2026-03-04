import type { TicketStatus } from '@/lib/contracts';
import { TICKET_STATUS_LABELS } from '@/lib/contracts';
import { cn } from './cn';

const DANGER_STATUSES: TicketStatus[] = ['REJECTED', 'REQUESTER_CANCELED', 'FIELD_CANCELED', 'SURVEY_CANCELED'];
const WARNING_STATUSES: TicketStatus[] = ['SUBMITTED', 'APPROVED', 'PENDING_PC_APPROVAL', 'DELAYED'];
const SUCCESS_STATUSES: TicketStatus[] = ['COMPLETED'];

function statusClass(status: TicketStatus): string {
  if (SUCCESS_STATUSES.includes(status)) return 'badge-success';
  if (DANGER_STATUSES.includes(status)) return 'badge-danger';
  if (WARNING_STATUSES.includes(status)) return 'badge-warning';
  return 'badge-neutral';
}

export function StatusBadge({ status }: { status: TicketStatus }) {
  return (
    <span className={cn('badge', statusClass(status))}>
      {TICKET_STATUS_LABELS[status]}
    </span>
  );
}
