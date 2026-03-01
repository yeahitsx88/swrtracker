import { randomUUID } from 'crypto';
import type { DbClient, UUID } from '@/shared/types';
import type { TenantRole } from '@/modules/identity/domain/types';
import type { Project } from '../domain/types';
import type { ITenancyRepository } from './ports';
import { assertTenantAdmin } from './shared';

export interface CreateProjectParams {
  tenantId: UUID;
  name: string;
  actorRole: TenantRole | null;
}

export async function createProject(
  repo: ITenancyRepository,
  db: DbClient,
  params: CreateProjectParams,
): Promise<Project> {
  assertTenantAdmin(params.actorRole);

  const project: Project = {
    id:        randomUUID() as UUID,
    tenantId:  params.tenantId,
    name:      params.name,
    status:    'ACTIVE',
    createdAt: new Date(),
  };
  await repo.saveProject(db, project);
  return project;
}
