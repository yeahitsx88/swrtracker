import { randomUUID } from 'crypto';
import type { DbClient, UUID } from '@/shared/types';
import type { Company, CompanyType } from '../domain/types';
import type { ITenancyRepository } from './ports';

export interface CreateCompanyParams {
  tenantId: UUID;
  name: string;
  type: CompanyType;
}

export async function createCompany(
  repo: ITenancyRepository,
  db: DbClient,
  params: CreateCompanyParams,
): Promise<Company> {
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
