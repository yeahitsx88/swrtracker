import Link from 'next/link';
import type { TicketRecord } from '@/lib/contracts';
import { StatusBadge } from '@/components/ui';
import { Icon } from '@/components/ui/icon';
import { formatCalendarDate } from '@/lib/calendar-date';
import { humanizeCode, isPastNeedBy, priorityLabel, ticketTypeLabel } from '@/lib/display-labels';

interface TicketDetailsProps {
  ticket: TicketRecord;
  /** Display-only Area path resolved from the project Area tree. */
  areaPath?: string;
}

export function TicketDetails({ ticket, areaPath }: TicketDetailsProps) {
  const overdue = isPastNeedBy(ticket.status, ticket.requestedDate);
  const requester = ticket.isOwnRequest ? 'You' : ticket.requesterName ?? 'Unknown requester';
  const revisedNeedBy = ticket.originalRequestedDate && ticket.requestedDate &&
    ticket.originalRequestedDate.slice(0, 10) !== ticket.requestedDate.slice(0, 10);

  return (
    <div className="stack">
      <div className="detail-header">
        <div className="detail-title-row">
          <h3 className="detail-number">{ticket.ticketNumber ?? 'Unsubmitted draft'}</h3>
          <StatusBadge status={ticket.status} viewerIsRequester={ticket.isOwnRequest !== false} />
        </div>
        <div className="detail-subtitle">
          <span className="meta-item"><Icon name="pin" size={16} />{areaPath ?? 'Area not selected'}</span>
          <span className="meta-item"><Icon name="file" size={16} />{ticketTypeLabel(ticket.ticketType)}</span>
          {ticket.priority === 'HIGH' || ticket.priority === 'MED_HIGH'
            ? <span className="chip chip-flag"><Icon name="flag" size={13} />{priorityLabel(ticket.priority)} priority</span>
            : null}
        </div>
      </div>

      {ticket.rejectionReason ? (
        <p className="detail-callout"><strong>Rejection reason</strong>{ticket.rejectionReason}</p>
      ) : null}
      {ticket.pendingPcOutcome ? (
        <p className="detail-callout">
          <strong>Pending field outcome: {humanizeCode(ticket.pendingPcOutcome)}</strong>
          {ticket.pendingPcReason ?? 'No reason recorded.'}
        </p>
      ) : null}

      <p className="detail-description">{ticket.description || 'No request details yet.'}</p>

      <dl className="detail-grid">
        <div>
          <dt>Need-By</dt>
          <dd className={overdue ? 'meta-overdue' : undefined}>
            {formatCalendarDate(ticket.requestedDate)}{overdue ? ' · Overdue' : ''}
          </dd>
        </div>
        {revisedNeedBy ? (
          <div><dt>Originally requested</dt><dd>{formatCalendarDate(ticket.originalRequestedDate)}</dd></div>
        ) : null}
        <div><dt>Priority</dt><dd>{priorityLabel(ticket.priority)}</dd></div>
        <div><dt>Requested by</dt><dd>{requester}</dd></div>
        <div><dt>Point of contact</dt><dd>{ticket.fieldContact || 'Not provided'}</dd></div>
        <div><dt>Phone / radio channel</dt><dd>{ticket.fieldChannel || 'Not provided'}</dd></div>
        <div><dt>Craft / discipline</dt><dd>{ticket.craft || 'Not specified'}</dd></div>
        {ticket.returnCycle > 0 ? <div><dt>Correction cycles</dt><dd>{ticket.returnCycle}</dd></div> : null}
      </dl>

      {ticket.parentTicketId ? (
        <p className="muted">
          Follow-up to{' '}
          <Link className="text-link" href={`/projects/${ticket.projectId}/tickets/${ticket.parentTicketId}`}>
            the completed parent SWR
          </Link>
        </p>
      ) : null}
    </div>
  );
}
