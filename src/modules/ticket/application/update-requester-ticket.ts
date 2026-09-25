import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/shared/errors';
import { appendAuditEvent } from '@/modules/audit/application';
import type { ProjectRole } from '@/modules/identity/domain/types';
import type { DbClient, UUID } from '@/shared/types';
import type { Ticket, TicketType } from '../domain/types';
import type { ITicketRepository, VisibilityScope } from './ports';

const TICKET_TYPES: readonly TicketType[] = ['LAYOUT', 'CHECK_OUT', 'AS_BUILT', 'TOPO', 'PERMIT'];

export interface RequesterTicketChanges {
  aorNodeId?: UUID;
  ticketType?: TicketType;
  craft?: string;
  fieldContact?: string;
  fieldChannel?: string;
  description?: string;
  requestedDate?: Date;
}

export async function updateRequesterTicket(
  repo: ITicketRepository,
  db: DbClient,
  params: {
    tenantId: UUID;
    ticketId: UUID;
    actorId: UUID;
    actorRole: ProjectRole;
    changes: RequesterTicketChanges;
    visibility?: VisibilityScope;
  },
): Promise<Ticket> {
  if (params.actorRole !== 'REQUESTER') throw new ForbiddenError('Only the requester may edit an SWR');
  const ticket = params.visibility
    ? await repo.findById(db, params.tenantId, params.ticketId, params.visibility)
    : await repo.findByIdInternal(db, params.tenantId, params.ticketId);
  if (!ticket) throw new NotFoundError(`Ticket ${params.ticketId} not found`);
  if (ticket.requesterId !== params.actorId) throw new ForbiddenError('You may only edit your own SWR');
  if (ticket.status !== 'DRAFT' && ticket.status !== 'RETURNED_FOR_CORRECTION') {
    throw new ConflictError('Requester edits are allowed only while draft or returned for correction');
  }

  const entries = Object.entries(params.changes).filter(([, value]) => value !== undefined);
  if (entries.length === 0) throw new ValidationError('At least one editable field is required');
  if (params.changes.ticketType && !TICKET_TYPES.includes(params.changes.ticketType)) {
    throw new ValidationError('ticketType is invalid');
  }
  for (const [name, value] of [
    ['fieldContact', params.changes.fieldContact],
    ['description', params.changes.description],
  ] as const) {
    if (value !== undefined && !value.trim()) throw new ValidationError(`${name} cannot be blank`);
  }
  if (params.changes.requestedDate && Number.isNaN(params.changes.requestedDate.getTime())) {
    throw new ValidationError('requestedDate is invalid');
  }
  if (params.changes.aorNodeId) {
    const { rows } = await db.query<{ valid: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM aor_nodes
         WHERE tenant_id = $1 AND project_id = $2 AND id = $3 AND retired_at IS NULL
       ) AS valid`,
      [params.tenantId, ticket.projectId, params.changes.aorNodeId],
    );
    if (rows[0]?.valid !== true) throw new ValidationError('aorNodeId must be active in this project');
  }

  const columnByField: Record<keyof RequesterTicketChanges, string> = {
    aorNodeId: 'aor_node_id',
    ticketType: 'ticket_type',
    craft: 'craft',
    fieldContact: 'field_contact',
    fieldChannel: 'field_channel',
    description: 'description',
    requestedDate: 'requested_date',
  };
  const values: unknown[] = [params.ticketId, params.tenantId, params.actorId, ticket.status, ticket.rowVersion ?? 0];
  const sets = entries.map(([field, value], index) => {
    values.push(typeof value === 'string' ? value.trim() : value);
    return `${columnByField[field as keyof RequesterTicketChanges]} = $${index + 6}`;
  });
  const { rows: updated } = await db.query<{ id: string }>(
    `UPDATE tickets
     SET ${sets.join(', ')}, updated_at = NOW(), row_version = row_version + 1
     WHERE id = $1 AND tenant_id = $2 AND requester_id = $3
       AND status = $4 AND row_version = $5
     RETURNING id`,
    values,
  );
  if (!updated[0]) throw new ConflictError('SWR changed since it was loaded', 'WORKFLOW_STALE_STATE');
  await appendAuditEvent(db, {
    tenantId: params.tenantId,
    ticketId: params.ticketId,
    actorId: params.actorId,
    eventType: 'ticket.requester_fields_updated',
    payload: { fields: entries.map(([field]) => field), returnCycle: ticket.returnCycle ?? 0 },
  });

  return {
    ...ticket,
    ...params.changes,
    craft: params.changes.craft?.trim() ?? ticket.craft,
    fieldContact: params.changes.fieldContact?.trim() ?? ticket.fieldContact,
    fieldChannel: params.changes.fieldChannel?.trim() ?? ticket.fieldChannel,
    description: params.changes.description?.trim() ?? ticket.description,
    rowVersion: (ticket.rowVersion ?? 0) + 1,
    updatedAt: new Date(),
  };
}
