import { randomUUID } from 'node:crypto';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/shared/errors';
import type { DbClient, Page, UUID } from '@/shared/types';
import type { ProjectRole } from '@/modules/identity/domain/types';
import type { CrewBuild, ProjectStatus } from '../domain/types';

export interface TeamPerson { userId: UUID; name: string; email: string; role: ProjectRole; active: boolean }
export interface SurveyTeamSummary {
  id: UUID; name: string; areaId: UUID; areaName: string; areas?: TeamArea[]; lead: TeamPerson; memberCount: number; rowVersion: number;
}
export interface SurveyTeamDetail extends SurveyTeamSummary { members: TeamPerson[] }
export interface TeamPersonnel extends TeamPerson { teamId: UUID | null; teamName: string | null; roleVersion: number }
export interface TeamPageQuery { search: string; limit: number; offset: number }
export interface TeamProjectContext { status: ProjectStatus; crewBuild: CrewBuild }
export interface TeamArea { id: UUID; name: string }
export interface SaveSurveyTeamInput {
  teamId: UUID | null; expectedVersion: number | null; name: string; areaId: UUID; areaIds?: UUID[]; leadUserId: UUID; memberIds: UUID[];
}
/** Legacy clients provide one Area; new clients send the complete selection. */
export function selectedTeamAreas(input: Pick<SaveSurveyTeamInput, 'areaId' | 'areaIds'>): UUID[] {
  const ids = input.areaIds ?? [input.areaId];
  if (!ids.length || ids.length > 100 || new Set(ids).size !== ids.length || !ids.includes(input.areaId)) {
    throw new ValidationError('Choose between 1 and 100 different Areas for this team.');
  }
  return [...ids].sort();
}

export interface TeamActor { tenantId: UUID; projectId: UUID; actorId: UUID; actorRole: ProjectRole; sessionVersion: number }
export type TeamEvent = 'survey.team_created' | 'survey.team_updated' | 'survey.team_deactivated' | 'survey.role_changed';

export interface SurveyTeamsRepository {
  projectContext(db: DbClient, tenantId: UUID, projectId: UUID): Promise<TeamProjectContext | null>;
  areas(db: DbClient, tenantId: UUID, projectId: UUID, query: TeamPageQuery): Promise<Page<TeamArea>>;
  lockProject(db: DbClient, tenantId: UUID, projectId: UUID): Promise<{ status: ProjectStatus; crewBuild: CrewBuild } | null>;
  lockManager(db: DbClient, actor: TeamActor): Promise<boolean>;
  lockSuperintendent(db: DbClient, actor: TeamActor): Promise<boolean>;
  team(db: DbClient, tenantId: UUID, projectId: UUID, teamId: UUID): Promise<SurveyTeamDetail | null>;
  list(db: DbClient, tenantId: UUID, projectId: UUID, query: TeamPageQuery, leadUserId?: UUID): Promise<Page<SurveyTeamSummary>>;
  personnel(db: DbClient, tenantId: UUID, projectId: UUID, query: TeamPageQuery): Promise<Page<TeamPersonnel>>;
  activeArea(db: DbClient, tenantId: UUID, projectId: UUID, areaId: UUID): Promise<boolean>;
  members(db: DbClient, tenantId: UUID, projectId: UUID, userIds: UUID[]): Promise<TeamPersonnel[]>;
  nameExists(db: DbClient, tenantId: UUID, projectId: UUID, name: string, exceptTeamId: UUID | null): Promise<boolean>;
  save(db: DbClient, actor: TeamActor, teamId: UUID, input: SaveSurveyTeamInput, previous: SurveyTeamDetail | null): Promise<void>;
  /** Null coverage counts all pending work; supplied coverage counts only work it no longer covers. */
  delegationObligations(db: DbClient, actor: TeamActor, teamId: UUID, retainedAreaIds: UUID[] | null): Promise<number>;
  deactivate(db: DbClient, actor: TeamActor, team: SurveyTeamDetail): Promise<void>;
  recordTeamEvent(db: DbClient, actor: TeamActor, event: TeamEvent, payload: Record<string, unknown>): Promise<void>;
}

function assertManager(actor: TeamActor): void {
  if (actor.actorRole !== 'SURVEY_MANAGER') throw new ForbiddenError('Only the Survey Manager may manage project teams');
}

