import { ConflictError, NotFoundError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import type { ProjectRole, TenantRole } from '@/modules/identity/domain/types';
import { evaluateProjectReadiness, type ProjectReadiness } from '../domain/project-readiness';
import type { ITenancyRepository } from './ports';
import { assertProjectConfigAdmin } from './shared';

export interface ActivationContext {
  tenantId: UUID;
  projectId: UUID;
  actorId: UUID;
  actorRole: ProjectRole | TenantRole;
}

export async function inspectProjectReadiness(
  repo: ITenancyRepository, db: DbClient, params: ActivationContext,
): Promise<ProjectReadiness> {
  assertProjectConfigAdmin(params.actorRole);
  const project = await repo.findProjectById(db, params.tenantId, params.projectId);
  if (!project) throw new NotFoundError('Project not found');
  const facts = await repo.getProjectReadinessFacts(db, params.tenantId, params.projectId);
  return evaluateProjectReadiness(facts);
}

export async function activateProject(
  repo: ITenancyRepository,
  db: DbClient,
  params: ActivationContext & { acknowledgeWarnings: boolean },
): Promise<ProjectReadiness> {
  assertProjectConfigAdmin(params.actorRole);
  const project = await repo.findProjectById(db, params.tenantId, params.projectId);
  if (!project) throw new NotFoundError('Project not found');
  if (project.status !== 'SETUP') throw new ConflictError('Only SETUP projects may be activated');
  const facts = await repo.getProjectReadinessFacts(db, params.tenantId, params.projectId);
  const readiness = evaluateProjectReadiness(facts);
  if (readiness.hardFailures.length > 0) {
    throw new ConflictError(`Activation blocked: ${readiness.hardFailures.join('; ')}`);
  }
  if (readiness.warnings.length > 0 && !params.acknowledgeWarnings) {
    throw new ConflictError(`Acknowledge readiness warnings: ${readiness.warnings.join('; ')}`);
  }
  if (!(await repo.activateProject(db, params.tenantId, params.projectId, params.actorId))) {
    throw new ConflictError('Project activation conflicted with another update');
  }
  await repo.appendTenantEvent(db, params.tenantId, params.actorId,
    'project.activated', { projectId: params.projectId,
      readinessCheckResults: { warningsAcknowledged: readiness.warnings } });
  return readiness;
}
