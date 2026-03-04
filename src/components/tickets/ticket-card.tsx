import Link from 'next/link';
import type { TicketRecord } from '@/lib/contracts';
import { StatusBadge } from '@/components/ui';

interface TicketCardProps {
  ticket: TicketRecord;
  detailHref: string;
}

export function TicketCard({ ticket, detailHref }: TicketCardProps) {
  return (
    <article className="ticket-card">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <p className="ticket-headline">{ticket.ticketNumber ?? ticket.id}</p>
        <StatusBadge status={ticket.status} />
      </div>
      <p className="muted">{ticket.ticketType} - {ticket.craft}</p>
      <p className="muted">Requested: {new Date(ticket.requestedDate).toLocaleDateString()}</p>
      <Link href={detailHref} className="app-link">
        Open Details
      </Link>
    </article>
  );
}
