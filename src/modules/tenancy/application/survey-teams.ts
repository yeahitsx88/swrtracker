import { randomUUID } from 'node:crypto';
import { ConflictError, ForbiddenError, NotFoundError } from '@/shared/errors';
import type { DbClient, Page, UUID } from '@/shared/types';
import type { ProjectRole } from '@/modules/identity/domain/types';
import type { CrewBuild, ProjectStatus } from '../domain/types';

export interface TeamPerson { userId: UUID; name: string; email: string; role: ProjectRole; active: boolean }
export interface SurveyTeamSummary {
  id: UUID; name: string; areaId: UUID; areaName: string; lead: TeamPerson; memberCount: number; rowVersion: number;
}
export interface SurveyTeamDetail extends SurveyTeamSummary { members: TeamPerson[] }
export interface TeamPersonnel extends TeamPerson { teamId: UUID | null; teamName: string | null }
export interface TeamPageQuery { search: string; limit: number; offset: number }
export interface SaveSurveyTeamInput {
  teamId: UUID | null; expectedVersion: number | null; name: string; areaId: UUID; leadUserId: UUID; memberIds: UUID[];
}
export interface TeamActor { tenantId: UUID; projectId: UUID; actorId: UUID; actorRole: ProjectRole; sessionVersion: number }
export type TeamEvent = 'survey.team_created' | 'survey.team_updated' | 'survey.team_deactivated';

export interface SurveyTeamsRepository {
  lockProject(db: DbClient, tenantId: UUID, projectId: UUID): Promise<{ status: ProjectStatus; crewBuild: CrewBuild } | null>;
  lockManager(db: DbClient, actor: TeamActor): Promise<boolean>;
  team(db: DbClient, tenantId: UUID, projectId: UUID, teamId: UUID): Promise<SurveyTeamDetail | null>;
  list(db: DbClient, tenantId: UUID, projectId: UUID, query: TeamPageQuery): Promise<Page<SurveyTeamSummary>>;
  personnel(db: DbClient, tenantId: UUID, projectId: UUID, query: TeamPageQuery): Promise<Page<TeamPersonnel>>;
  activeArea(db: DbClient, tenantId: UUID, projectId: UUID, areaId: UUID): Promise<boolean>;
  members(db: DbClient, tenantId: UUID, projectId: UUID, userIds: UUID[]): Promise<TeamPersonnel[]>;
  nameExists(db: DbClient, tenantId: UUID, projectId: UUID, name: string, exceptTeamId: UUID | null): Promise<boolean>;
  save(db: DbClient, actor: TeamActor, teamId: UUID, input: SaveSurveyTeamInput, previous: SurveyTeamDetail | null): Promise<void>;
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
export async function authorizeTeamMutation(repo: SurveyTeamsRepository, db: DbClient, actor: TeamActor): Promise<void> {
  await lockWritableProject(repo, db, actor);
}

const teamRoles = new Set<ProjectRole>(['SURVEY_SUPERINTENDENT', 'PARTY_CHIEF', 'INSTRUMENT_MAN']);

/** Caller owns the transaction. Teams never grant Area or reporting authority. */
export async function saveSurveyTeam(repo: SurveyTeamsRepository, db: DbClient, actor: TeamActor, input: SaveSurveyTeamInput) {
  const project = await lockWritableProject(repo, db, actor);
  const previous = input.teamId ? await repo.team(db, actor.tenantId, actor.projectId, input.teamId) : null;
  if (input.teamId && !previous) throw new NotFoundError('Team not found');
  if (previous && previous.rowVersion !== input.expectedVersion) throw new ConflictError('This team changed; reload before saving', 'STALE_TEAM');
  if (!input.memberIds.includes(input.leadUserId)) throw new ConflictError('The team lead must be a selected team member');
  if (!await repo.activeArea(db, actor.tenantId, actor.projectId, input.areaId)) throw new NotFoundError('Active project Area not found');
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
  const unchanged = previous && previous.name === input.name && previous.areaId === input.areaId && previous.lead.userId === input.leadUserId &&
    previous.members.length === input.memberIds.length && previous.members.every(member => input.memberIds.includes(member.userId));
  if (unchanged) return { teamId: previous.id, rowVersion: previous.rowVersion, changed: false };
  const teamId = input.teamId ?? randomUUID() as UUID;
  await repo.save(db, actor, teamId, input, previous);
  const rowVersion = (previous?.rowVersion ?? 0) + 1;
  await repo.recordTeamEvent(db, actor, previous ? 'survey.team_updated' : 'survey.team_created', {
    teamId, rowVersion, name: input.name, areaId: input.areaId, leadUserId: input.leadUserId, memberIds: input.memberIds,
    previous: previous ? { name: previous.name, areaId: previous.areaId, leadUserId: previous.lead.userId,
      memberIds: previous.members.map(member => member.userId), rowVersion: previous.rowVersion } : null,
  });
  return { teamId, rowVersion, changed: true };
}

export async function deactivateSurveyTeam(repo: SurveyTeamsRepository, db: DbClient, actor: TeamActor, teamId: UUID, expectedVersion: number) {
  await lockWritableProject(repo, db, actor);
  const team = await repo.team(db, actor.tenantId, actor.projectId, teamId);
  if (!team) throw new NotFoundError('Team not found');
  if (team.rowVersion !== expectedVersion) throw new ConflictError('This team changed; reload before deleting', 'STALE_TEAM');
  await repo.deactivate(db, actor, team);
  await repo.recordTeamEvent(db, actor, 'survey.team_deactivated', { teamId, name: team.name, areaId: team.areaId,
    leadUserId: team.lead.userId, memberIds: team.members.map(member => member.userId), rowVersion: team.rowVersion + 1 });
  return { success: true };
}

export async function readSurveyTeams(repo: SurveyTeamsRepository, db: DbClient, actor: TeamActor, query: TeamPageQuery, teamId?: UUID) {
  assertManager(actor);
  if (teamId) {
    const team = await repo.team(db, actor.tenantId, actor.projectId, teamId);
    if (!team) throw new NotFoundError('Team not found');
    return { team };
  }
  return repo.list(db, actor.tenantId, actor.projectId, query);
}

export async function readTeamPersonnel(repo: SurveyTeamsRepository, db: DbClient, actor: TeamActor, query: TeamPageQuery) {
  assertManager(actor);
  return repo.personnel(db, actor.tenantId, actor.projectId, query);
}
