import test from 'node:test';
import assert from 'node:assert/strict';
import { accountNavigation } from '@/components/ui/account-navigation';
import type { ProjectRole } from '@/modules/identity/domain/types';
test('account Team Management navigation requires a current project survey supervisory role',()=>{
 for(const role of ['SURVEY_MANAGER','SURVEY_SUPERINTENDENT','PARTY_CHIEF'] as ProjectRole[]){
 assert.equal(accountNavigation('project-id',role).find(item=>item.label==='Team Management')?.href,'/projects/project-id/survey/teams');
 }
 for(const role of ['REQUESTER','INSTRUMENT_MAN','PROJECT_ADMIN','VIEWER'] as ProjectRole[])assert.equal(accountNavigation('project-id',role).some(item=>item.label==='Team Management'),false);
 assert.equal(accountNavigation(undefined,'SURVEY_MANAGER').some(item=>item.label==='Team Management'),false);
});
