import { ForbiddenError, NotFoundError, ValidationError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import type { ProjectRole, TenantRole } from '@/modules/identity/domain/types';
import type { Project, ProjectRequestConfig } from '../domain/types';

const MIN_LEAD_TIME_DAYS = 1;
const MAX_LEAD_TIME_DAYS = 30;

interface ProjectRequestConfigRepository {
  findProjectById(db: DbClient, tenantId: UUID, projectId: UUID): Promise<Project | null>;
  findProjectRequestConfig(
    db: DbClient,
    tenantId: UUID,
    projectId: UUID,
  ): Promise<ProjectRequestConfig | null>;
  updateProjectRequestConfig(
    db: DbClient,
    tenantId: UUID,
    projectId: UUID,
    config: ProjectRequestConfig,
  ): Promise<void>;
}

function assertConfigAdmin(
  actorProjectRole: ProjectRole | null,
  actorTenantRole: TenantRole | null,
): void {
  if (actorTenantRole === 'TENANT_ADMIN') return;
  if (actorProjectRole === 'PROJECT_ADMIN') return;
  throw new ForbiddenError('Only PROJECT_ADMIN or TENANT_ADMIN may manage project request configuration');
}

function assertLeadTimeDays(leadTimeDays: number): void {
  if (!Number.isInteger(leadTimeDays)) {
    throw new ValidationError('leadTimeDays must be an integer');
  }
  if (leadTimeDays < MIN_LEAD_TIME_DAYS || leadTimeDays > MAX_LEAD_TIME_DAYS) {
    throw new ValidationError(`leadTimeDays must be between ${MIN_LEAD_TIME_DAYS} and ${MAX_LEAD_TIME_DAYS}`);
  }
}

export async function getProjectRequestConfig(
  repo: ProjectRequestConfigRepository,
  db: DbClient,
  params: {
    tenantId: UUID;
    projectId: UUID;
  },
): Promise<ProjectRequestConfig> {
  const project = await repo.findProjectById(db, params.tenantId, params.projectId);
  if (!project) {
    throw new NotFoundError('Project not found');
  }

  const config = await repo.findProjectRequestConfig(db, params.tenantId, params.projectId);
  if (!config) {
    return {
      leadTimeEnforcementEnabled: true,
      leadTimeDays: 2,
    };
  }
  return config;
}

export async function updateProjectRequestConfig(
  repo: ProjectRequestConfigRepository,
  db: DbClient,
  params: {
    tenantId: UUID;
    projectId: UUID;
    actorProjectRole: ProjectRole | null;
    actorTenantRole: TenantRole | null;
    leadTimeEnforcementEnabled: boolean;
    leadTimeDays: number;
  },
): Promise<ProjectRequestConfig> {
  assertConfigAdmin(params.actorProjectRole, params.actorTenantRole);
  assertLeadTimeDays(params.leadTimeDays);

  const project = await repo.findProjectById(db, params.tenantId, params.projectId);
  if (!project) {
    throw new NotFoundError('Project not found');
  }

  const config: ProjectRequestConfig = {
    leadTimeEnforcementEnabled: params.leadTimeEnforcementEnabled,
    leadTimeDays: params.leadTimeDays,
  };

  await repo.updateProjectRequestConfig(db, params.tenantId, params.projectId, config);
  return config;
}

