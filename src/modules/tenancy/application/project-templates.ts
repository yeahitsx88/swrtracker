import { randomUUID } from 'crypto';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import type { TenantRole } from '@/modules/identity/domain/types';
import type { CrewBuild, ProjectTemplate } from '../domain/types';
import type { ITenancyRepository } from './ports';

function assertTenantAdmin(actorRole: TenantRole | null): void {
  if (actorRole !== 'TENANT_ADMIN') {
    throw new ForbiddenError('Only TENANT_ADMIN can manage project templates');
  }
}

function validateTemplateFields(params: {
  name: string;
  crewBuild: CrewBuild;
  aorDepth: number;
  aorLevelLabels: string[];
  disciplineGroups: string[];
}): {
  name: string;
  crewBuild: CrewBuild;
  aorDepth: number;
  aorLevelLabels: string[];
  disciplineGroups: string[];
} {
  const name = params.name.trim();
  if (!name) throw new ValidationError('name is required');
  if (!Number.isInteger(params.aorDepth) || params.aorDepth < 0) {
    throw new ValidationError('aorDepth must be a non-negative integer');
  }
  if (params.aorLevelLabels.length !== params.aorDepth) {
    throw new ValidationError('aorLevelLabels length must match aorDepth');
  }

  const aorLevelLabels = params.aorLevelLabels.map((label) => label.trim()).filter(Boolean);
  if (aorLevelLabels.length !== params.aorDepth) {
    throw new ValidationError('aorLevelLabels must contain non-empty labels');
  }

  const disciplineGroups = params.disciplineGroups.map((group) => group.trim()).filter(Boolean);

  return {
    name,
    crewBuild: params.crewBuild,
    aorDepth: params.aorDepth,
    aorLevelLabels,
    disciplineGroups,
  };
}

export async function createProjectTemplate(
  repo: ITenancyRepository,
  db: DbClient,
  params: {
    tenantId: UUID;
    actorId: UUID;
    actorRole: TenantRole | null;
    name: string;
    crewBuild: CrewBuild;
    aorDepth: number;
    aorLevelLabels: string[];
    disciplineGroups: string[];
  },
): Promise<ProjectTemplate> {
  assertTenantAdmin(params.actorRole);
  const normalized = validateTemplateFields(params);

  const template: ProjectTemplate = {
    id: randomUUID() as UUID,
    tenantId: params.tenantId,
    name: normalized.name,
    crewBuild: normalized.crewBuild,
    aorDepth: normalized.aorDepth,
    aorLevelLabels: normalized.aorLevelLabels,
    disciplineGroups: normalized.disciplineGroups,
    createdBy: params.actorId,
    createdAt: new Date(),
  };
  await repo.saveProjectTemplate(db, template);
  return template;
}

export async function updateProjectTemplate(
  repo: ITenancyRepository,
  db: DbClient,
  params: {
    tenantId: UUID;
    templateId: UUID;
    actorRole: TenantRole | null;
    name: string;
    crewBuild: CrewBuild;
    aorDepth: number;
    aorLevelLabels: string[];
    disciplineGroups: string[];
  },
): Promise<ProjectTemplate> {
  assertTenantAdmin(params.actorRole);
  const existing = await repo.findProjectTemplateById(db, params.tenantId, params.templateId);
  if (!existing) throw new NotFoundError('Project template not found');
  const normalized = validateTemplateFields(params);

  const template: ProjectTemplate = {
    ...existing,
    name: normalized.name,
    crewBuild: normalized.crewBuild,
    aorDepth: normalized.aorDepth,
    aorLevelLabels: normalized.aorLevelLabels,
    disciplineGroups: normalized.disciplineGroups,
  };
  await repo.updateProjectTemplate(db, template);
  return template;
}

export async function deleteProjectTemplate(
  repo: ITenancyRepository,
  db: DbClient,
  params: {
    tenantId: UUID;
    templateId: UUID;
    actorRole: TenantRole | null;
  },
): Promise<void> {
  assertTenantAdmin(params.actorRole);
  const template = await repo.findProjectTemplateById(db, params.tenantId, params.templateId);
  if (!template) throw new NotFoundError('Project template not found');

  const referencingProjects = await repo.findProjectsUsingTemplate(db, params.tenantId, params.templateId);
  if (referencingProjects.length > 0) {
    throw new ConflictError(
      `Project template is in use by: ${referencingProjects.map((project) => project.name).join(', ')}`,
    );
  }

  await repo.deleteProjectTemplate(db, params.tenantId, params.templateId);
}
