import test from 'node:test';
import assert from 'node:assert/strict';
import type { DbClient, UUID } from '../../src/shared/types';
import { resolveProjectCapabilities, assertProjectAdministrator } from '../../src/lib/project-capabilities';

const tenant='10000000-0000-4000-8000-000000000001' as UUID;
const user='10000000-0000-4000-8000-000000000002' as UUID;
const project='10000000-0000-4000-8000-000000000003' as UUID;
const auth={tenantId:tenant,userId:user,sessionVersion:1};
function dbFixture(overrides: Record<string,unknown>={}): DbClient {
  const state={project_exists:true,role:'SURVEY_MANAGER',access_disabled_at:null,
    company_type:'GC',central_it:false,project_admin:false,...overrides};
  return {
    async query<T extends object>(sql:string,params?:unknown[]) {
      if(sql.includes('COALESCE(session_version')) {
        assert.deepEqual(params,[tenant,user]);
        return {rows:[{session_version:1,deactivated_at:null}] as unknown as T[]};
      }
      assert.deepEqual(params,[tenant,project,user]);
      return {rows:[state] as unknown as T[]};
    }
  };
}
test('manager_and_admin_are_independent',async()=>{
  assert.deepEqual(await resolveProjectCapabilities(dbFixture({project_admin:true,central_it:true}),auth,project),
    {operationalRole:'SURVEY_MANAGER',canAdminister:true,centralIT:true,accessDisabled:false});
});
test('manager_only_has_no_admin',async()=>{
  const db=dbFixture(); const caps=await resolveProjectCapabilities(db,auth,project);
  assert.equal(caps.operationalRole,'SURVEY_MANAGER'); assert.equal(caps.canAdminister,false);
  await assert.rejects(assertProjectAdministrator(db,auth,project),{type:'ForbiddenError'});
});
test('legacy_admin_has_no_manager',async()=>{
  const caps=await resolveProjectCapabilities(dbFixture({role:'PROJECT_ADMIN',project_admin:true}),auth,project);
  assert.equal(caps.operationalRole,'PROJECT_ADMIN'); assert.equal(caps.canAdminister,true);
});
test('disabled_grant_holder_loses_project_access',async()=>{
  const caps=await resolveProjectCapabilities(dbFixture({project_admin:true,access_disabled_at:new Date()}),auth,project);
  assert.deepEqual(caps,{operationalRole:null,canAdminister:false,centralIT:false,accessDisabled:true});
});
test('central_it_retains_explicit_tenant_support',async()=>{
  const caps=await resolveProjectCapabilities(dbFixture({central_it:true,access_disabled_at:new Date()}),auth,project);
  assert.deepEqual(caps,{operationalRole:null,canAdminister:true,centralIT:true,accessDisabled:true});
});
test('foreign_project_not_disclosed',async()=>{
  await assert.rejects(resolveProjectCapabilities(dbFixture({project_exists:false}),auth,project),{type:'NotFoundError'});
});
test('subcontractor_admin_grant_does_not_elevate',async()=>{
  const caps=await resolveProjectCapabilities(dbFixture({role:'REQUESTER',company_type:'SUBCONTRACTOR',project_admin:true,central_it:true}),auth,project);
  assert.deepEqual(caps,{operationalRole:'REQUESTER',canAdminister:false,centralIT:false,accessDisabled:false});
});
test('revoked_legacy_grant_does_not_leave_scalar_admin_authority',async()=>{
  const caps=await resolveProjectCapabilities(dbFixture({role:'PROJECT_ADMIN',project_admin:false}),auth,project);
  assert.equal(caps.operationalRole,null); assert.equal(caps.canAdminister,false);
});
