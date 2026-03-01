import { randomUUID } from 'crypto';
import type { DbClient, UUID } from '@/shared/types';
import type { TenantRole } from '@/modules/identity/domain/types';
import type { Company, CompanyType } from '../domain/types';
import type { ITenancyRepository } from './ports';
import { assertTenantAdmin } from './shared';

export interface CreateCompanyParams {
  tenantId: UUID;
  name: string;
  type: CompanyType;
  actorRole: TenantRole | null;
}

export async function createCompany(
  repo: ITenancyRepository,
  db: DbClient,
  params: CreateCompanyParams,
): Promise<Company> {
  assertTenantAdmin(params.actorRole);

  const company: Company = {
    id:        randomUUID() as UUID,
    tenantId:  params.tenantId,
    name:      params.name,
    type:      params.type,
    createdAt: new Date(),
  };
  await repo.saveCompany(db, company);
  return company;
}
