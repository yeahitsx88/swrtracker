import type { DbClient, UUID } from '@/shared/types';
import { UnauthorizedError } from '@/shared/errors';
import { assertActiveSession, type AuthContext } from '@/lib/auth';
import { resolveProjectCapabilities } from '@/lib/project-capabilities';
import { ForbiddenError } from '@/shared/errors';

export interface MyAccount {
  name: string;
  email: string;
  company: string;
  assignment: null | { role: string; areas: string[]; crew: Array<{ name: string; role: string }> };
}
export interface MyAccountReader {
  profile(db: DbClient, tenantId: UUID, userId: UUID): Promise<Omit<MyAccount, 'assignment'> | null>;
  assignment(db: DbClient, tenantId: UUID, projectId: UUID, userId: UUID): Promise<{ areas: string[]; crew: Array<{ name: string; role: string }> }>;
}
export async function getMyAccount(reader: MyAccountReader, db: DbClient, auth: AuthContext, projectId?: UUID): Promise<MyAccount> {
  await assertActiveSession(db, auth);
  const capabilities = projectId ? await resolveProjectCapabilities(db, auth, projectId) : null;
  if (capabilities && !capabilities.operationalRole && !capabilities.canAdminister) {
    throw new ForbiddenError('You do not have access to this project');
  }
  const role = capabilities?.operationalRole ?? null;
  const profile = await reader.profile(db, auth.tenantId, auth.userId);
  if (!profile) throw new UnauthorizedError();
  return { ...profile, assignment: projectId && role ? { role, ...await reader.assignment(db, auth.tenantId, projectId, auth.userId) } : null };
}
