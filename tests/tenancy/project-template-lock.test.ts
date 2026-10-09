import test from 'node:test';
import assert from 'node:assert/strict';
import {selectProjectTemplate} from '../../src/modules/tenancy/application/project-administration';
import type {AuthContext} from '../../src/lib/auth';
import type {DbClient,UUID} from '../../src/shared/types';
const auth={tenantId:'tenant' as UUID,userId:'admin' as UUID,sessionVersion:1} as AuthContext;
function fixture(centralIT:boolean,status:string,enabled=true){
 const queries:string[]=[];
 const db:DbClient={query:async<T extends object>(sql:string,params?:unknown[])=>{
  queries.push(sql);
  let rows:object[]=[];
  if(sql.includes('pg_current_xact_id'))rows=[{transaction_id:'1'}];
  else if(sql.includes('FROM tenants'))rows=[{id:auth.tenantId}];
  else if(sql.includes('COALESCE(session_version'))rows=[{session_version:1,deactivated_at:null}];
  else if(sql.includes('AS project_exists')){assert.deepEqual(params,[auth.tenantId,'project',auth.userId]);rows=[{project_exists:true,role:'REQUESTER',access_disabled_at:null,company_type:'GC',central_it:centralIT,project_admin:enabled}];}
  else if(sql.includes('project_preparation_cancellations'))rows=[];
  else if(sql.includes('FROM projects'))rows=[{status,activated_at:null}];
  else assert.fail('Unexpected query: '+sql);
  return {rows:rows as T[]};
 }};
 return {db,queries};
}
test('Project Admin cannot switch governing template in SETUP or ACTIVE',async()=>{
 for(const status of ['SETUP','ACTIVE']){const f=fixture(false,status);await assert.rejects(()=>selectProjectTemplate(f.db,auth,'project' as UUID,'template' as UUID),{name:'ForbiddenError'});assert.ok(f.queries.every(sql=>!/^INSERT|^UPDATE|^DELETE/.test(sql)));}
});
test('Central cannot switch an established template through the legacy command',async()=>{
 for(const status of ['SETUP','ACTIVE']){const f=fixture(true,status);await assert.rejects(()=>selectProjectTemplate(f.db,auth,'project' as UUID,'template' as UUID),{name:'ConflictError',code:'PROJECT_TEMPLATE_LOCKED'});assert.ok(f.queries.every(sql=>!/^INSERT|^UPDATE|^DELETE/.test(sql)));}
});
test('Archived projects retain their read-only gate and revoked administration is denied',async()=>{
 await assert.rejects(()=>selectProjectTemplate(fixture(true,'ARCHIVED').db,auth,'project' as UUID,'template' as UUID),{name:'ConflictError'});
 await assert.rejects(()=>selectProjectTemplate(fixture(false,'SETUP',false).db,auth,'project' as UUID,'template' as UUID),{name:'ForbiddenError'});
});
