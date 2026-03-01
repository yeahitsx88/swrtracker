import { randomUUID } from 'crypto';
import { NotFoundError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import type { TenantRole } from '@/modules/identity/domain/types';
import type { Area } from '../domain/types';
import type { ITenancyRepository } from './ports';
import { assertTenantAdmin } from './shared';

export interface CreateAreaParams {
  tenantId:  UUID;
  projectId: UUID;
  name:      string;
  /** Short slug used in ticket numbers, e.g. "U1", "CT", "PR". Must be unique per project. */
  code:      string;
  actorRole: TenantRole | null;
}

export async function createArea(
  repo: ITenancyRepository,
  db: DbClient,
  params: CreateAreaParams,
): Promise<Area> {
  assertTenantAdmin(params.actorRole);

  const project = await repo.findProjectById(db, params.tenantId, params.projectId);
  if (!project) throw new NotFoundError('Project not found');

  const area: Area = {
    id:        randomUUID() as UUID,
    projectId: params.projectId,
    tenantId:  params.tenantId,
    name:      params.name,
    code:      params.code.toUpperCase(),
    createdAt: new Date(),
  };
  await repo.saveArea(db, area);
  return area;
}
