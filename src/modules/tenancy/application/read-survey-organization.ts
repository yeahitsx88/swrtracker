import { ConflictError, ForbiddenError } from '@/shared/errors';
import type { DbClient, Page, UUID } from '@/shared/types';
import type { AuthContext } from '@/lib/auth';
import { readTeamContext, readTeamPersonnel, readSurveyTeams, type SurveyTeamsRepository, type TeamActor, type TeamPerson, type TeamPersonnel, type SurveyTeamDetail, type TeamPageQuery } from './survey-teams';
import { readSurveyStaffing, type SurveyStaffingReadRepository, type SurveyStaffingDetail, type StaffingPerson } from './read-survey-staffing';
import { readSuperintendentAreas } from './read-superintendent-areas';
import type { SuperintendentAreaRepository, SuperintendentAreaAssignment } from './superintendent-area.types';

export type OrganizationPerson = Pick<TeamPerson, 'userId' | 'name' | 'role' | 'active'>;
export type OrganizationLinkedPerson = Pick<StaffingPerson, 'userId' | 'name' | 'role' | 'active'>;
export interface SurveyOrganization {
  projectId: UUID;
  project: Awaited<ReturnType<typeof readTeamContext>>['project'];
  personnel: Array<OrganizationPerson & Pick<TeamPersonnel, 'teamId' | 'teamName'>>;
  teams: Array<Omit<SurveyTeamDetail, 'lead' | 'members'> & { lead: OrganizationPerson; members: OrganizationPerson[] }>;
  staffing: Array<{
    partyChiefId: UUID;
    reporting: null | { id: UUID; superintendent: OrganizationLinkedPerson; area: NonNullable<SurveyStaffingDetail['reporting']>['area'] };
    areas: SurveyStaffingDetail['areas'];
    instrumentMen: OrganizationLinkedPerson[];
  }>;
  superintendentAreas: Array<{
    superintendentId: UUID;
    assignments: Array<Pick<SuperintendentAreaAssignment, 'assignmentId' | 'areaId' | 'areaName' | 'retired' | 'depth' | 'parentId'>>;
    sharedDepartmentAssignmentCount: number;
  }>;
}

export interface OrganizationReadRepositories {
  teams: SurveyTeamsRepository;
  staffing: SurveyStaffingReadRepository;
  superintendentAreas: Pick<SuperintendentAreaRepository, 'readPage'>;
}

// A bounded, complete display or an explicit error, never a silently partial tree.
export const organizationLimits = { personnel: 500, teams: 200, roster: 500, superintendentAreas: 500 } as const;
export async function readOrganizationPages<T>(read: (query: TeamPageQuery) => Promise<Page<T>>, maximum: number, label: string): Promise<T[]> {
  const items: T[] = [];
  let total: number | undefined;
  do {
    const page = await read({ search: '', limit: 100, offset: items.length });
    if (!Number.isSafeInteger(page.total) || page.total < 0 || page.total > maximum) {
      throw new ConflictError(`The organization chart supports up to ${maximum} ${label}. Use the existing Team Management lists for this project.`, 'ORG_CHART_LIMIT');
    }
    if (total !== undefined && total !== page.total || page.offset !== items.length || page.data.length > 100 ||
        page.data.length === 0 && items.length < page.total || items.length + page.data.length > page.total) {
      throw new ConflictError('Hierarchy data changed or is incomplete. Reload the organization chart.', 'ORG_CHART_INCOMPLETE');
    }
    total = page.total;
    items.push(...page.data);
  } while (items.length < total);
  return items;
}

const person = (value: TeamPerson | StaffingPerson): OrganizationLinkedPerson => ({ userId: value.userId, name: value.name, role: value.role, active: value.active });

/** Caller owns a read-only repeatable-read transaction and current project authorization.
 * Reuse existing Manager reads; named teams, Area overlap and tickets never create edges.
 */
export async function readSurveyOrganization(repos: OrganizationReadRepositories, db: DbClient, actor: TeamActor, auth: AuthContext): Promise<SurveyOrganization> {
  if (actor.actorRole !== 'SURVEY_MANAGER') throw new ForbiddenError('Only the Survey Manager can review the project organization chart');
  const { project } = await readTeamContext(repos.teams, db, actor);
  const personnel = await readOrganizationPages(query => readTeamPersonnel(repos.teams, db, actor, query), organizationLimits.personnel, 'survey personnel');
  const summaries = await readOrganizationPages(async query => {
    const page = await readSurveyTeams(repos.teams, db, actor, query);
    if ('team' in page) throw new Error('Expected a team page');
    return page;
  }, organizationLimits.teams, 'named teams');
  const teams: SurveyOrganization['teams'] = [];
  for (const summary of summaries) {
    const result = await readSurveyTeams(repos.teams, db, actor, { search: '', limit: 100, offset: 0 }, summary.id);
    if (!('team' in result)) throw new Error('Expected team detail');
    teams.push({ ...result.team, lead: person(result.team.lead) as OrganizationPerson, members: result.team.members.map(value => person(value) as OrganizationPerson) });
  }
  const staffing: SurveyOrganization['staffing'] = [];
  const superintendentAreas: SurveyOrganization['superintendentAreas'] = [];
  for (const member of personnel) {
    if (member.role === 'PARTY_CHIEF') {
      let detail: SurveyStaffingDetail | undefined;
      const instrumentMen = await readOrganizationPages(async query => {
        detail = await readSurveyStaffing(repos.staffing, db, { tenantId: actor.tenantId, projectId: actor.projectId, actorRole: actor.actorRole, partyChiefId: member.userId, query });
        return detail.instrumentMen;
      }, organizationLimits.roster, 'crew links per Party Chief');
      if (!detail) throw new Error('Expected staffing detail');
      if (detail.areas.truncated) throw new ConflictError('This Chief has more than 100 assigned Areas. Review the existing staffing evidence; the chart cannot display a complete hierarchy.', 'ORG_CHART_LIMIT');
      staffing.push({ partyChiefId: member.userId, reporting: detail.reporting ? { id: detail.reporting.id, superintendent: person(detail.reporting.superintendent), area: detail.reporting.area } : null,
        areas: detail.areas, instrumentMen: instrumentMen.map(person) });
    }
    if (member.role === 'SURVEY_SUPERINTENDENT') {
      let sharedDepartmentAssignmentCount = 0;
      const assignments = await readOrganizationPages(async query => {
        const result = await readSuperintendentAreas(repos.superintendentAreas, db, auth, actor.projectId, { mode: 'superintendent-areas', superintendentId: member.userId, query: { ...query, limit: 100 } });
        if (result.mode !== 'superintendent-areas') throw new Error('Expected Superintendent Area assignments');
        sharedDepartmentAssignmentCount = result.sharedDepartmentAssignmentCount;
        return result.assignments;
      }, organizationLimits.superintendentAreas, 'individual Area assignments per Superintendent');
      superintendentAreas.push({ superintendentId: member.userId, assignments: assignments.map(({ assignmentId, areaId, areaName, retired, depth, parentId }) => ({ assignmentId, areaId, areaName, retired, depth, parentId })), sharedDepartmentAssignmentCount });
    }
  }
  return { projectId: actor.projectId, project, personnel: personnel.map(({ userId, name, role, active, teamId, teamName }) => ({ userId, name, role, active, teamId, teamName })), teams, staffing, superintendentAreas };
}
