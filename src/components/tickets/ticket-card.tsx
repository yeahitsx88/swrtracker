import Link from 'next/link';
import type { TicketRecord } from '@/lib/contracts';
import { StatusBadge } from '@/components/ui';
import { formatCalendarDate } from '@/lib/calendar-date';

interface TicketCardProps {
  ticket: TicketRecord;
  detailHref: string;
}

export function TicketCard({ ticket, detailHref }: TicketCardProps) {
  return (
    <article className="ticket-card">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <p className="ticket-headline">{ticket.ticketNumber ?? 'Unsubmitted draft'}</p>
        <StatusBadge status={ticket.status} />
      </div>
      <p className="muted">{ticket.ticketType ?? 'Type not selected'}{ticket.craft ? ` - ${ticket.craft}` : ''}</p>
      <p className="muted">
        Requested by: {ticket.isOwnRequest ? 'You' : ticket.requesterName ?? 'Unknown requester'}
      </p>
      <p className="muted">Need-By: {formatCalendarDate(ticket.requestedDate)}</p>
      {ticket.status === 'DRAFT' ? <p>{ticket.description || 'No request details yet.'}</p> : null}
      <Link href={detailHref} className="app-link ticket-detail-link" aria-label={`Open Details for ${ticket.ticketNumber ?? 'unsubmitted draft'}`}>
        Open Details
      </Link>
    </article>
  );
}
