import type { SurveyOrganization } from '@/modules/tenancy/application/read-survey-organization';
import type { Person, SurveyRole } from './fixtures';

const roles: Record<string, SurveyRole> = { SURVEY_MANAGER: 'Survey Manager', SURVEY_SUPERINTENDENT: 'Survey Superintendent', PARTY_CHIEF: 'Party Chief', INSTRUMENT_MAN: 'Instrument Man' };
export interface LiveChartPerson extends Person { details: string[]; retainedCrew: string[] }
const areaLabel = (area: { name: string; retired?: boolean }) => `${area.name}${area.retired ? ' (retired)' : ''}`;

/** Edges represent explicit current reporting/roster evidence only.
 * Leadership, named teams and Area coverage are separate facts, never parent inference.
 */
export function organizationChartPeople(data: SurveyOrganization): LiveChartPerson[] {
  const people = data.personnel.filter(person => person.active && roles[person.role]).map((person): LiveChartPerson => {
    const team = data.teams.find(team => team.id === person.teamId);
    const detail = data.staffing.find(staffing => staffing.partyChiefId === person.userId);
    const coverage = data.superintendentAreas.find(value => value.superintendentId === person.userId);
    const details: string[] = [];
    if (team) {
      details.push(`Named team: ${team.name}${team.lead.userId === person.userId ? ' (lead)' : ''}`);
      details.push(`Team Areas: ${team.areas?.map(areaLabel).join(', ') || 'none recorded'}`);
    } else details.push('Named team: none');
    if (coverage) {
      details.push(`Individual Area assignments: ${coverage.assignments.map(area => areaLabel({ name: area.areaName, retired: area.retired })).join(', ') || 'none'}`);
      if (coverage.sharedDepartmentAssignmentCount) details.push(`${coverage.sharedDepartmentAssignmentCount} shared department Area assignment(s); this chart does not expand department coverage.`);
    }
    if (detail) {
      if(!data.scope)details.push(`Assigned Areas: ${detail.areas.data.map(areaLabel).join(', ') || 'none'}`);
      details.push(detail.reporting ? `Explicit reporting: ${detail.reporting.superintendent.name} · ${areaLabel(detail.reporting.area)}${!detail.reporting.superintendent.active || detail.reporting.superintendent.role !== 'SURVEY_SUPERINTENDENT' || !data.personnel.some(member => member.userId === detail.reporting!.superintendent.userId && member.active && member.role === 'SURVEY_SUPERINTENDENT') ? ' (outside current Superintendent population)' : ''}` : data.scope ? 'No explicit reporting link to you is shown; named-team membership does not create one.' : 'Explicit Superintendent reporting link: none');
    }
    const retainedCrew = detail?.instrumentMen.filter(member => !member.active || member.role !== 'INSTRUMENT_MAN' || !data.personnel.some(value => value.userId === member.userId && value.role === 'INSTRUMENT_MAN' && value.active))
      .map(member => `${member.name} (${member.role?.replaceAll('_', ' ') ?? 'no project role'}${member.active ? '' : ', inactive access'})`) ?? [];
    return { id: person.userId, name: person.name, role: roles[person.role]!, parentId: null, details, retainedCrew };
  });
  for (const person of people) {
    if (person.role === 'Party Chief') {
      const reporting = data.staffing.find(detail => detail.partyChiefId === person.id)?.reporting;
      if (reporting && reporting.superintendent.active && reporting.superintendent.role === 'SURVEY_SUPERINTENDENT' && people.some(value => value.id === reporting.superintendent.userId && value.role === 'Survey Superintendent')) person.parentId = reporting.superintendent.userId;
    }
    if (person.role === 'Instrument Man') {
      const crew = data.staffing.find(detail => detail.instrumentMen.some(member => member.userId === person.id && member.role === 'INSTRUMENT_MAN' && member.active));
      if (crew && people.some(value => value.id === crew.partyChiefId && value.role === 'Party Chief')) person.parentId = crew.partyChiefId;
      person.details.push(person.parentId ? `Crew Chief: ${people.find(value => value.id === person.parentId)!.name}` : 'No eligible Chief crew link is shown; this does not establish availability.');
    }
  }
  return people;
}
