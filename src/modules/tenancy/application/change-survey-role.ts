import { ConflictError, NotFoundError, ValidationError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import type { ProjectRole } from '@/modules/identity/domain/types';
import { authorizeTeamMutation, type SurveyTeamsRepository, type TeamActor } from './survey-teams';

export type ManagedSurveyRole = 'SURVEY_SUPERINTENDENT' | 'PARTY_CHIEF' | 'INSTRUMENT_MAN' | 'REQUESTER';
export interface ChangeSurveyRoleInput {
  userId: UUID;
  expectedRole: ProjectRole;
  expectedRoleVersion: number;
  role: ManagedSurveyRole;
  confirmRoleChanges: boolean;
}
export interface SurveyRoleObligations {
  leadsTeam: boolean; areaAssignments: number; crewLinks: number; reportingLinks: number; responsibilityGrants: number; actingGrants: number;
}
export interface SurveyRoleRepository extends SurveyTeamsRepository {
  roleObligations(db: DbClient, tenantId: UUID, projectId: UUID, userId: UUID): Promise<SurveyRoleObligations>;
  changeOperationalRole(db: DbClient, actor: TeamActor, input: ChangeSurveyRoleInput): Promise<number>;
}
const editableRoles = new Set<ProjectRole>(['VIEWER','REQUESTER','SURVEY_SUPERINTENDENT','PARTY_CHIEF','INSTRUMENT_MAN']);

/** Changes only an existing project's fixed role; never account or tenant membership. */
export async function changeSurveyRole(repo: SurveyRoleRepository, db: DbClient, actor: TeamActor, input: ChangeSurveyRoleInput) {
  const project = await authorizeTeamMutation(repo, db, actor);
  const [member] = await repo.members(db, actor.tenantId, actor.projectId, [input.userId]);
  if (!member || !member.active) throw new NotFoundError('Active eligible project member not found');
  if (!editableRoles.has(member.role)) throw new ConflictError('This project role cannot be edited through Team Management');
  if (member.role !== input.expectedRole || member.roleVersion !== input.expectedRoleVersion) {
    throw new ConflictError('This person’s role or account has changed; reload before saving', 'STALE_SURVEY_ROLE');
  }
  if ((project.crewBuild !== 'FULL' && input.role === 'SURVEY_SUPERINTENDENT') ||
      (project.crewBuild === 'SLIM' && input.role === 'PARTY_CHIEF')) {
    throw new ConflictError('This survey role is not supported by the project crew build');
  }
  if (member.role === input.role) return { userId: input.userId, role: input.role, roleVersion: member.roleVersion, changed: false };
  if (!input.confirmRoleChanges) throw new ValidationError('Confirm this project-role change and the affected person’s session invalidation');
  const obligations = await repo.roleObligations(db, actor.tenantId, actor.projectId, input.userId);
  if (input.role === 'REQUESTER' && obligations.leadsTeam) throw new ConflictError('Choose another team lead and remove this person from the team before removing their survey role');
  if (input.role === 'REQUESTER' && member.teamId) throw new ConflictError('Remove this person from their named team before removing their survey role');
  if (obligations.crewLinks || obligations.reportingLinks) {
    throw new ConflictError('Resolve this person’s active crew and reporting assignments before changing their role');
  }
  if (obligations.areaAssignments || obligations.responsibilityGrants || obligations.actingGrants) {
    throw new ConflictError('Resolve this person’s explicit Area, responsibility and acting grants before changing their role');
  }
  const roleVersion = await repo.changeOperationalRole(db, actor, input);
  await repo.recordTeamEvent(db, actor, 'survey.role_changed', {
    userId: input.userId, previousRole: member.role, role: input.role, previousRoleVersion: member.roleVersion, roleVersion,
    retainedTeamId: input.role === 'REQUESTER' ? null : member.teamId, confirmed: true,
    historicalTicketAssignmentsUnchanged: true,
  });
  return { userId: input.userId, role: input.role, roleVersion, changed: true };
}
