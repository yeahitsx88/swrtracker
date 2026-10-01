import { ValidationError } from '@/shared/errors';
import type { ProjectRole } from '@/modules/identity/domain/types';
import type { WorkforcePerson } from '@/modules/tenancy/application/survey-workforce';
import type { MetricsFilters } from './metrics-filters';
/** Locks the member population independently of chart/date choices. */
export function memberMetricFocus(person:WorkforcePerson,role:ProjectRole,filters:MetricsFilters):Pick<MetricsFilters,'crewId'|'instrumentManId'>{
 if(role==='SURVEY_SUPERINTENDENT'&&filters.cohort&&filters.cohort!=='linkedCrews')throw new ValidationError('Member KPIs require the linked-crew population');
 const focus:Pick<MetricsFilters,'crewId'|'instrumentManId'>=person.role==='PARTY_CHIEF'?{crewId:person.userId}:person.role==='INSTRUMENT_MAN'?{instrumentManId:person.userId,...(role!=='SURVEY_MANAGER'&&person.partyChiefId?{crewId:person.partyChiefId}:{})}:{};
 for(const key of ['crewId','instrumentManId'] as const)if(focus[key]&&filters[key]&&focus[key]!==filters[key])throw new ValidationError('Personnel filters must match the selected member');
 return focus;
}
