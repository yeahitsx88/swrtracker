import type { DbClient, UUID } from '@/shared/types';
import { ValidationError } from '@/shared/errors';

export interface CandidateQuery {
  tenantId: UUID; projectId: UUID; role: 'PARTY_CHIEF' | 'INSTRUMENT_MAN';
  aorNodeId: UUID | null; search: string; limit: number; offset: number;
}
export interface AssignmentCandidatesPort {
  list(db: DbClient, params: CandidateQuery): Promise<Array<{ id: UUID; name: string }>>;
}

/** Called by an authorized workflow service; a non-null AOR restricts candidates to its ancestors. */
export async function listAssignmentCandidates(repo: AssignmentCandidatesPort, db: DbClient,
  params: CandidateQuery) {
  if (!Number.isSafeInteger(params.limit) || params.limit < 1 || params.limit > 100 ||
      !Number.isSafeInteger(params.offset) || params.offset < 0 || params.offset > 100000 ||
      params.search.length > 200 || !['PARTY_CHIEF', 'INSTRUMENT_MAN'].includes(params.role)) {
    throw new ValidationError('Invalid candidate query');
  }
  const rows = await repo.list(db, { ...params, search: params.search.trim(), limit: params.limit + 1 });
  return { candidates: rows.slice(0, params.limit), hasMore: rows.length > params.limit };
}
