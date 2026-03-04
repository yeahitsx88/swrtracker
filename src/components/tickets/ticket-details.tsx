import type { TicketRecord } from '@/lib/contracts';
import { StatusBadge } from '@/components/ui';

interface TicketDetailsProps {
  ticket: TicketRecord;
}

export function TicketDetails({ ticket }: TicketDetailsProps) {
  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <p className="ticket-headline">{ticket.ticketNumber ?? ticket.id}</p>
        <StatusBadge status={ticket.status} />
      </div>
      <p className="muted">Type: {ticket.ticketType}</p>
      <p className="muted">Craft: {ticket.craft}</p>
      <p className="muted">Priority: {ticket.priority}</p>
      <p className="muted">Requested Date: {new Date(ticket.requestedDate).toLocaleDateString()}</p>
      <p>{ticket.description}</p>
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