async function lockWritableProject(repo: SurveyTeamsRepository, db: DbClient, actor: TeamActor) {
  assertManager(actor);
  const project = await repo.lockProject(db, actor.tenantId, actor.projectId);
  if (!project) throw new NotFoundError('Project not found');
  if (!await repo.lockManager(db, actor)) throw new ForbiddenError('Your Survey Manager assignment or session has changed');
  if (project.status === 'ARCHIVED') throw new ConflictError('Closed projects cannot be changed');
  return project;
}

/** Also check authorization on an idempotent replay before returning its data. */
export async function authorizeTeamMutation(repo: SurveyTeamsRepository, db: DbClient, actor: TeamActor): Promise<{ status: ProjectStatus; crewBuild: CrewBuild }> {
  return lockWritableProject(repo, db, actor);
}

const teamRoles = new Set<ProjectRole>(['SURVEY_SUPERINTENDENT', 'PARTY_CHIEF', 'INSTRUMENT_MAN']);

/** Current ownership must also be checked before returning an earlier saved result. */
export async function authorizeTeamSave(repo: SurveyTeamsRepository, db: DbClient, actor: TeamActor, input: SaveSurveyTeamInput) {
  if(actor.actorRole!=='SURVEY_SUPERINTENDENT')return lockWritableProject(repo,db,actor);
  if(!input.teamId)throw new ForbiddenError('Only the Survey Manager can create a team.');
  const project=await repo.lockProject(db,actor.tenantId,actor.projectId);
  if(!project)throw new NotFoundError('Project not found');
  if(!await repo.lockSuperintendent(db,actor))throw new ForbiddenError('Your Superintendent role or session has changed.');
  const team=await repo.team(db,actor.tenantId,actor.projectId,input.teamId);
  if(!team||team.lead.userId!==actor.actorId)throw new ForbiddenError('You can edit only a team you lead.');
  if(project.status==='ARCHIVED')throw new ConflictError('Closed projects cannot be changed');
  if(input.leadUserId!==team.lead.userId||JSON.stringify(selectedTeamAreas(input))!==JSON.stringify((team.areas?.map(area=>area.id)??[team.areaId]).sort())) {
    throw new ForbiddenError('The Survey Manager sets team leadership and Area coverage.');
  }
  if(input.memberIds.some(id=>!team.members.some(member=>member.userId===id)))throw new ForbiddenError('Only the Survey Manager can add people from outside your team.');
  return project;
}

/** Caller owns the transaction and lifecycle barrier. */
export async function saveSurveyTeam(repo: SurveyTeamsRepository, db: DbClient, actor: TeamActor, input: SaveSurveyTeamInput) {
  const project = await authorizeTeamSave(repo, db, actor, input);
  const previous = input.teamId ? await repo.team(db, actor.tenantId, actor.projectId, input.teamId) : null;
  if (input.teamId && !previous) throw new NotFoundError('Team not found');
  if (previous && previous.rowVersion !== input.expectedVersion) throw new ConflictError('This team changed; reload before saving', 'STALE_TEAM');
  if (!input.memberIds.includes(input.leadUserId)) throw new ConflictError('The team lead must be a selected team member');
  const areaIds = selectedTeamAreas(input);
  for (const areaId of areaIds) {
    if (!await repo.activeArea(db, actor.tenantId, actor.projectId, areaId)) throw new NotFoundError('Active project Area not found');
  }
  if (await repo.nameExists(db, actor.tenantId, actor.projectId, input.name, input.teamId)) throw new ConflictError('An active team already has this name');
  const members = await repo.members(db, actor.tenantId, actor.projectId, input.memberIds);
  if (members.length !== input.memberIds.length || members.some(member => !member.active || !teamRoles.has(member.role))) {
    throw new ConflictError('Select active project survey personnel; assign their survey roles first');
  }
  if (members.some(member => member.teamId && member.teamId !== input.teamId)) throw new ConflictError('A selected person already belongs to another team');
  if ((project.crewBuild !== 'FULL' && members.some(member => member.role === 'SURVEY_SUPERINTENDENT')) ||
      (project.crewBuild === 'SLIM' && members.some(member => member.role === 'PARTY_CHIEF'))) {
    throw new ConflictError('A selected role is not supported by this project crew build');
  }
  const unchanged = previous && previous.name === input.name && JSON.stringify((previous.areas?.map(area => area.id) ?? [previous.areaId]).sort()) === JSON.stringify(areaIds) && previous.lead.userId === input.leadUserId &&
    previous.members.length === input.memberIds.length && previous.members.every(member => input.memberIds.includes(member.userId));
  if (unchanged) return { teamId: previous.id, rowVersion: previous.rowVersion, changed: false };
  if (previous) {
    const changesOwnership = previous.lead.userId !== input.leadUserId || previous.members.some(member => !input.memberIds.includes(member.userId));
    const count = await repo.delegationObligations(db, actor, previous.id, changesOwnership ? null : areaIds);
    if (count) throw new ConflictError(`${count} approved request(s) are awaiting this team's crew selection. Resolve them through Survey Operations by assigning a crew, redelegating, returning or cancelling before removing people, changing the lead or removing required coverage.`, 'TEAM_DELEGATION_OBLIGATIONS');
  }
  const teamId = input.teamId ?? randomUUID() as UUID;
  await repo.save(db, actor, teamId, input, previous);
  const rowVersion = (previous?.rowVersion ?? 0) + 1;
  await repo.recordTeamEvent(db, actor, previous ? 'survey.team_updated' : 'survey.team_created', {
    teamId, rowVersion, name: input.name, areaId: input.areaId, areaIds, leadUserId: input.leadUserId, memberIds: input.memberIds,
    previous: previous ? { name: previous.name, areaId: previous.areaId, areaIds: previous.areas?.map(area => area.id) ?? [previous.areaId], leadUserId: previous.lead.userId,
      memberIds: previous.members.map(member => member.userId), rowVersion: previous.rowVersion } : null,
  });
  return { teamId, rowVersion, changed: true };
}

