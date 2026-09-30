import assert from 'node:assert/strict';
import test from 'node:test';
import { addTeamSelection, canEditSurveyRole, removeTeamSelection, supportedTeamRoles } from '@/lib/team-management-view';
import type { TeamPerson } from '@/modules/tenancy/application/survey-teams';
import type { UUID } from '@/shared/types';

const person=(index:number):TeamPerson=>({userId:`person-${index}` as UUID,name:`Person ${index}`,email:`person-${index}@example.test`,role:'INSTRUMENT_MAN',active:true});
test('bounded search selections retain earlier pages and deduplicate users',()=>{
  const first=[person(1)], selected=addTeamSelection(first,person(20));
  assert.equal(first.length,1);assert.deepEqual(selected.map(item=>item.userId),['person-1','person-20']);
  assert.equal(addTeamSelection(selected,person(1)),selected);
});
test('team selection preserves the current lead and caps selected membership at 100',()=>{
  const selected=Array.from({length:100},(_,index)=>person(index));
  assert.equal(addTeamSelection(selected,person(200)),selected);
  assert.equal(removeTeamSelection(selected,'person-0','person-0'),selected);
  assert.equal(removeTeamSelection(selected,'person-0','person-1').length,99);
});
test('role controls reflect fixed crew-build tiers and protect unrelated authority roles',()=>{
  assert.deepEqual(supportedTeamRoles('FULL'),['SURVEY_SUPERINTENDENT','PARTY_CHIEF','INSTRUMENT_MAN']);
  assert.deepEqual(supportedTeamRoles('MEDIUM'),['PARTY_CHIEF','INSTRUMENT_MAN']);
  assert.deepEqual(supportedTeamRoles('SLIM'),['INSTRUMENT_MAN']);
  for(const role of ['SURVEY_MANAGER','PROJECT_ADMIN','DEPARTMENT_MANAGER','AREA_VIEWER'] as const) assert.equal(canEditSurveyRole(role),false);
  for(const role of ['SURVEY_SUPERINTENDENT','PARTY_CHIEF','INSTRUMENT_MAN','REQUESTER','VIEWER'] as const) assert.equal(canEditSurveyRole(role),true);
});
