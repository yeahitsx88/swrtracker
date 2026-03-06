import { randomUUID } from 'crypto';
import { ForbiddenError, ValidationError } from '@/shared/errors';
import type { TenantRole } from '@/modules/identity/domain/types';
import type { DbClient, UUID } from '@/shared/types';
import type { Company, CompanyType } from '../domain/types';
import type { ITenancyRepository } from './ports';

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
  if (params.actorRole !== 'TENANT_ADMIN') {
    throw new ForbiddenError('Only TENANT_ADMIN can create companies');
  }

  const name = params.name.trim();
  if (!name) {
    throw new ValidationError('name is required');
  }

  const company: Company = {
    id:        randomUUID() as UUID,
    tenantId:  params.tenantId,
    name,
    type:      params.type,
    createdAt: new Date(),
  };
  await repo.saveCompany(db, company);
  return company;
}
