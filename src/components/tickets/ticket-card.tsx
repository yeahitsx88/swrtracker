import Link from 'next/link';
import type { ReactNode } from 'react';
import type { TicketRecord } from '@/lib/contracts';
import { StatusBadge } from '@/components/ui';
import { Icon } from '@/components/ui/icon';
import { formatCalendarDate } from '@/lib/calendar-date';
import { isPastNeedBy, priorityLabel, ticketTypeLabel } from '@/lib/display-labels';
import { cn } from '@/components/ui/cn';

interface TicketCardProps {
  ticket: TicketRecord;
  detailHref: string;
  /** Display-only Area path resolved from the project Area tree. */
  areaName?: string;
  /** Optional workflow controls rendered in the card footer, above the card link. */
  actions?: ReactNode;
}

export function TicketCard({ ticket, detailHref, areaName, actions }: TicketCardProps) {
  const number = ticket.ticketNumber ?? 'Unsubmitted draft';
  const overdue = isPastNeedBy(ticket.status, ticket.requestedDate);
  const elevated = ticket.priority === 'HIGH' || ticket.priority === 'MED_HIGH';
  const needBy = ticket.requestedDate ? formatCalendarDate(ticket.requestedDate) : 'No Need-By';
  const requester = ticket.isOwnRequest ? null : ticket.requesterName ?? 'Unknown requester';

  return (
    <article className={cn('ticket-card request-card', overdue && 'is-overdue')}>
      <div className="request-card-top">
        <span className="request-cell-number request-number">
          <Link className="stretched-link" href={detailHref} aria-label={`Open Details for ${number}`}>{number}</Link>
        </span>
        <span className="request-cell-status"><StatusBadge status={ticket.status} viewerIsRequester={ticket.isOwnRequest !== false} /></span>
      </div>
      <div className="request-card-body">
        <div className="request-cell-main">
          <p className={cn('request-title', !ticket.description && 'request-title-empty')}>
            {ticket.description || 'No request details yet'}
          </p>
          <div className="meta-row">
            {areaName ? <span className="meta-item"><Icon name="pin" size={15} />{areaName}</span> : null}
            <span className="meta-item meta-phone">{ticketTypeLabel(ticket.ticketType)}{ticket.craft ? ` · ${ticket.craft}` : ''}</span>
            <span className={cn('meta-item meta-phone', overdue && 'meta-overdue')}>
              <Icon name={overdue ? 'alert' : 'calendar'} size={15} />
              {overdue ? `Overdue · ${needBy}` : `Need-By ${needBy}`}
            </span>
            {requester ? <span className="meta-item"><Icon name="user" size={15} />{requester}</span> : null}
            {elevated ? <span className="chip chip-flag"><Icon name="flag" size={13} />{priorityLabel(ticket.priority)} priority</span> : null}
          </div>
        </div>
        <span className="request-cell-type">
          <span>{ticketTypeLabel(ticket.ticketType)}</span>
          {ticket.craft ? <span className="muted">{ticket.craft}</span> : null}
        </span>
        <span className={cn('request-cell-date', overdue && 'meta-overdue')}>
          <span>{needBy}</span>
          {overdue ? <span className="meta-item"><Icon name="alert" size={14} />Overdue</span> : null}
        </span>
      </div>
      {actions ? <div className="card-actions">{actions}</div> : null}
    </article>
  );
}
