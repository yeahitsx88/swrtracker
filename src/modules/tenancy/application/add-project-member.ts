import { randomUUID } from 'crypto';
import type { DbClient, UUID } from '@/shared/types';
import type { ProjectRole, TenantRole } from '@/modules/identity/domain/types';
import type { ITenancyRepository } from './ports';
import { assertTenantAdmin } from './shared';

export interface AddProjectMemberParams {
  tenantId:   UUID;
  projectId:  UUID;
  userId:     UUID;
  role:       ProjectRole;
  actorRole:  TenantRole | null;
}

export async function addProjectMember(
  repo: ITenancyRepository,
  db: DbClient,
  params: AddProjectMemberParams,
): Promise<void> {
  assertTenantAdmin(params.actorRole);

  await repo.saveMembership(db, {
    id:        randomUUID() as UUID,
    projectId: params.projectId,
    userId:    params.userId,
    role:      params.role,
    createdAt: new Date(),
  });
}
