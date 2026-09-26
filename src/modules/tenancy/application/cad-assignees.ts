import type { DbClient, UUID } from '@/shared/types';
import { ValidationError } from '@/shared/errors';

export interface CadAssigneeQuery {
  tenantId: UUID; projectId: UUID; ticketCompanyId: UUID;
  search: string; limit: number; offset: number;
}
export interface CadAssigneesPort {
  list(db: DbClient, params: CadAssigneeQuery): Promise<Array<{ id: UUID; name: string }>>;
}
/** Workflow caller must authorize ticket access before requesting candidates. */
export async function listCadAssignees(repo: CadAssigneesPort, db: DbClient, params: CadAssigneeQuery) {
  if (!Number.isSafeInteger(params.limit) || params.limit < 1 || params.limit > 100 ||
      !Number.isSafeInteger(params.offset) || params.offset < 0 || params.offset > 100000 || params.search.length > 200) {
    throw new ValidationError('Invalid CAD candidate query');
  }
  const rows = await repo.list(db, { ...params, search: params.search.trim(), limit: params.limit + 1 });
  return { candidates: rows.slice(0, params.limit), hasMore: rows.length > params.limit };
}
