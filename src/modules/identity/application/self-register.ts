import { appendRegistrationAuditEvent } from '@/modules/audit/application';
import { authorizeSelfRegistration, enrollSelfRegisteredRequester,
  type SelfRegistrationAccessPort } from '@/modules/tenancy/application/self-registration';
import type { DbClient, UUID } from '@/shared/types';
import type { IUserRepository } from './ports';
import { createUser } from './create-user';

/** Caller provides validated input and one transaction for all three writes. */
export async function selfRegister(users: IUserRepository, access: SelfRegistrationAccessPort,
  db: DbClient, params: {
    tenantId: UUID; projectId: UUID; companyId?: UUID; email: string; password: string; name: string;
  }) {
  const domain = params.email.split('@')[1]!;
  const companyId = await authorizeSelfRegistration(access, db, { ...params, domain });
  const user = await createUser(users, db, { ...params, companyId });
  await enrollSelfRegisteredRequester(access, db, {
    tenantId: params.tenantId, projectId: params.projectId, companyId, userId: user.id,
  });
  await appendRegistrationAuditEvent(db, {
    tenantId: params.tenantId, actorId: user.id, projectId: params.projectId, companyId, domain,
  });
  return user;
}
