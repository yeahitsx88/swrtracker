import { randomUUID } from 'node:crypto';
import { ConflictError, NotFoundError, ValidationError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import type { ProjectRole, TenantRole } from '@/modules/identity/domain/types';
import type { AorLevel } from '../domain/types';
import type { ITenancyRepository } from './ports';
import { assertProjectConfigAdmin } from './shared';

export async function createAorLevel(
  repo: ITenancyRepository, db: DbClient,
  params: { tenantId: UUID; projectId: UUID; actorId: UUID;
    actorRole: ProjectRole | TenantRole; depth: number; label: string },
): Promise<AorLevel> {
  assertProjectConfigAdmin(params.actorRole);
  const project = await repo.findProjectById(db, params.tenantId, params.projectId);
  if (!project) throw new NotFoundError('Project not found');
  if (project.status === 'ARCHIVED') throw new ConflictError('Project is archived');
  const label = params.label.trim();
  if (!Number.isSafeInteger(params.depth) || params.depth < 0 || params.depth > 10 ||
      !label || label.length > 80) {
    throw new ValidationError('AOR depth must be 0-10 and label 1-80 characters');
  }
  const level: AorLevel = {
    id: randomUUID() as UUID, tenantId: params.tenantId, projectId: params.projectId,
    depth: params.depth, label, createdAt: new Date(),
  };
  await repo.saveAorLevel(db, level);
  await repo.appendTenantEvent(db, params.tenantId, params.actorId,
    'aor.level_created', { projectId: params.projectId, levelId: level.id,
      depth: level.depth, label });
  return level;
}
