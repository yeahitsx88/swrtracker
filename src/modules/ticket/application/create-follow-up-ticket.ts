import { ConflictError, ForbiddenError, NotFoundError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import type { ProjectRole } from '@/modules/identity/domain/types';
import type { Ticket } from '../domain/types';
import type { ITicketRepository, VisibilityScope } from './ports';
import { createTicket } from './create-ticket';

const DAY_MS = 24 * 60 * 60 * 1000;

export async function createFollowUpTicket(
  repo: ITicketRepository,
  db: DbClient,
  params: {
    tenantId: UUID;
    parentTicketId: UUID;
    actorId: UUID;
    actorRole: ProjectRole;
    visibility?: VisibilityScope;
    now?: Date;
  },
): Promise<Ticket> {
  if (params.actorRole !== 'REQUESTER') {
    throw new ForbiddenError('Only REQUESTER may create a follow-up SWR');
  }

  const parent = params.visibility
    ? await repo.findById(db, params.tenantId, params.parentTicketId, params.visibility)
    : await repo.findByIdInternal(db, params.tenantId, params.parentTicketId);
  if (!parent) throw new NotFoundError(`Ticket ${params.parentTicketId} not found`);

  if (parent.requesterId !== params.actorId) {
    throw new ForbiddenError('You can only create a follow-up from your own completed SWR');
  }
  if (parent.status !== 'COMPLETED') {
    throw new ConflictError('A follow-up may only be created from a completed SWR');
  }

  const leadTime = repo.findProjectLeadTimeConfig
    ? await repo.findProjectLeadTimeConfig(db, params.tenantId, parent.projectId)
    : null;
  const now = params.now ?? new Date();
  // Add one day beyond the configured minimum so a freshly-created draft does
  // not become urgent simply because the requester takes time to review it.
  const requestedDate = new Date(
    now.getTime() + (Math.max(leadTime?.leadTimeDays ?? 2, 0) + 1) * DAY_MS,
  );

  return createTicket(repo, db, {
    tenantId: parent.tenantId,
    projectId: parent.projectId,
    aorNodeId: parent.aorNodeId,
    departmentId: parent.departmentId,
    companyId: parent.companyId,
    requesterId: params.actorId,
    ticketType: parent.ticketType,
    workflowVariant: 'STANDARD_APPROVAL',
    craft: parent.craft,
    fieldContact: parent.fieldContact,
    fieldChannel: parent.fieldChannel,
    description: parent.description,
    requestedDate,
    parentTicketId: parent.id,
  });
}
