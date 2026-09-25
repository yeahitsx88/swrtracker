import { randomUUID } from 'node:crypto';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import type { ProjectRole } from '@/modules/identity/domain/types';
import { appendAuditEvent } from '@/modules/audit/application/index';

export interface HelpFlag {
  id: UUID; tenantId: UUID; projectId: UUID; raisedBy: UUID;
  level: 1 | 2; status: 'ACTIVE' | 'CLEARED'; reason: string | null;
  escalatedFrom: UUID | null; affectedTicketIds: UUID[];
}

export interface HelpFlagRepositoryPort {
  activeProject(db: DbClient, tenantId: UUID, projectId: UUID): Promise<boolean>;
  crewChief(db: DbClient, tenantId: UUID, projectId: UUID, instrumentManId: UUID): Promise<UUID | null>;
  snapshot(db: DbClient, tenantId: UUID, projectId: UUID, actorId: UUID,
    level: 1 | 2): Promise<UUID[]>;
  activeFlagForActor(db: DbClient, tenantId: UUID, projectId: UUID,
    actorId: UUID, level: 1 | 2): Promise<HelpFlag | null>;
  saveFlag(db: DbClient, flag: HelpFlag): Promise<void>;
  lockFlag(db: DbClient, tenantId: UUID, projectId: UUID, flagId: UUID): Promise<HelpFlag | null>;
  findEscalation(db: DbClient, tenantId: UUID, projectId: UUID,
    sourceId: UUID): Promise<HelpFlag | null>;
  lockTicket(db: DbClient, tenantId: UUID, projectId: UUID,
    ticketId: UUID): Promise<boolean>;
  activeFlagsForTicket(db: DbClient, tenantId: UUID, projectId: UUID,
    ticketId: UUID): Promise<HelpFlag[]>;
  clearFlag(db: DbClient, tenantId: UUID, projectId: UUID, flagId: UUID,
    reason: 'MANUALLY_CLEARED' | 'TICKETS_REASSIGNED'): Promise<void>;
  isResolved(db: DbClient, flag: HelpFlag): Promise<boolean>;
  claimFlaggedTicket(db: DbClient, flag: HelpFlag, ticketId: UUID,
    claimantId: UUID, instrumentManId: UUID): Promise<{
      oldPartyChiefId: UUID; oldInstrumentManId: UUID | null;
    } | null>;
  listVisible(db: DbClient, tenantId: UUID, projectId: UUID,
    actorId: UUID, role: ProjectRole): Promise<HelpFlag[]>;
}

export interface HelpFlagContext {
  tenantId: UUID; projectId: UUID; actorId: UUID; actorRole: ProjectRole;
}

async function ensureActive(repo: HelpFlagRepositoryPort, db: DbClient,
  context: HelpFlagContext): Promise<void> {
  if (!(await repo.activeProject(db, context.tenantId, context.projectId))) {
    throw new ConflictError('Project is not active');
  }
}

function reasonValue(reason: string | undefined): string | null {
  if (reason === undefined) return null;
  const value = reason.trim();
  if (value.length > 500) throw new ValidationError('Reason must be 500 characters or less');
  return value || null;
}

async function audit(db: DbClient, flag: HelpFlag, actorId: UUID,
  eventType: 'help_flag.raised' | 'help_flag.escalated' | 'help_flag.cleared' |
    'help_flag.ticket_claimed', payload: Record<string, unknown>,
  ticketId: UUID = flag.affectedTicketIds[0]!): Promise<void> {
  await appendAuditEvent(db, { ticketId,
    tenantId: flag.tenantId, actorId, eventType,
    payload: { flagId: flag.id, projectId: flag.projectId, ...payload } });
}

