import { NotFoundError, ValidationError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import type { TenantRole } from '@/modules/identity/domain/types';
import type { ITenancyRepository } from './ports';
import { assertTenantAdmin } from './shared';

export async function assignCompanyDomain(
  repo: ITenancyRepository,
  db: DbClient,
  params: {
    tenantId: UUID; companyId: UUID; actorId: UUID;
    actorRole: TenantRole; domain: string;
  },
): Promise<string> {
  assertTenantAdmin(params.actorRole);
  const domain = params.domain.trim().toLowerCase();
  if (domain.length > 253 || !/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(domain)) {
    throw new ValidationError('A valid company email domain is required');
  }
  if (!(await repo.assignCompanyDomain(
    db, params.tenantId, params.companyId, domain, params.actorId,
  ))) {
    throw new NotFoundError('Company not found in this tenant');
  }
  await repo.appendTenantEvent(db, params.tenantId, params.actorId,
    'domain.added', { companyId: params.companyId, domain });
  return domain;
}
