import { ForbiddenError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import type { ProjectRole } from '@/modules/identity/domain/types';

export interface LinkedCrewArea { partyChiefId: UUID; areaId: UUID }
export interface SuperintendentCrewRepository {
  linkedCrewAreas(db: DbClient, tenantId: UUID, projectId: UUID, superintendentId: UUID, authorizedAreaIds: UUID[]): Promise<LinkedCrewArea[]>;
}

/** Server-resolved reporting scope. Organizational team membership is not authority. */
export async function readSuperintendentCrews(repo: SuperintendentCrewRepository, db: DbClient, params: {
  tenantId: UUID; projectId: UUID; actorId: UUID; actorRole: ProjectRole; authorizedAreaIds: UUID[];
}) {
  if (params.actorRole !== 'SURVEY_SUPERINTENDENT') throw new ForbiddenError('Linked-crew workload is a Superintendent view');
  if (!params.authorizedAreaIds.length) return [];
  return repo.linkedCrewAreas(db, params.tenantId, params.projectId, params.actorId, params.authorizedAreaIds);
}