export async function raiseHelpFlag(repo: HelpFlagRepositoryPort, db: DbClient,
  context: HelpFlagContext & { level: 1 | 2; reason?: string }): Promise<HelpFlag> {
  if (context.level === 1 && context.actorRole !== 'INSTRUMENT_MAN') {
    throw new ForbiddenError('Instrument Man required for Level 1');
  }
  if (context.level === 2 && context.actorRole !== 'PARTY_CHIEF') {
    throw new ForbiddenError('Party Chief required for Level 2');
  }
  await ensureActive(repo, db, context);
  if (context.level === 1 && !(await repo.crewChief(db,
    context.tenantId, context.projectId, context.actorId))) {
    throw new ConflictError('Instrument Man needs an active crew');
  }
  if (await repo.activeFlagForActor(db, context.tenantId,
    context.projectId, context.actorId, context.level)) {
    throw new ConflictError('An active help flag already exists');
  }
  const affectedTicketIds = await repo.snapshot(db, context.tenantId,
    context.projectId, context.actorId, context.level);
  if (!affectedTicketIds.length) throw new ConflictError('No assigned active tickets to flag');
  const flag: HelpFlag = { id: randomUUID() as UUID,
    tenantId: context.tenantId, projectId: context.projectId,
    raisedBy: context.actorId, level: context.level, status: 'ACTIVE',
    reason: reasonValue(context.reason), escalatedFrom: null, affectedTicketIds };
  await repo.saveFlag(db, flag);
  await audit(db, flag, context.actorId, 'help_flag.raised',
    { level: flag.level, raisedBy: flag.raisedBy,
      affectedTicketIds: flag.affectedTicketIds });
  return flag;
}

export async function escalateHelpFlag(repo: HelpFlagRepositoryPort, db: DbClient,
  context: HelpFlagContext & { flagId: UUID; reason?: string }): Promise<HelpFlag> {
  if (context.actorRole !== 'PARTY_CHIEF') throw new ForbiddenError('Party Chief required');
  await ensureActive(repo, db, context);
  const source = await repo.lockFlag(db, context.tenantId, context.projectId, context.flagId);
  if (!source || source.level !== 1 || source.status !== 'ACTIVE') {
    throw new NotFoundError('Active Level 1 help flag not found');
  }
  const chiefId = await repo.crewChief(db, context.tenantId,
    context.projectId, source.raisedBy);
  if (chiefId !== context.actorId) throw new ForbiddenError('Flag belongs to another crew');
  if (await repo.findEscalation(db, context.tenantId, context.projectId, source.id)) {
    throw new ConflictError('Help flag is already escalated');
  }
  if (await repo.activeFlagForActor(db, context.tenantId,
    context.projectId, context.actorId, 2)) {
    throw new ConflictError('Party Chief already has an active Level 2 flag');
  }
  const affectedTicketIds = await repo.snapshot(db, context.tenantId,
    context.projectId, context.actorId, 2);
  if (!affectedTicketIds.length) throw new ConflictError('No assigned active tickets to flag');
  const flag: HelpFlag = { id: randomUUID() as UUID,
    tenantId: context.tenantId, projectId: context.projectId,
    raisedBy: context.actorId, level: 2, status: 'ACTIVE',
    reason: reasonValue(context.reason), escalatedFrom: source.id, affectedTicketIds };
  await repo.saveFlag(db, flag);
  await audit(db, flag, context.actorId, 'help_flag.escalated',
    { level: 2, escalatedBy: context.actorId, originalFlagId: source.id,
      affectedTicketIds });
  return flag;
}

export async function clearHelpFlag(repo: HelpFlagRepositoryPort, db: DbClient,
  context: HelpFlagContext & { flagId: UUID }): Promise<void> {
  await ensureActive(repo, db, context);
  const flag = await repo.lockFlag(db, context.tenantId, context.projectId, context.flagId);
  if (!flag || flag.status !== 'ACTIVE') throw new NotFoundError('Active help flag not found');
  if (flag.raisedBy !== context.actorId) throw new ForbiddenError('Only the raiser may clear a flag');
  await repo.clearFlag(db, context.tenantId, context.projectId,
    flag.id, 'MANUALLY_CLEARED');
  await audit(db, flag, context.actorId, 'help_flag.cleared',
    { clearedReason: 'MANUALLY_CLEARED' });
}

