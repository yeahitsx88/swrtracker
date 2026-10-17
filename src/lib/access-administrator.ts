import type { DbClient, UUID } from '@/shared/types';
import type { AuthContext } from './auth';
import { assertProjectAdministrator } from './project-capabilities';

/** Administrative authority is independent of the actual operational role. */
export async function assertAccessAdministrator(
  db: DbClient, auth: AuthContext, projectId: UUID,
): Promise<void> {
  await assertProjectAdministrator(db,auth,projectId);
}