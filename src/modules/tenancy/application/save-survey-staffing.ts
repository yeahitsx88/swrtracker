import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import type { ProjectRole } from '@/modules/identity/domain/types';
import type { CrewBuild, ProjectStatus } from '../domain/types';

export interface SurveyStaffingInput {
  expectedSnapshot: string;
  partyChiefId: UUID;
  areaId: UUID;
  superintendentId: UUID | null;
  instrumentManIds: UUID[];
  confirmRoleChanges: boolean;
}

export interface SurveyStaffingMember { userId: UUID; role: ProjectRole }
export interface StaffingActor { tenantId: UUID; projectId: UUID; actorId: UUID; actorRole: ProjectRole; sessionVersion: number }
export interface SurveyStaffingRepository {
  lockManager(db: DbClient, actor: StaffingActor): Promise<boolean>;
  snapshot(db: DbClient, tenantId: UUID, projectId: UUID): Promise<string | null>;
  lockSubjects(db: DbClient, tenantId: UUID, projectId: UUID, userIds: UUID[]): Promise<void>;
  lockProject(db: DbClient, tenantId: UUID, projectId: UUID): Promise<{ status: ProjectStatus; crewBuild: CrewBuild } | null>;
  member(db: DbClient, tenantId: UUID, projectId: UUID, userId: UUID): Promise<SurveyStaffingMember | null>;
  activeArea(db: DbClient, tenantId: UUID, projectId: UUID, areaId: UUID): Promise<boolean>;
  superintendentCoversArea(db: DbClient, tenantId: UUID, projectId: UUID, superintendentId: UUID, areaId: UUID): Promise<boolean>;
  activeAreasForUser(db: DbClient, tenantId: UUID, projectId: UUID, userId: UUID): Promise<UUID[]>;
  rosterChief(db: DbClient, tenantId: UUID, projectId: UUID, instrumentManId: UUID): Promise<UUID | null>;
  changeRole(db: DbClient, tenantId: UUID, projectId: UUID, userId: UUID, role: 'PARTY_CHIEF' | 'INSTRUMENT_MAN'): Promise<void>;
  addArea(db: DbClient, tenantId: UUID, projectId: UUID, userId: UUID, areaId: UUID): Promise<void>;
  setReportingLink(db: DbClient, tenantId: UUID, projectId: UUID, actorId: UUID, partyChiefId: UUID, superintendentId: UUID | null, areaId: UUID): Promise<{ changed: boolean; previousSuperintendentId: UUID | null; previousAreaId: UUID | null }>;
  addInstrumentMan(db: DbClient, tenantId: UUID, projectId: UUID, partyChiefId: UUID, instrumentManId: UUID): Promise<void>;
  record(db: DbClient, tenantId: UUID, projectId: UUID, actorId: UUID, payload: Record<string, unknown>): Promise<void>;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const eligiblePartyChiefRoles = new Set<ProjectRole>(['VIEWER', 'REQUESTER', 'PARTY_CHIEF']);
const eligibleInstrumentManRoles = new Set<ProjectRole>(['VIEWER', 'REQUESTER', 'INSTRUMENT_MAN']);

/** Replays require current authority too. Caller owns the transaction. */
export async function authorizeStaffingMutation(repo: SurveyStaffingRepository, db: DbClient, actor: StaffingActor) {
  if (actor.actorRole !== 'SURVEY_MANAGER') throw new ForbiddenError('Only the Survey Manager can staff this team');
  if (!uuidPattern.test(actor.projectId)) throw new ValidationError('Project must be a valid ID');
  const project = await repo.lockProject(db, actor.tenantId, actor.projectId);
  if (!project) throw new NotFoundError('Project not found');
  if (!await repo.lockManager(db, actor)) throw new ForbiddenError('Your Survey Manager assignment or session has changed');
  if (project.status === 'ARCHIVED') throw new ConflictError('Closed projects cannot be staffed');
  if (project.crewBuild === 'SLIM') throw new ConflictError('This project has no Party Chief tier');
  return project;
}

export async function readStaffingSnapshot(repo: SurveyStaffingRepository, db: DbClient, actor: StaffingActor) {
  await authorizeStaffingMutation(repo, db, actor);
  const snapshotToken = await repo.snapshot(db, actor.tenantId, actor.projectId);
  if (!snapshotToken) throw new NotFoundError('Project not found');
  return { snapshotToken };
}

/** Fixed-role project staffing. Caller owns a transaction; all checks precede writes. */
export async function saveSurveyStaffing(repo: SurveyStaffingRepository, db: DbClient, params: StaffingActor & {
  input: SurveyStaffingInput;
}): Promise<{ changed: boolean }> {
  const { tenantId, projectId, actorId, actorRole, input } = params;
  if (actorRole !== 'SURVEY_MANAGER') throw new ForbiddenError('Only the Survey Manager can staff this team');
  if (!/^[a-f0-9]{32}$/.test(input.expectedSnapshot) || !uuidPattern.test(projectId) || !uuidPattern.test(input.partyChiefId) || !uuidPattern.test(input.areaId) ||
      (input.superintendentId !== null && !uuidPattern.test(input.superintendentId)) ||
      !Array.isArray(input.instrumentManIds) || input.instrumentManIds.length > 100 ||
      input.instrumentManIds.some(id => !uuidPattern.test(id))) {
    throw new ValidationError('Valid project, Party Chief, Area, Superintendent and Instrument Man IDs are required');
  }
  if (new Set(input.instrumentManIds).size !== input.instrumentManIds.length || input.instrumentManIds.includes(input.partyChiefId)) {
    throw new ValidationError('Instrument Men must be distinct from each other and the Party Chief');
  }

  const project = await authorizeStaffingMutation(repo, db, params);
  await repo.lockSubjects(db, tenantId, projectId, [...new Set([input.partyChiefId, ...input.instrumentManIds,
    ...(input.superintendentId ? [input.superintendentId] : [])])].sort());
  if (await repo.snapshot(db, tenantId, projectId) !== input.expectedSnapshot) {
    throw new ConflictError('Project staffing changed; reload its current assignments before saving', 'STALE_STAFFING');
  }
  if (project.crewBuild === 'FULL' && !input.superintendentId) {
    throw new ValidationError('Choose the responsible Survey Superintendent for this Area');
  }
  if (project.crewBuild === 'MEDIUM' && input.superintendentId) {
    throw new ValidationError('This project has no Survey Superintendent tier');
  }

  const chief = await repo.member(db, tenantId, projectId, input.partyChiefId);
  if (!chief) throw new ValidationError('Party Chief must already be an active project member');
  if (!eligiblePartyChiefRoles.has(chief.role)) throw new ConflictError('This member has a role that cannot be changed through Survey Team staffing');
  if (!await repo.activeArea(db, tenantId, projectId, input.areaId)) throw new ValidationError('Choose an active project Area');

  if (input.superintendentId) {
    const superintendent = await repo.member(db, tenantId, projectId, input.superintendentId);
    if (superintendent?.role !== 'SURVEY_SUPERINTENDENT') throw new ValidationError('Choose an active project Survey Superintendent');
    if (!await repo.superintendentCoversArea(db, tenantId, projectId, input.superintendentId, input.areaId)) {
      throw new ForbiddenError('The selected Superintendent is not authorized for this Area');
    }
  }

  const existingAreas = await repo.activeAreasForUser(db, tenantId, projectId, input.partyChiefId);
  if (existingAreas.some(areaId => areaId !== input.areaId)) {
    throw new ConflictError('This Party Chief already has another Area; use a separate reassignment workflow');
  }
  const instrumentMen = await Promise.all(input.instrumentManIds.map(async id => {
    const member = await repo.member(db, tenantId, projectId, id);
    if (!member) throw new ValidationError('Every Instrument Man must already be an active project member');
    if (!eligibleInstrumentManRoles.has(member.role)) throw new ConflictError('An Instrument Man has a role that cannot be changed through Survey Team staffing');
    const rosterChief = await repo.rosterChief(db, tenantId, projectId, id);
    if (rosterChief && rosterChief !== input.partyChiefId) {
      throw new ConflictError('An Instrument Man already reports to another Party Chief');
    }
    return { id, role: member.role, rosterChief };
  }));
  if (!input.confirmRoleChanges && (chief.role !== 'PARTY_CHIEF' || instrumentMen.some(member => member.role !== 'INSTRUMENT_MAN'))) {
    throw new ValidationError('Confirm that selected project roles will be replaced by Party Chief or Instrument Man roles');
  }

  // Area/coverage rows are now held too; reject changes during validation.
  if (await repo.snapshot(db, tenantId, projectId) !== input.expectedSnapshot) {
    throw new ConflictError('Project staffing changed; reload its current assignments before saving', 'STALE_STAFFING');
  }

  let changed = false;
  const roleChanges: { userId: UUID; from: ProjectRole; to: ProjectRole }[] = [];
  if (chief.role !== 'PARTY_CHIEF') {
    await repo.changeRole(db, tenantId, projectId, input.partyChiefId, 'PARTY_CHIEF');
    roleChanges.push({ userId: input.partyChiefId, from: chief.role, to: 'PARTY_CHIEF' });
    changed = true;
  }
  if (!existingAreas.includes(input.areaId)) {
    await repo.addArea(db, tenantId, projectId, input.partyChiefId, input.areaId);
    changed = true;
  }
  const reporting = await repo.setReportingLink(db, tenantId, projectId, actorId, input.partyChiefId, input.superintendentId, input.areaId);
  if (reporting.changed) changed = true;
  for (const member of instrumentMen) {
    if (member.role !== 'INSTRUMENT_MAN') {
      await repo.changeRole(db, tenantId, projectId, member.id, 'INSTRUMENT_MAN');
      roleChanges.push({ userId: member.id, from: member.role, to: 'INSTRUMENT_MAN' });
      changed = true;
    }
    if (!member.rosterChief) {
      await repo.addInstrumentMan(db, tenantId, projectId, input.partyChiefId, member.id);
      changed = true;
    }
  }
  if (changed) await repo.record(db, tenantId, projectId, actorId, {
    partyChiefId: input.partyChiefId, areaId: input.areaId, superintendentId: input.superintendentId,
    instrumentManIds: input.instrumentManIds, roleChanges,
    previousReporting: { superintendentId: reporting.previousSuperintendentId, areaId: reporting.previousAreaId },
  });
  return { changed };
}