export async function deactivateSurveyTeam(repo: SurveyTeamsRepository, db: DbClient, actor: TeamActor, teamId: UUID, expectedVersion: number) {
  await lockWritableProject(repo, db, actor);
  const team = await repo.team(db, actor.tenantId, actor.projectId, teamId);
  if (!team) throw new NotFoundError('Team not found');
  if (team.rowVersion !== expectedVersion) throw new ConflictError('This team changed; reload before deleting', 'STALE_TEAM');
  const count = await repo.delegationObligations(db, actor, team.id, null);
  if (count) throw new ConflictError(`${count} approved request(s) are awaiting this team's crew selection. Resolve them through Survey Operations by assigning a crew, redelegating, returning or cancelling before deleting the team.`, 'TEAM_DELEGATION_OBLIGATIONS');
  await repo.deactivate(db, actor, team);
  await repo.recordTeamEvent(db, actor, 'survey.team_deactivated', { teamId, name: team.name, areaId: team.areaId,
    leadUserId: team.lead.userId, memberIds: team.members.map(member => member.userId), rowVersion: team.rowVersion + 1 });
  return { success: true };
}

export async function readSurveyTeams(repo: SurveyTeamsRepository, db: DbClient, actor: TeamActor, query: TeamPageQuery, teamId?: UUID) {
  if(actor.actorRole!=='SURVEY_SUPERINTENDENT')assertManager(actor);
  if (teamId) {
    const team = await repo.team(db, actor.tenantId, actor.projectId, teamId);
    if (!team) throw new NotFoundError('Team not found');
    if(actor.actorRole==='SURVEY_SUPERINTENDENT'&&team.lead.userId!==actor.actorId)throw new ForbiddenError('You can view only a team you lead.');
    return { team };
  }
  return repo.list(db, actor.tenantId, actor.projectId, query,actor.actorRole==='SURVEY_SUPERINTENDENT'?actor.actorId:undefined);
}

export async function readTeamPersonnel(repo: SurveyTeamsRepository, db: DbClient, actor: TeamActor, query: TeamPageQuery) {
  assertManager(actor);
  return repo.personnel(db, actor.tenantId, actor.projectId, query);
}

export async function readTeamContext(repo: SurveyTeamsRepository, db: DbClient, actor: TeamActor) {
  assertManager(actor);
  const project = await repo.projectContext(db, actor.tenantId, actor.projectId);
  if (!project) throw new NotFoundError('Project not found');
  return { project };
}

export async function readTeamAreas(repo: SurveyTeamsRepository, db: DbClient, actor: TeamActor, query: TeamPageQuery) {
  assertManager(actor);
  return repo.areas(db, actor.tenantId, actor.projectId, query);
}
