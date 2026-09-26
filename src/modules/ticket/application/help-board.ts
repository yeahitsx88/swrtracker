import { ForbiddenError } from '@/shared/errors';
import type { DbClient } from '@/shared/types';
import { listHelpFlags, type HelpFlagContext, type HelpFlagRepositoryPort } from './help-flags';

export function canViewHelpBoard(role: string) {
  return ['INSTRUMENT_MAN','PARTY_CHIEF','SURVEY_SUPERINTENDENT','SURVEY_MANAGER'].includes(role);
}
/** Presentation hints only: every mutation independently rechecks permission and state. */
export async function getHelpBoard(repo: HelpFlagRepositoryPort, db: DbClient, context: HelpFlagContext) {
  if (!canViewHelpBoard(context.actorRole)) throw new ForbiddenError('Help flags are available to survey crews and supervisors');
  const flags = await listHelpFlags(repo, db, context);
  const level = context.actorRole === 'INSTRUMENT_MAN' ? 1 : context.actorRole === 'PARTY_CHIEF' ? 2 : null;
  const existing = level ? await repo.activeFlagForActor(db, context.tenantId, context.projectId, context.actorId, level) : null;
  const crewReady = level !== 1 || Boolean(await repo.crewChief(db, context.tenantId, context.projectId, context.actorId));
  const workload = level && !existing && crewReady
    ? await repo.snapshot(db, context.tenantId, context.projectId, context.actorId, level) : [];
  const raiseLevel = level && !existing && crewReady && workload.length ? level : null;
  const rows = [];
  for (const flag of flags) {
    const canEscalate = context.actorRole === 'PARTY_CHIEF' && flag.level === 1 && !existing &&
      workload.length > 0 && await repo.crewChief(db, context.tenantId, context.projectId, flag.raisedBy) === context.actorId &&
      !await repo.findEscalation(db, context.tenantId, context.projectId, flag.id);
    rows.push({ ...flag, canClaim: context.actorRole === 'PARTY_CHIEF' && flag.level === 2 && flag.raisedBy !== context.actorId, own: flag.raisedBy === context.actorId,
      canClear: flag.raisedBy === context.actorId, canEscalate: Boolean(canEscalate) });
  }
  return { flags: rows, raiseLevel };
}
