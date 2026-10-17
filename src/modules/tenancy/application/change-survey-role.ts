import { ConflictError, NotFoundError, ValidationError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import type { ProjectRole } from '@/modules/identity/domain/types';
import { authorizeTeamMutation, type SurveyTeamsRepository, type TeamActor } from './survey-teams';
import { planPromotionWork, validateWorkDecisions, type PlannedWorkItem, type PromotionWorkItem, type WorkDecision } from '../domain/promotion-work';

export type ManagedSurveyRole = 'SURVEY_SUPERINTENDENT' | 'PARTY_CHIEF' | 'INSTRUMENT_MAN';
export interface ChangeSurveyRoleInput {
  userId: UUID;
  expectedRole: ProjectRole;
  expectedRoleVersion: number;
  role: ManagedSurveyRole;
  confirmRoleChanges: boolean;
  /** Decision 57 / D8: one reviewed decision per open request (keep or reassign). */
  work?: WorkDecision[];
}
/** Reads the person's open requests and reassigns one through the existing assignment rules. */
export interface PromotionWorkDeps {
  readWork(db: DbClient): Promise<PromotionWorkItem[]>;
  reassign(db: DbClient, item: PlannedWorkItem, replacementId: UUID): Promise<void>;
}
export interface OperationalRoleChangeInput extends Omit<ChangeSurveyRoleInput,'role'> { role: ManagedSurveyRole | 'REQUESTER' }
export interface SurveyRoleObligations {
  activeRequests: number; pendingDelegations: number; leadsTeam: boolean; areaAssignments: number; crewLinks: number; reportingLinks: number; responsibilityGrants: number; actingGrants: number;
}
export interface SurveyRoleRepository extends SurveyTeamsRepository {
  roleObligations(db: DbClient, tenantId: UUID, projectId: UUID, userId: UUID): Promise<SurveyRoleObligations>;
  changeOperationalRole(db: DbClient, actor: Pick<TeamActor,'tenantId'|'projectId'|'actorId'>, input: OperationalRoleChangeInput): Promise<number>;
}
const editableRoles = new Set<ProjectRole>(['SURVEY_SUPERINTENDENT','PARTY_CHIEF','INSTRUMENT_MAN']);

/** Changes only an existing project's fixed role; never account or tenant membership. */
export async function changeSurveyRole(repo: SurveyRoleRepository, db: DbClient, actor: TeamActor, input: ChangeSurveyRoleInput, workDeps?: PromotionWorkDeps) {
  const project = await authorizeTeamMutation(repo, db, actor);
  if (!editableRoles.has(input.role)) throw new ValidationError('Choose a survey department role. Project administrators manage other departments.');
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
  let work: Array<{ ticketId: string; part: string; action: string; replacementId?: string }> | undefined;
  if (input.work?.length) {
    if (!workDeps) throw new ValidationError('Reviewing open work is not available for this role change');
    // Structural duties (crew, reporting, Area, team lead, delegations) still resolve in Team Management first.
    assertResolvedSurveyRoleObligations({ ...obligations, activeRequests: 0 });
    const planned = planPromotionWork(await workDeps.readWork(db), input.role);
    validateWorkDecisions(planned, input.work, input.userId);
    for (const decision of input.work) {
      const item = planned.find(entry => entry.ticketId === decision.ticketId && entry.part === decision.part);
      if (item && decision.action === 'REASSIGN' && decision.replacementId) await workDeps.reassign(db, item, decision.replacementId as UUID);
    }
    const kept = input.work.filter(decision => decision.action === 'KEEP').length;
    const after = await repo.roleObligations(db, actor.tenantId, actor.projectId, input.userId);
    assertResolvedSurveyRoleObligations({ ...after, activeRequests: Math.max(0, after.activeRequests - kept) });
    work = input.work.map(({ ticketId, part, action, replacementId }) => ({ ticketId, part, action, ...(replacementId ? { replacementId } : {}) }));
  } else assertResolvedSurveyRoleObligations(obligations);
  const roleVersion = await repo.changeOperationalRole(db, actor, input);
  await repo.recordTeamEvent(db, actor, 'survey.role_changed', {
    userId: input.userId, previousRole: member.role, role: input.role, previousRoleVersion: member.roleVersion, roleVersion,
    retainedTeamId: member.teamId, confirmed: true,
    historicalTicketAssignmentsUnchanged: true,
    ...(work ? { work } : {}),
  });
  return { userId: input.userId, role: input.role, roleVersion, changed: true };
}

/** Same unresolved-duty rules for operational and independent administrative role commands. */
export function assertResolvedSurveyRoleObligations(obligations:SurveyRoleObligations):void {
  if(obligations.leadsTeam)throw new ConflictError('Choose a replacement team lead in Team Management before changing this role', 'SURVEY_TEAM_LEAD_OBLIGATION');
  if (obligations.activeRequests || obligations.pendingDelegations) throw new ConflictError('Resolve this person’s assigned field work, field-report reviews and team delegations through Survey Operations before changing their role', 'SURVEY_WORK_OBLIGATIONS');
  if (obligations.crewLinks || obligations.reportingLinks) {
    throw new ConflictError('Resolve this person’s active crew and reporting assignments before changing their role');
  }
  if (obligations.areaAssignments || obligations.responsibilityGrants || obligations.actingGrants) {
    throw new ConflictError('Resolve this person’s explicit Area, responsibility and acting grants before changing their role');
  }
}
