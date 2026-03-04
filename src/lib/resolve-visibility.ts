/**
 * Resolves the VisibilityScope for a given actor on a project.
 *
 * Called by ticket route handlers before any repository query. Encapsulates
 * the logic of determining what tickets an actor may see, per CLAUDE.md §7A.
 *
 * This is infrastructure-touching glue code and lives in lib/ (not a module),
 * because it must coordinate across Identity, Ticket, and Tenancy modules.
 */
import type { DbClient, UUID } from '@/shared/types';
import type { ProjectRole } from '@/modules/identity/domain/types';
import type { VisibilityScope } from '@/modules/ticket/application/ports';
import { TicketRepository } from '@/modules/ticket/infrastructure/ticket.repository';

const repo = new TicketRepository();

/**
 * Builds the VisibilityScope for the actor.
 *
 * @param db       - pg pool or client (outside a transaction is fine for reads)
 * @param tenantId - tenant scoping
 * @param projectId - the project in question (used for AOR-scoped and INSTRUMENT_MAN lookups)
 * @param actorId  - authenticated user
 * @param actorRole - resolved project role for actorId
 */
export async function resolveVisibility(
  db: DbClient,
  tenantId: UUID,
  projectId: UUID,
  actorId: UUID,
  actorRole: ProjectRole,
): Promise<VisibilityScope> {
  const companyInfo = await repo.findUserCompanyInfo(db, tenantId, actorId);
  const companyId = (companyInfo?.companyId ?? '') as UUID;

  const scope: VisibilityScope = {
    actorId,
    actorRole,
    companyId,
    companyType: companyInfo?.companyType,
  };

  if (actorRole === 'INSTRUMENT_MAN') {
    const partyChiefId = await repo.findPartyChiefForInstrumentMan(
      db, tenantId, projectId, actorId,
    );
    scope.partyChiefId = partyChiefId ?? undefined;
  }

  if (actorRole === 'DEPARTMENT_MANAGER' || actorRole === 'DEPARTMENT_LEAD') {
    const membership = await repo.findRequesterDepartmentMembership(
      db,
      tenantId,
      projectId,
      actorId,
    );
    scope.departmentId = membership?.departmentId;
  }

  if (actorRole === 'AREA_VIEWER' || actorRole === 'SURVEY_SUPERINTENDENT') {
    const aorNodeIds = await repo.findAorNodeIdsForUser(db, projectId, actorId);
    scope.aorNodeIds = aorNodeIds;
  }

  if (actorRole === 'DEPARTMENT_LEAD') {
    const aorNodeIds = await repo.findAorNodeIdsForUser(db, projectId, actorId);
    scope.aorNodeIds = aorNodeIds;
  }

  return scope;
}
