import assert from 'node:assert/strict';
import {Pool,type PoolClient} from 'pg';
import {randomUUID} from 'node:crypto';
import {readdir,readFile} from 'node:fs/promises';
import {NextRequest} from 'next/server';
import {signToken} from '../../src/lib/auth';
import {handlePostAorAssignments} from '../../src/app/api/projects/[projectId]/aor/assignments/handler';
import {handlePostDepartmentMembers,handlePatchDepartmentMembers} from '../../src/app/api/projects/[projectId]/departments/[departmentId]/members/handler';
import {TenancyRepository} from '../../src/modules/tenancy/infrastructure/tenancy.repository';
import {getPool} from '../../src/lib/db';
import {acquireTenantLifecycleLock} from '../../src/lib/tenant-lifecycle-lock';
import type {UUID} from '../../src/shared/types';

async function main(){
 const url=new URL(process.env.DATABASE_URL??'');
 assert.equal(process.env.SWR_TEAM_POSTGRES,'1');assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'15489');assert.equal(url.pathname,'/swr_team_isolated');
 const schema='offboarding_subject_'+randomUUID().replaceAll('-','');
 assert.match(schema,/^offboarding_subject_[a-f0-9]{32}$/);
 const setup=new Pool({connectionString:url.href,max:1});
 const app=getPool(),oldQuery=app.query,oldConnect=app.connect;
 let created=false,pg:Pool|undefined,holder:PoolClient|undefined,waiter:PoolClient|undefined,checks=0;
 try{
  const db=await setup.connect();
  // Migration042 commits its wrapper; retain session schema for later migrations.
  try{await db.query('BEGIN');await db.query('CREATE SCHEMA "'+schema+'"');await db.query('SET search_path TO "'+schema+'",public');
   for(const file of (await readdir('db/migrations')).filter(name=>name.endsWith('.sql')).sort()){await db.query(await readFile('db/migrations/'+file,'utf8'));assert.equal((await db.query('SELECT current_schema() AS name')).rows[0].name,schema,'Migration must stay in the newly owned schema');}
   await db.query('COMMIT');created=true;
  }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
  pg=new Pool({connectionString:url.href,max:5,options:'-c search_path='+schema+',public'});
  const tenant=randomUUID() as UUID,project=randomUUID() as UUID,company=randomUUID() as UUID,recipient=randomUUID() as UUID,actor=randomUUID() as UUID,chief=randomUUID() as UUID;
  await pg.query("INSERT INTO tenants(id,name) VALUES($1,'Worker fixture')",[tenant]);
  await pg.query("INSERT INTO companies(id,tenant_id,name,type) VALUES($1,$2,'Synthetic GC','GC')",[company,tenant]);
  await pg.query("INSERT INTO projects(id,tenant_id,name,status,crew_build) VALUES($1,$2,'Synthetic worker','SETUP','FULL')",[project,tenant]);
  for(const user of [recipient,actor,chief])await pg.query("INSERT INTO users(id,tenant_id,company_id,email,name,password_hash) VALUES($1,$2,$3,$4,'Synthetic user','fixture')",[user,tenant,company,user+'@example.invalid']);
  await pg.query("INSERT INTO tenant_memberships(tenant_id,user_id,role) VALUES($1,$2,'TENANT_ADMIN')",[tenant,actor]);
  await pg.query("INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,'REQUESTER'),($1,$3,'PARTY_CHIEF')",[project,recipient,chief]);
  await pg.query("INSERT INTO project_admin_grants(tenant_id,project_id,user_id,origin,granted_by) VALUES($1,$2,$3,'EXPLICIT',$4)",[tenant,project,recipient,actor]);
  await pg.query('UPDATE users SET deactivated_at=now(),deactivated_by=$2 WHERE id=$1',[chief,actor]);
  const area=randomUUID(),level=randomUUID();
  await pg.query("INSERT INTO aor_levels(id,tenant_id,project_id,depth,label) VALUES($1,$2,$3,0,'Area')",[level,tenant,project]);
  await pg.query("INSERT INTO aor_nodes(id,tenant_id,project_id,level_id,name,code) VALUES($1,$2,$3,$4,'Synthetic Area','SYN')",[area,tenant,project,level]);

  await pg.query("INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,'SURVEY_MANAGER')",[project,actor]);
  const department=randomUUID(),destination=randomUUID(),oldLink=randomUUID();
  for(const dep of [department,destination])await pg.query("INSERT INTO departments(id,tenant_id,project_id,name,manager_title,created_by) VALUES($1,$2,$3,$4,'Manager',$5)",[dep,tenant,project,dep,actor]);
  await pg.query("INSERT INTO department_titles(tenant_id,department_id,title,default_priority,assignment_layer) VALUES($1,$2,'Synthetic manager','NORMAL','MANAGER')",[tenant,department]);
  await pg.query('INSERT INTO aor_assignments(id,tenant_id,project_id,user_id,aor_node_id) VALUES($1,$2,$3,$4,$5)',[oldLink,tenant,project,recipient,area]);
  holder=await pg.connect();waiter=await pg.connect();
  const h=holder,w=waiter,hpid=(await h.query('SELECT pg_backend_pid() AS pid')).rows[0].pid,wpid=(await w.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
  const queries:string[]=[];
  app.query=pg.query.bind(pg) as typeof app.query;
  app.connect=(async()=>({query:async(sql:string,params?:unknown[])=>{queries.push(sql);const result=await w.query(sql,params);if(sql==='BEGIN')await w.query('SET LOCAL statement_timeout=6000');return result;},release:()=>{}})) as typeof app.connect;
  const oldSecret=process.env.JWT_SECRET;process.env.JWT_SECRET='synthetic-subject-regression-only';
  try{
   const domain=async()=>{const result:Record<string,unknown>={};for(const table of ['department_memberships','aor_assignments','administrative_events','api_idempotency'])result[table]=(await pg!.query('SELECT to_jsonb(t) AS row FROM '+table+' t ORDER BY to_jsonb(t)::text')).rows;return result;};
   const repository=new TenancyRepository();
   assert.equal(await repository.isActiveProjectMember(pg,tenant,project,recipient),true);checks++;
   assert.equal(await repository.isActiveProjectMember(pg,randomUUID() as UUID,project,recipient),false);checks++;
   assert.equal(await repository.isActiveProjectMember(pg,tenant,randomUUID() as UUID,recipient),false);checks++;
   const cases=[
    {name:'area',method:'POST',handler:handlePostAorAssignments,departmentId:department,body:{kind:'USER',userId:recipient,aorNodeId:area,deactivateAssignmentIds:[oldLink]}},
    {name:'department-add',method:'POST',handler:handlePostDepartmentMembers,departmentId:department,body:{userId:recipient}},
    {name:'department-title',method:'PATCH',handler:handlePatchDepartmentMembers,departmentId:department,body:{kind:'ASSIGN_TITLE',userId:recipient,title:'Synthetic manager'}},
    {name:'department-move',method:'PATCH',handler:handlePatchDepartmentMembers,departmentId:destination,body:{kind:'REASSIGN_MEMBER',userId:recipient}},
   ] as const;
   for(const item of cases){
    // Only this uniquely owned synthetic schema is reset between distinct scenarios.
    await pg.query('DELETE FROM department_memberships WHERE user_id=$1',[recipient]);
    if(item.name==='department-title'||item.name==='department-move')await pg.query('INSERT INTO department_memberships(tenant_id,project_id,user_id,department_id) VALUES($1,$2,$3,$4)',[tenant,project,recipient,department]);
    for(const scope of ['GLOBAL','LOCAL'] as const){
     await pg.query('UPDATE users SET deactivated_at=NULL,deactivated_by=NULL,session_version=1 WHERE id=$1',[recipient]);
     await pg.query('UPDATE project_memberships SET access_disabled_at=NULL,access_disabled_by=NULL WHERE project_id=$1 AND user_id=$2',[project,recipient]);
     const before=await domain();queries.length=0;
     await h.query('BEGIN');await acquireTenantLifecycleLock(h,tenant,'EXCLUSIVE');
     const request=()=>new NextRequest('http://localhost/api/projects/'+project+'/'+item.name,{method:item.method,headers:{cookie:'swr_session='+signToken(actor,tenant,1),'content-type':'application/json'},body:JSON.stringify(item.body)});
     const ctx={params:Promise.resolve({projectId:project,departmentId:item.departmentId})};
     const pending=item.handler(request(),ctx);
     let blocked=false;const deadline=Date.now()+3000;
     while(Date.now()<deadline){if((await pg.query('SELECT $2::int=ANY(pg_blocking_pids($1::int)) AS blocked',[wpid,hpid])).rows[0].blocked){blocked=true;break;}await new Promise(resolve=>setTimeout(resolve,10));}
     if(!blocked){await h.query('ROLLBACK');const response=await pending;throw Error(item.name+' did not wait; response '+response.status);}checks++;
     if(scope==='GLOBAL')await h.query('UPDATE users SET deactivated_at=now(),deactivated_by=$2,session_version=session_version+1 WHERE id=$1',[recipient,actor]);
     else {await h.query('UPDATE project_memberships SET access_disabled_at=now(),access_disabled_by=$3 WHERE project_id=$1 AND user_id=$2',[project,recipient,actor]);await h.query('UPDATE users SET session_version=session_version+1 WHERE id=$1',[recipient]);}
     await h.query('COMMIT');
     const response=await pending;assert.equal(response.status,404,item.name+' '+scope+' disabled subject rejected');checks++;
     assert.equal(await repository.isActiveProjectMember(pg,tenant,project,recipient),false);checks++;
     assert.deepEqual(await domain(),before,item.name+' preserves duty/history/audit state');checks++;
     assert.ok(queries.some(sql=>sql.includes('FROM tenants')&&sql.endsWith('FOR UPDATE')));checks++;
    }
    await pg.query('UPDATE users SET deactivated_at=NULL,deactivated_by=NULL,session_version=1 WHERE id=$1',[recipient]);
    await pg.query('UPDATE project_memberships SET access_disabled_at=NULL,access_disabled_by=NULL WHERE project_id=$1 AND user_id=$2',[project,recipient]);
    const request=new NextRequest('http://localhost/api/projects/'+project+'/'+item.name,{method:item.method,headers:{cookie:'swr_session='+signToken(actor,tenant,1),'content-type':'application/json'},body:JSON.stringify(item.body)});
    const positive=await item.handler(request,{params:Promise.resolve({projectId:project,departmentId:item.departmentId})});
    assert.equal(positive.status,item.method==='POST'?201:200,item.name+' positive current subject');checks++;
   }
   await pg.query('UPDATE department_memberships SET department_id=$2,deactivated_at=now() WHERE user_id=$1',[recipient,department]);
   for(const item of cases.filter(item=>item.name==='department-title'||item.name==='department-move')){
    const before=await domain();
    const request=new NextRequest('http://localhost/api/projects/'+project+'/'+item.name,{method:item.method,headers:{cookie:'swr_session='+signToken(actor,tenant,1),'content-type':'application/json'},body:JSON.stringify(item.body)});
    const response=await item.handler(request,{params:Promise.resolve({projectId:project,departmentId:item.departmentId})});
    assert.equal(response.status,409,'inactive retained department membership cannot be altered');checks++;
    assert.deepEqual(await domain(),before);checks++;
   }
   await pg.query('UPDATE department_memberships SET deactivated_at=NULL WHERE user_id=$1',[recipient]);
   await pg.query('DELETE FROM tenant_memberships WHERE user_id=$1',[actor]);
   await pg.query("UPDATE project_memberships SET role='DEPARTMENT_LEAD' WHERE user_id=$1",[actor]);
   await pg.query('INSERT INTO department_memberships(tenant_id,project_id,user_id,department_id,deactivated_at) VALUES($1,$2,$3,$4,now())',[tenant,project,actor,department]);
   const beforeAuthority=await domain();
   const request=new NextRequest('http://localhost/api/projects/'+project+'/department-title',{method:'PATCH',headers:{cookie:'swr_session='+signToken(actor,tenant,1),'content-type':'application/json'},body:JSON.stringify({kind:'ASSIGN_TITLE',userId:recipient,title:'Synthetic manager'})});
   const response=await handlePatchDepartmentMembers(request,{params:Promise.resolve({projectId:project,departmentId:department})});
   assert.equal(response.status,403,'inactive department scope cannot confer authority');checks++;
   assert.deepEqual(await domain(),beforeAuthority);checks++;
   const sc=randomUUID(),subcontractor=randomUUID() as UUID;
   await pg.query("INSERT INTO companies(id,tenant_id,name,type) VALUES($1,$2,'Synthetic subcontractor','SUBCONTRACTOR')",[sc,tenant]);
   await pg.query("INSERT INTO users(id,tenant_id,company_id,email,name,password_hash) VALUES($1,$2,$3,$4,'Synthetic subcontractor','fixture')",[subcontractor,tenant,sc,subcontractor+'@example.invalid']);
   await pg.query("INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,'INSTRUMENT_MAN')",[project,subcontractor]);
   assert.equal(await repository.isActiveProjectMember(pg,tenant,project,subcontractor),false,'invalid elevated subcontractor role is not effective');checks++;
   await pg.query("UPDATE project_memberships SET role='REQUESTER' WHERE user_id=$1",[subcontractor]);
   assert.equal(await repository.isActiveProjectMember(pg,tenant,project,subcontractor),true,'active subcontractor Requester remains eligible');checks++;
   const foreign=randomUUID() as UUID,fc=randomUUID(),fu=randomUUID() as UUID;
   await pg.query("INSERT INTO tenants(id,name) VALUES($1,'Foreign subject fixture')",[foreign]);
   await pg.query("INSERT INTO companies(id,tenant_id,name,type) VALUES($1,$2,'Foreign GC','GC')",[fc,foreign]);
   await pg.query("INSERT INTO users(id,tenant_id,company_id,email,name,password_hash) VALUES($1,$2,$3,$4,'Foreign fixture','fixture')",[fu,foreign,fc,fu+'@example.invalid']);
   // Migration031 rejects cross-tenant scalar links; current subject lookup also stays bounded.
   await assert.rejects(()=>pg!.query("INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,'REQUESTER')",[project,fu]),(error:unknown)=>(error as {code?:string}).code==='23503');checks++;
   assert.equal(await repository.isActiveProjectMember(pg,tenant,project,fu),false,'foreign-tenant account remains ineligible');checks++;
   console.log('Active duty subject PostgreSQL checks passed: '+checks);
  }finally{if(oldSecret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=oldSecret;}
 }finally{
  app.query=oldQuery;app.connect=oldConnect;
  if(holder){await holder.query('ROLLBACK');holder.release();}if(waiter){await waiter.query('ROLLBACK');waiter.release();}
  if(pg)await pg.end();
  if(created){assert.match(schema,/^offboarding_subject_[a-f0-9]{32}$/);await setup.query('DROP SCHEMA "'+schema+'" CASCADE');}await setup.end();
 }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
