import { randomUUID } from 'node:crypto';
import { ConflictError, NotFoundError, ValidationError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import type { ProjectRole, TenantRole } from '@/modules/identity/domain/types';
import type { AorNode } from '../domain/types';
import type { ITenancyRepository } from './ports';
import { assertProjectConfigAdmin } from './shared';

export async function createAorNode(
  repo: ITenancyRepository, db: DbClient,
  params: { tenantId: UUID; projectId: UUID; actorId: UUID;
    actorRole: ProjectRole | TenantRole; levelId: UUID; parentId: UUID | null;
    name: string; code: string },
): Promise<AorNode> {
  assertProjectConfigAdmin(params.actorRole);
  const project = await repo.findProjectById(db, params.tenantId, params.projectId);
  if (!project) throw new NotFoundError('Project not found');
  if (project.status === 'ARCHIVED') throw new ConflictError('Project is archived');
  const level = await repo.findAorLevel(db, params.tenantId, params.projectId, params.levelId);
  if (!level) throw new NotFoundError('AOR level not found in this project');
  if (level.depth === 0 && params.parentId !== null ||
      level.depth > 0 && params.parentId === null) {
    throw new ValidationError('AOR parent must match the level depth');
  }
  if (params.parentId) {
    const parent = await repo.findAorNodePlacement(
      db, params.tenantId, params.projectId, params.parentId,
    );
    if (!parent || parent.depth !== level.depth - 1) {
      throw new ValidationError('AOR parent must be an active node at the preceding level');
    }
  }
  const name = params.name.trim();
  const code = params.code.trim().toUpperCase();
  if (!name || name.length > 120 || !/^[A-Z0-9_-]{1,16}$/.test(code)) {
    throw new ValidationError('AOR name or code is invalid');
  }
  const node: AorNode = {
    id: randomUUID() as UUID, tenantId: params.tenantId, projectId: params.projectId,
    levelId: params.levelId, parentId: params.parentId, name, code,
    retiredAt: null, createdAt: new Date(),
  };
  await repo.saveAorNode(db, node);
  await repo.appendTenantEvent(db, params.tenantId, params.actorId,
    'aor.node_created', { projectId: params.projectId, nodeId: node.id,
      levelId: node.levelId, parentId: node.parentId, code });
  return node;
}
