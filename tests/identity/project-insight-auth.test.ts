import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveProjectInsightRole} from '@/lib/project-insight-auth';
import type {DbClient,UUID} from '@/shared/types';
const tenant='10000000-0000-4000-8000-000000000001' as UUID,user='10000000-0000-4000-8000-000000000002' as UUID,project='10000000-0000-4000-8000-000000000003' as UUID;
const auth={tenantId:tenant,userId:user,sessionVersion:1};
function fixture(overrides:Record<string,unknown>={},sessionVersion=1):DbClient{
 const state={project_exists:true,role:'PARTY_CHIEF',access_disabled_at:null,company_type:'GC',central_it:false,project_admin:false,...overrides};
 return {async query<T extends object>(sql:string,params?:unknown[]){if(sql.includes('COALESCE(session_version')){assert.deepEqual(params,[tenant,user]);return {rows:[{session_version:sessionVersion,deactivated_at:null}] as unknown as T[]};}assert.deepEqual(params,[tenant,project,user]);return {rows:[state] as unknown as T[]};}};
}
test('member analytics retains current Survey authority alongside independent local and Central grants',async()=>{
 for(const role of ['SURVEY_MANAGER','SURVEY_SUPERINTENDENT','PARTY_CHIEF'])for(const [project_admin,central_it] of [[true,false],[false,true],[true,true]])assert.equal(await resolveProjectInsightRole(auth,project,fixture({role,project_admin,central_it}),true),role);
});
test('ordinary administrative insights preserve existing role selection',async()=>{
 assert.equal(await resolveProjectInsightRole(auth,project,fixture({project_admin:true})),'PROJECT_ADMIN');
 assert.equal(await resolveProjectInsightRole(auth,project,fixture({central_it:true})),'TENANT_ADMIN');
 assert.equal(await resolveProjectInsightRole(auth,project,fixture({role:'SURVEY_MANAGER',project_admin:true,central_it:true})),'SURVEY_MANAGER');
});
test('member analytics never restores disabled operational membership from an admin grant',async()=>{
 await assert.rejects(resolveProjectInsightRole(auth,project,fixture({access_disabled_at:new Date(),project_admin:true}),true),{type:'ForbiddenError'});
 assert.equal(await resolveProjectInsightRole(auth,project,fixture({access_disabled_at:new Date(),central_it:true}),true),'TENANT_ADMIN');
});
test('member analytics does not elevate unsupported or legacy roles',async()=>{
 for(const role of ['REQUESTER','VIEWER','INSTRUMENT_MAN'])assert.equal(await resolveProjectInsightRole(auth,project,fixture({role,project_admin:true,central_it:true}),true),role);
 assert.equal(await resolveProjectInsightRole(auth,project,fixture({role:'PROJECT_ADMIN',project_admin:true}),true),'PROJECT_ADMIN');
});
test('member analytics retains foreign project, company and current session checks',async()=>{
 await assert.rejects(resolveProjectInsightRole(auth,project,fixture({project_exists:false}),true),{type:'NotFoundError'});
 await assert.rejects(resolveProjectInsightRole(auth,project,fixture({company_type:'SUBCONTRACTOR',project_admin:true,central_it:true}),true),{type:'ForbiddenError'});
 await assert.rejects(resolveProjectInsightRole(auth,project,fixture({},2),true),{type:'UnauthorizedError'});
});
