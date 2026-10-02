import type { ReactNode } from 'react';
import type { TicketRecord } from '@/lib/contracts';
import type { AreaName } from '@/lib/use-area-names';
import { TicketCard } from './ticket-card';

interface TicketListProps {
  projectId: string;
  tickets: TicketRecord[];
  areaNames?: Map<string, AreaName>;
  renderActions?: (ticket: TicketRecord) => ReactNode;
  emptyTitle?: string;
  emptyMessage?: string;
}

export function TicketList({
  projectId,
  tickets,
  areaNames,
  renderActions,
  emptyTitle = 'No requests yet',
  emptyMessage = 'Requests you can see will appear here.',
}: TicketListProps) {
  if (tickets.length === 0) {
    return (
      <div className="empty-state" role="status">
        <strong>{emptyTitle}</strong>
        <span>{emptyMessage}</span>
      </div>
    );
  }

  return (
    <div className="request-list as-table" role="list" aria-label="Requests">
      <div className="request-list-head" aria-hidden="true">
        <span>Number</span><span>Request</span><span>Type</span><span>Need-By</span><span>Status</span>
      </div>
      {tickets.map((ticket) => (
        <div role="listitem" key={ticket.id} className="request-list-item">
          <TicketCard
            ticket={ticket}
            detailHref={`/projects/${projectId}/tickets/${ticket.id}`}
            areaName={ticket.aorNodeId ? areaNames?.get(ticket.aorNodeId)?.path : undefined}
            actions={renderActions?.(ticket)}
          />
        </div>
      ))}
    </div>
  );
}
