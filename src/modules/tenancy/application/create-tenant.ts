import { randomUUID } from 'crypto';
import type { DbClient, UUID } from '@/shared/types';
import type { Tenant } from '../domain/types';
import type { ITenancyRepository } from './ports';

export interface CreateTenantParams {
  name: string;
}

export async function createTenant(
  repo: ITenancyRepository,
  db: DbClient,
  params: CreateTenantParams,
): Promise<Tenant> {
  const tenant: Tenant = {
    id:        randomUUID() as UUID,
    name:      params.name,
    createdAt: new Date(),
  };
  await repo.saveTenant(db, tenant);
  return tenant;
}
