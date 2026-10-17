import { randomUUID } from 'crypto';
import { ForbiddenError, NotFoundError, ValidationError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import type { TenantRole } from '@/modules/identity/domain/types';
import type { CrewBuild, Project } from '../domain/types';
import type { ITenancyRepository } from './ports';

export interface CreateProjectParams {
  tenantId: UUID;
  name: string;
  actorRole: TenantRole | null;
  crewBuild?: CrewBuild;
  templateId?: UUID | null;
}

export async function createProject(
  repo: ITenancyRepository,
  db: DbClient,
  params: CreateProjectParams,
): Promise<Project> {
  if (params.actorRole !== 'TENANT_ADMIN') {
    throw new ForbiddenError('Only TENANT_ADMIN can create projects');
  }

  const name = params.name.trim();
  if (!name) {
    throw new ValidationError('name is required');
  }

  let resolvedCrewBuild = params.crewBuild;
  let resolvedTemplateId = params.templateId ?? null;

  if (resolvedTemplateId) {
    const template = await repo.findProjectTemplateById(db, params.tenantId, resolvedTemplateId);
    if (!template) {
      throw new NotFoundError('Project template not found');
    }

    if (resolvedCrewBuild && resolvedCrewBuild !== template.crewBuild) {
      throw new ValidationError('crewBuild must match the selected template');
    }

    resolvedCrewBuild = template.crewBuild;
  }

  if (!resolvedCrewBuild) {
    throw new ValidationError('crewBuild is required when templateId is not provided');
  }

  const project: Project = {
    id:        randomUUID() as UUID,
    tenantId:  params.tenantId,
    name,
    status:    'SETUP',
    crewBuild: resolvedCrewBuild,
    templateId: resolvedTemplateId,
    createdAt: new Date(),
  };
  await repo.saveProject(db, project);
  return project;
}
