import { ForbiddenError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';

export interface SelfRegistrationAccessPort {
  lockActiveProject(db: DbClient, tenantId: UUID, projectId: UUID): Promise<boolean>;
  lockDomainCompanies(db: DbClient, tenantId: UUID, domain: string): Promise<UUID[]>;
  enrollRequester(db: DbClient, params: {
    tenantId: UUID; projectId: UUID; companyId: UUID; userId: UUID;
  }): Promise<void>;
}

/** Hold the authorization rows until account, membership and audit commit together. */
export async function authorizeSelfRegistration(repo: SelfRegistrationAccessPort, db: DbClient,
  params: { tenantId: UUID; projectId: UUID; domain: string; companyId?: UUID }): Promise<UUID> {
  if (!(await repo.lockActiveProject(db, params.tenantId, params.projectId))) {
    throw new ForbiddenError('This project is not available for self-registration. Contact your administrator.');
  }
  const companies = await repo.lockDomainCompanies(db, params.tenantId, params.domain);
  if (companies.length !== 1 || (params.companyId && params.companyId !== companies[0])) {
    throw new ForbiddenError('Your email domain is not authorised for self-registration. Contact your administrator for an invite.');
  }
  return companies[0]!;
}

export async function enrollSelfRegisteredRequester(repo: SelfRegistrationAccessPort, db: DbClient,
  params: { tenantId: UUID; projectId: UUID; companyId: UUID; userId: UUID }): Promise<void> {
  await repo.enrollRequester(db, params);
}
