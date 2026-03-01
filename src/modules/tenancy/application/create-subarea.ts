import { randomUUID } from 'crypto';
import { NotFoundError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import type { TenantRole } from '@/modules/identity/domain/types';
import type { Subarea } from '../domain/types';
import type { ITenancyRepository } from './ports';
import { assertTenantAdmin } from './shared';

export interface CreateSubareaParams {
  tenantId:  UUID;
  projectId: UUID;
  areaId:    UUID;
  name:      string;
  actorRole: TenantRole | null;
}

export async function createSubarea(
  repo: ITenancyRepository,
  db: DbClient,
  params: CreateSubareaParams,
): Promise<Subarea> {
  assertTenantAdmin(params.actorRole);

  const area = await repo.findAreaById(db, params.tenantId, params.areaId);
  if (!area) throw new NotFoundError('Area not found');
  if (area.projectId !== params.projectId) throw new NotFoundError('Area not found in this project');

  const subarea: Subarea = {
    id:        randomUUID() as UUID,
    areaId:    params.areaId,
    projectId: params.projectId,
    tenantId:  params.tenantId,
    name:      params.name,
    createdAt: new Date(),
  };
  await repo.saveSubarea(db, subarea);
  return subarea;
}
