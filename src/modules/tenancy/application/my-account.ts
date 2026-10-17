import type { DbClient, UUID } from '@/shared/types';
import { UnauthorizedError } from '@/shared/errors';
import { assertActiveSession, type AuthContext } from '@/lib/auth';
import { getProjectRole } from '@/lib/get-project-role';

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
  const role = projectId ? await getProjectRole(db, auth.tenantId, projectId, auth.userId) : null;
  const profile = await reader.profile(db, auth.tenantId, auth.userId);
  if (!profile) throw new UnauthorizedError();
  return { ...profile, assignment: projectId && role ? { role, ...await reader.assignment(db, auth.tenantId, projectId, auth.userId) } : null };
}
