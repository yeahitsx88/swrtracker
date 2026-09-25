import type { DbClient, UUID } from '@/shared/types';
import { ConflictError } from '@/shared/errors';
import { assertValidTransition } from '@/modules/workflow/domain/transitions';
import type { Ticket } from '../domain/types';
import type { ITicketRepository, VisibilityScope } from './ports';

export interface RequesterActions { canCancel: boolean; canResubmit: boolean }

export async function canCreateRequest(repo: ITicketRepository, db: DbClient,
  tenantId: UUID, projectId: UUID, actor: VisibilityScope): Promise<boolean> {
  return repo.isDraftOwnerAllowed(db, tenantId, projectId, actor.actorId, actor.companyId);
}

/** Called after ticket visibility is established. Commands recheck their own authorization. */
export async function getRequesterActions(repo: ITicketRepository, db: DbClient,
  ticket: Ticket, actor: VisibilityScope): Promise<RequesterActions> {
  const unavailable = { canCancel: false, canResubmit: false };
  if (ticket.requesterId !== actor.actorId || ticket.draftDeletedAt ||
      actor.actorRole === 'TENANT_ADMIN' || actor.actorRole === 'BILLING_VIEWER' ||
      (actor.companyType === 'SUBCONTRACTOR' && actor.companyId !== ticket.companyId)) return unavailable;
  if (!(await repo.findActiveProjectCrewBuild(db, ticket.tenantId, ticket.projectId))) return unavailable;
  let canCancel = true;
  try { assertValidTransition(ticket.workflowVariant, ticket.status, 'REQUESTER_CANCELED'); }
  catch (error) {
    if (!(error instanceof ConflictError)) throw error;
    canCancel = false;
  }
  const canResubmit = ticket.status === 'REJECTED' && await repo.isDraftOwnerAllowed(
    db, ticket.tenantId, ticket.projectId, actor.actorId, actor.companyId);
  return { canCancel, canResubmit };
}
