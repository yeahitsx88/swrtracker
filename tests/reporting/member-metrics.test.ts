import test from 'node:test';
import assert from 'node:assert/strict';
import { memberMetricFocus } from '@/modules/reporting/application/member-metrics';
import { ValidationError } from '@/shared/errors';
import type { WorkforcePerson } from '@/modules/tenancy/application/survey-workforce';
const person:WorkforcePerson={userId:'im' as never,name:'IM',email:'im@example.test',role:'INSTRUMENT_MAN',partyChiefId:'chief' as never};
test('member drilldown binds an Instrument Man and their current Chief for field supervisors',()=>{
 assert.deepEqual(memberMetricFocus(person,'PARTY_CHIEF',{}),{instrumentManId:'im',crewId:'chief'});
 assert.deepEqual(memberMetricFocus(person,'SURVEY_SUPERINTENDENT',{cohort:'linkedCrews'}),{instrumentManId:'im',crewId:'chief'});
 assert.deepEqual(memberMetricFocus(person,'SURVEY_MANAGER',{}),{instrumentManId:'im'});
});
test('member drilldown rejects conflicting person filters and Area-wide Superintendent analytics',()=>{
 for(const filters of [{instrumentManId:'other'},{crewId:'other'},{cohort:'areaWorkload' as const}])assert.throws(()=>memberMetricFocus(person,'SURVEY_SUPERINTENDENT',filters),ValidationError);
});
