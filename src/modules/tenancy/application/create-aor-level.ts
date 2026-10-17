import { randomUUID } from 'crypto';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import type { AorLevel } from '../domain/types';
import type { ITenancyRepository } from './ports';

type SetupActorRole = 'PROJECT_ADMIN' | 'TENANT_ADMIN';

export interface CreateAorLevelParams {
  tenantId: UUID;
  projectId: UUID;
  depth: number;
  label: string;
  actorRole: SetupActorRole;
}

export async function createAorLevel(
  repo: ITenancyRepository,
  db: DbClient,
  params: CreateAorLevelParams,
): Promise<AorLevel> {
  if (params.actorRole !== 'PROJECT_ADMIN' && params.actorRole !== 'TENANT_ADMIN') {
    throw new ForbiddenError('Only PROJECT_ADMIN or TENANT_ADMIN may create AOR levels');
  }

  if (!Number.isInteger(params.depth) || params.depth < 0) {
    throw new ValidationError('depth must be a non-negative integer');
  }

  const label = params.label.trim();
  if (!label) {
    throw new ValidationError('label is required');
  }

  const project = await repo.findProjectById(db, params.tenantId, params.projectId);
  if (!project) throw new NotFoundError('Project not found');

  const existing = await repo.findAorLevelByDepth(db, params.tenantId, params.projectId, params.depth);
  if (existing) {
    throw new ConflictError(`AOR level depth ${params.depth} already exists for this project`);
  }

  const level: AorLevel = {
    id:        randomUUID() as UUID,
    projectId: params.projectId,
    tenantId:  params.tenantId,
    depth:     params.depth,
    label,
    createdAt: new Date(),
  };
  await repo.saveAorLevel(db, level);
  return level;
}
