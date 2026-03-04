import type { TicketRecord } from '@/lib/contracts';
import { TicketCard } from './ticket-card';

interface TicketListProps {
  projectId: string;
  tickets: TicketRecord[];
}

export function TicketList({ projectId, tickets }: TicketListProps) {
  if (tickets.length === 0) {
    return <p className="muted">No tickets available.</p>;
  }

  return (
    <div className="ticket-grid">
      {tickets.map((ticket) => (
        <TicketCard
          key={ticket.id}
          ticket={ticket}
          detailHref={`/projects/${projectId}/tickets/${ticket.id}`}
        />
      ))}
    </div>
  );
}
