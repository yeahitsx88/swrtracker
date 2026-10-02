import { NotFoundError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import type { ITenancyRepository } from './ports';

/** Caller holds the tenant authority transaction; never restores retained membership metadata. */
export async function assertActiveProjectSubject(
  repo: ITenancyRepository, db: DbClient,
  scope: { tenantId: UUID; projectId: UUID; userId: UUID },
): Promise<void> {
  if (!await repo.isActiveProjectMember(db, scope.tenantId, scope.projectId, scope.userId)) {
    throw new NotFoundError('Active project member not found');
  }
}
