import { ForbiddenError, NotFoundError, ValidationError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import { listHelpFlags, type HelpFlag, type HelpFlagContext, type HelpFlagRepositoryPort } from './help-flags';
import { listAssignmentCandidates, type AssignmentCandidatesPort } from '@/modules/tenancy/application/assignment-candidates';

export interface HelpPickupPort {
  list(db: DbClient, flag: HelpFlag, actorId: UUID, search: string, limit: number, offset: number): Promise<Array<{ id: UUID; name: string }>>;
}
export async function getHelpPickupOptions(flags: HelpFlagRepositoryPort, tickets: HelpPickupPort,
  crew: AssignmentCandidatesPort, db: DbClient,
  context: HelpFlagContext & { flagId: UUID; kind: 'tickets' | 'crew'; search: string; limit: number; offset: number }) {
  if (context.actorRole !== 'PARTY_CHIEF') throw new ForbiddenError('Party Chief required');
  if (!['tickets','crew'].includes(context.kind) || context.search.length > 200 ||
      !Number.isSafeInteger(context.limit) || context.limit < 1 || context.limit > 100 ||
      !Number.isSafeInteger(context.offset) || context.offset < 0 || context.offset > 100000) throw new ValidationError('Invalid pickup query');
  const visible = await listHelpFlags(flags, db, context);
  const flag = visible.find(row => row.id === context.flagId && row.level === 2 && row.raisedBy !== context.actorId);
  if (!flag) throw new NotFoundError('Claimable help flag not found');
  if (context.kind === 'crew') return listAssignmentCandidates(crew, db, {
    tenantId: context.tenantId, projectId: context.projectId, role: 'INSTRUMENT_MAN',
    aorNodeId: null, crewChiefId: context.actorId, search: context.search, limit: context.limit, offset: context.offset,
  });
  const rows = await tickets.list(db, flag, context.actorId, context.search.trim(), context.limit + 1, context.offset);
  return { candidates: rows.slice(0, context.limit), hasMore: rows.length > context.limit };
}
