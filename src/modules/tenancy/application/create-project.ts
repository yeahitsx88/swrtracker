import { randomUUID } from 'crypto';
import type { DbClient, UUID } from '@/shared/types';
import type { Project } from '../domain/types';
import type { CrewBuild } from '../domain/project-readiness';
import { ValidationError } from '@/shared/errors';
import type { TenantRole } from '@/modules/identity/domain/types';
import type { ITenancyRepository } from './ports';
import { assertTenantAdmin } from './shared';

export interface CreateProjectParams {
  tenantId: UUID;
  name: string;
  crewBuild: CrewBuild;
  actorRole: TenantRole;
}

export async function createProject(
  repo: ITenancyRepository,
  db: DbClient,
  params: CreateProjectParams,
): Promise<Project> {
  assertTenantAdmin(params.actorRole);
  if (!['FULL', 'MEDIUM', 'SLIM'].includes(params.crewBuild)) {
    throw new ValidationError('crewBuild must be FULL, MEDIUM, or SLIM');
  }
  const project: Project = {
    id:        randomUUID() as UUID,
    tenantId:  params.tenantId,
    name:      params.name,
    status:    'SETUP',
    crewBuild: params.crewBuild,
    templateId: null,
    activatedAt: null,
    activatedBy: null,
    archivedAt: null,
    archivedBy: null,
    createdAt: new Date(),
  };
  await repo.saveProject(db, project);
  return project;
}
