import { randomUUID } from 'crypto';
import { ForbiddenError, NotFoundError, ValidationError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import type { AorNode } from '../domain/types';
import type { ITenancyRepository } from './ports';

type SetupActorRole = 'PROJECT_ADMIN' | 'TENANT_ADMIN';

export interface CreateAorNodeParams {
  tenantId: UUID;
  projectId: UUID;
  levelId: UUID;
  parentId?: UUID | null;
  name: string;
  code: string;
  actorRole: SetupActorRole;
}

export async function createAorNode(
  repo: ITenancyRepository,
  db: DbClient,
  params: CreateAorNodeParams,
): Promise<AorNode> {
  if (params.actorRole !== 'PROJECT_ADMIN' && params.actorRole !== 'TENANT_ADMIN') {
    throw new ForbiddenError('Only PROJECT_ADMIN or TENANT_ADMIN may create AOR nodes');
  }

  const name = params.name.trim();
  const code = params.code.trim().toUpperCase();
  if (!name) throw new ValidationError('name is required');
  if (!code) throw new ValidationError('code is required');

  const project = await repo.findProjectById(db, params.tenantId, params.projectId);
  if (!project) throw new NotFoundError('Project not found');

  const level = await repo.findAorLevelById(db, params.tenantId, params.levelId);
  if (!level || level.projectId !== params.projectId) {
    throw new NotFoundError('AOR level not found');
  }

  let parentId: UUID | null = params.parentId ?? null;
  if (level.depth === 0) {
    parentId = null;
  } else {
    if (!parentId) {
      throw new ValidationError('parentId is required for non-root AOR nodes');
    }

    const parent = await repo.findAorNodeById(db, params.tenantId, parentId);
    if (!parent || parent.projectId !== params.projectId) {
      throw new NotFoundError('Parent AOR node not found');
    }

    const parentLevel = await repo.findAorLevelById(db, params.tenantId, parent.levelId);
    if (!parentLevel) {
      throw new NotFoundError('Parent AOR level not found');
    }

    if (parentLevel.depth !== level.depth - 1) {
      throw new ValidationError('parentId must point to a node one level above this node');
    }
  }

  const node: AorNode = {
    id:        randomUUID() as UUID,
    projectId: params.projectId,
    tenantId:  params.tenantId,
    levelId:   params.levelId,
    parentId,
    name,
    code,
    createdAt: new Date(),
  };
  await repo.saveAorNode(db, node);
  return node;
}
