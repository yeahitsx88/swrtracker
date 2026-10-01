import Link from 'next/link';
import type { TicketRecord } from '@/lib/contracts';
import { StatusBadge } from '@/components/ui';
import { formatCalendarDate } from '@/lib/calendar-date';

interface TicketDetailsProps {
  ticket: TicketRecord;
}

export function TicketDetails({ ticket }: TicketDetailsProps) {
  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <p className="ticket-headline">{ticket.ticketNumber ?? 'Unsubmitted draft'}</p>
        <StatusBadge status={ticket.status} />
      </div>
      <p className="muted">Type: {ticket.ticketType ?? 'Not selected'}</p>
      <p className="muted">
        Requested by: {ticket.isOwnRequest ? 'You' : ticket.requesterName ?? 'Unknown requester'}
      </p>
      <p className="muted">Craft / Discipline: {ticket.craft || 'Not specified'}</p>
      <p className="muted">Point of Contact: {ticket.fieldContact ?? '-'}</p>
      <p className="muted">Phone / Radio Channel: {ticket.fieldChannel ?? '-'}</p>
      <p className="muted">Priority: {ticket.priority}</p>
      <p className="muted">Need-By: {formatCalendarDate(ticket.requestedDate)}</p>
      {ticket.originalRequestedDate ? <p className="muted">Originally requested Need-By: {formatCalendarDate(ticket.originalRequestedDate)}</p> : null}
      <p>{ticket.description}</p>
      {ticket.parentTicketId ? (
        <p>
          Follow-up to{' '}
          <Link className="app-link" href={`/projects/${ticket.projectId}/tickets/${ticket.parentTicketId}`}>
            the completed parent SWR
          </Link>
        </p>
      ) : null}
      {ticket.pendingPcOutcome ? (
        <p className="muted">
          Pending Outcome: {ticket.pendingPcOutcome}
          {ticket.pendingPcReason ? ` - Reason: ${ticket.pendingPcReason}` : ''}
        </p>
      ) : null}
      {ticket.rejectionReason ? <p className="muted">Rejection Reason: {ticket.rejectionReason}</p> : null}
    </div>
  );
}
