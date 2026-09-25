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
import type { ProjectRole, TenantRole } from '@/modules/identity/domain/types';
import type { VisibilityScope } from '@/modules/ticket/application/ports';
import { TicketRepository } from '@/modules/ticket/infrastructure/ticket.repository';
import { ForbiddenError } from '@/shared/errors';

const repo = new TicketRepository();

/**
 * Builds the VisibilityScope for the actor.
 *
 * @param db       - pg pool or client (outside a transaction is fine for reads)
 * @param tenantId - tenant scoping
 * @param projectId - the project in question (used for AREA_VIEWER and INSTRUMENT_MAN lookups)
 * @param actorId  - authenticated user
 * @param actorRole - resolved project role for actorId
 */
export async function resolveVisibility(
  db: DbClient,
  tenantId: UUID,
  projectId: UUID,
  actorId: UUID,
  actorRole: ProjectRole | TenantRole,
): Promise<VisibilityScope> {
  const companyInfo = await repo.findUserCompanyInfo(db, tenantId, actorId);
  if (!companyInfo) throw new ForbiddenError('User company is not valid for this tenant');

  const scope: VisibilityScope = {
    actorId, actorRole,
    companyId: companyInfo.companyId,
    companyType: companyInfo.companyType,
  };

  if (actorRole === 'INSTRUMENT_MAN') {
    const partyChiefId = await repo.findPartyChiefForInstrumentMan(
      db, tenantId, projectId, actorId,
    );
    scope.partyChiefId = partyChiefId ?? undefined;
  }

  if (actorRole === 'AREA_VIEWER' || actorRole === 'SURVEY_SUPERINTENDENT' ||
      actorRole === 'DEPARTMENT_LEAD') {
    scope.aorNodeIds = await repo.findAorNodeIdsForUser(
      db, tenantId, projectId, actorId,
    );
  }

  return scope;
}
