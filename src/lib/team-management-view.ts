import type { ProjectRole } from '@/modules/identity/domain/types';
import type { CrewBuild } from '@/modules/tenancy/domain/types';
import type { TeamPerson } from '@/modules/tenancy/application/survey-teams';

export const surveyRoleLabels: Partial<Record<ProjectRole, string>> = {
  SURVEY_SUPERINTENDENT: 'Survey Superintendent', PARTY_CHIEF: 'Party Chief', INSTRUMENT_MAN: 'Instrument Man',
  REQUESTER: 'Requester', VIEWER: 'Viewer', SURVEY_MANAGER: 'Survey Manager', PROJECT_ADMIN: 'Project Admin',
};
export const roleLabel = (role: ProjectRole) => surveyRoleLabels[role] ?? role.toLowerCase().replaceAll('_', ' ');
export function supportedTeamRoles(build: CrewBuild): ProjectRole[] {
  return build === 'FULL' ? ['SURVEY_SUPERINTENDENT','PARTY_CHIEF','INSTRUMENT_MAN'] :
    build === 'MEDIUM' ? ['PARTY_CHIEF','INSTRUMENT_MAN'] : ['INSTRUMENT_MAN'];
}
export function canEditSurveyRole(role: ProjectRole) {
  return ['VIEWER','REQUESTER','SURVEY_SUPERINTENDENT','PARTY_CHIEF','INSTRUMENT_MAN'].includes(role);
}
/** Keep selection independent of whichever bounded search page is displayed. */
export function addTeamSelection(selected: TeamPerson[], person: TeamPerson): TeamPerson[] {
  if (selected.some(member => member.userId === person.userId) || selected.length >= 100) return selected;
  return [...selected, person];
}
export function removeTeamSelection(selected: TeamPerson[], userId: string, leadId: string): TeamPerson[] {
  return userId === leadId ? selected : selected.filter(member => member.userId !== userId);
}