export async function clearResolvedHelpFlag(repo: HelpFlagRepositoryPort, db: DbClient,
  flag: HelpFlag, actorId: UUID, reassignmentId?: UUID): Promise<boolean> {
  if (flag.status !== 'ACTIVE' || !(await repo.isResolved(db, flag))) return false;
  await repo.clearFlag(db, flag.tenantId, flag.projectId,
    flag.id, 'TICKETS_REASSIGNED');
  await audit(db, flag, actorId, 'help_flag.cleared',
    { clearedReason: 'TICKETS_REASSIGNED', reassignmentId: reassignmentId ?? null });
  return true;
}

/** Call inside the same transaction as any ticket crew reassignment. */
export async function clearResolvedFlagsForTicket(repo: HelpFlagRepositoryPort,
  db: DbClient, tenantId: UUID, projectId: UUID, ticketId: UUID,
  actorId: UUID): Promise<number> {
  const flags = await repo.activeFlagsForTicket(db, tenantId, projectId, ticketId);
  let cleared = 0;
  for (const flag of flags) {
    if (await clearResolvedHelpFlag(repo, db, flag, actorId, ticketId)) cleared++;
  }
  return cleared;
}

export async function claimFlaggedTicket(repo: HelpFlagRepositoryPort, db: DbClient,
  context: HelpFlagContext & { flagId: UUID; ticketId: UUID;
    instrumentManId: UUID }): Promise<void> {
  if (context.actorRole !== 'PARTY_CHIEF') throw new ForbiddenError('Party Chief required');
  await ensureActive(repo, db, context);
  if (!(await repo.lockTicket(db, context.tenantId,
    context.projectId, context.ticketId))) {
    throw new NotFoundError('Ticket not found in this project');
  }
  const flag = await repo.lockFlag(db, context.tenantId, context.projectId, context.flagId);
  if (!flag || flag.status !== 'ACTIVE' || flag.level !== 2) {
    throw new NotFoundError('Active Level 2 help flag not found');
  }
  if (flag.raisedBy === context.actorId) {
    throw new ForbiddenError('Flag raiser cannot claim their own ticket');
  }
  if (!flag.affectedTicketIds.includes(context.ticketId)) {
    throw new ForbiddenError('Ticket is outside this help flag snapshot');
  }
  if (await repo.crewChief(db, context.tenantId, context.projectId,
    context.instrumentManId) !== context.actorId) {
    throw new ForbiddenError('Instrument Man is not in the claiming crew');
  }
  const previous = await repo.claimFlaggedTicket(db, flag, context.ticketId,
    context.actorId, context.instrumentManId);
  if (!previous) throw new ConflictError('Ticket is no longer claimable');
  await appendAuditEvent(db, { ticketId: context.ticketId,
    tenantId: context.tenantId, actorId: context.actorId,
    eventType: 'ticket.assigned', payload: { viaHelpFlagId: flag.id,
      oldPartyChiefId: previous.oldPartyChiefId,
      assignedPartyChiefId: context.actorId,
      oldInstrumentManId: previous.oldInstrumentManId,
      assignedInstrumentManId: context.instrumentManId } });
  await audit(db, flag, context.actorId, 'help_flag.ticket_claimed',
    { ticketId: context.ticketId, oldPartyChiefId: previous.oldPartyChiefId,
      newPartyChiefId: context.actorId,
      newInstrumentManId: context.instrumentManId }, context.ticketId);
  await clearResolvedFlagsForTicket(repo, db, context.tenantId,
    context.projectId, context.ticketId, context.actorId);
}

export async function listHelpFlags(repo: HelpFlagRepositoryPort, db: DbClient,
  context: HelpFlagContext): Promise<HelpFlag[]> {
  await ensureActive(repo, db, context);
  return repo.listVisible(db, context.tenantId, context.projectId,
    context.actorId, context.actorRole);
}
