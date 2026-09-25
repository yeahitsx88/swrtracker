import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Client } from 'pg';
import type { UUID, DbClient } from '@/shared/types';
import { listAssignmentCandidates } from '@/modules/tenancy/application/assignment-candidates';
import { AssignmentCandidatesRepository } from '@/modules/tenancy/infrastructure/assignment-candidates.repository';
import { getAssignmentOptions } from '@/modules/ticket/application/assignment-options';
import type { ITicketRepository, VisibilityScope } from '@/modules/ticket/application/ports';
import type { Ticket } from '@/modules/ticket/domain/types';

const id = () => randomUUID() as UUID;
test('candidate names are scoped by tenant, project, active user, role and ancestor assignment before pagination',
  { skip: !process.env.DATABASE_URL }, async () => {
  const db = new Client({ connectionString: process.env.DATABASE_URL }); await db.connect(); await db.query('BEGIN');
  const tenant=id(),foreign=id(),company=id(),project=id(),other=id(),level=id(),root=id(),child=id();
    const pc=id(),outside=id(),inactive=id(),im=id(),superintendent=id();
  try {
    await db.query("INSERT INTO tenants(id,name) VALUES($1,'Candidates'),($2,'Foreign')",[tenant,foreign]);
    await db.query("INSERT INTO companies(id,tenant_id,name,type) VALUES($1,$2,'GC','GC')",[company,tenant]);
    await db.query("INSERT INTO projects(id,tenant_id,name,status) VALUES($1,$3,'Active','ACTIVE'),($2,$3,'Other','ACTIVE')",[project,other,tenant]);
    for(const [user,name,role] of [[pc,'A scoped chief','PARTY_CHIEF'],[outside,'B other chief','PARTY_CHIEF'],[inactive,'C inactive','PARTY_CHIEF'],[im,'D instrument','INSTRUMENT_MAN'],[superintendent,'E superintendent','SURVEY_SUPERINTENDENT']]) {
      await db.query('INSERT INTO users(id,tenant_id,company_id,email,name) VALUES($1,$2,$3,$4,$5)',[user,tenant,company,user+'@example.test',name]);
      await db.query('INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,$3)',[project,user,role]);
    }
    await db.query('UPDATE users SET deactivated_at=NOW() WHERE id=$1',[inactive]);
    await db.query("INSERT INTO aor_levels(id,project_id,tenant_id,depth,label) VALUES($1,$2,$3,0,'Area')",[level,project,tenant]);
    await db.query("INSERT INTO aor_nodes(id,project_id,tenant_id,level_id,name,code,parent_id) VALUES($1,$3,$4,$5,'Root','ROOT',NULL),($2,$3,$4,$5,'Child','CHILD',$1)",[root,child,project,tenant,level]);
    await db.query('INSERT INTO aor_assignments(project_id,tenant_id,user_id,aor_node_id) VALUES($1,$2,$3,$4)',[project,tenant,pc,root]);
    const repo=new AssignmentCandidatesRepository();
    const params={tenantId:tenant,projectId:project,role:'PARTY_CHIEF' as const,aorNodeId:null,search:'',limit:1,offset:0};
    assert.deepEqual(await listAssignmentCandidates(repo,db,params),{candidates:[{id:pc,name:'A scoped chief'}],hasMore:true});
    assert.equal((await listAssignmentCandidates(repo,db,{...params,offset:1})).candidates[0]!.id,outside);
    assert.deepEqual((await listAssignmentCandidates(repo,db,{...params,aorNodeId:child,limit:20})).candidates,[{id:pc,name:'A scoped chief'}]);
    assert.equal((await listAssignmentCandidates(repo,db,{...params,search:'OTHER'})).candidates[0]!.id,outside);
    assert.equal((await listAssignmentCandidates(repo,db,{...params,role:'INSTRUMENT_MAN'})).candidates[0]!.id,im);
    const superintendentQuery={...params,role:'SURVEY_SUPERINTENDENT' as const,aorNodeId:child};
    assert.deepEqual((await listAssignmentCandidates(repo,db,superintendentQuery)).candidates,[]);
    await db.query('INSERT INTO aor_assignments(project_id,tenant_id,user_id,aor_node_id) VALUES($1,$2,$3,$4)',[project,tenant,superintendent,root]);
    assert.deepEqual((await listAssignmentCandidates(repo,db,superintendentQuery)).candidates,[{id:superintendent,name:'E superintendent'}]);
    await db.query('UPDATE users SET deactivated_at=NOW() WHERE id=$1',[superintendent]);
    assert.deepEqual((await listAssignmentCandidates(repo,db,superintendentQuery)).candidates,[]);
    for(const overrides of [{tenantId:foreign},{projectId:other},{search:'%'}]) assert.deepEqual((await listAssignmentCandidates(repo,db,{...params,...overrides})).candidates,[]);
    await db.query('UPDATE aor_assignments SET deactivated_at=NOW() WHERE user_id=$1',[pc]);
    assert.deepEqual((await listAssignmentCandidates(repo,db,{...params,aorNodeId:child})).candidates,[]);
    await db.query("UPDATE projects SET status='ARCHIVED' WHERE id=$1",[project]);
    assert.deepEqual((await listAssignmentCandidates(repo,db,params)).candidates,[]);
    await assert.rejects(listAssignmentCandidates(repo,db,{...params,limit:0}),/Invalid candidate/);
  }finally{await db.query('ROLLBACK');await db.end();}
});

test('assignment options enforce visible ticket, state, role, active project and superintendent scope',async()=>{
  const tenant=id(),project=id(),node=id();
  const ticket={id:id(),tenantId:tenant,projectId:project,aorNodeId:node,status:'APPROVED',workflowVariant:'STANDARD_APPROVAL'} as Ticket;
  const actor:VisibilityScope={actorId:id(),actorRole:'SURVEY_MANAGER',companyId:id(),companyType:'GC'};
  const db:DbClient={async query(){throw new Error('No direct SQL');}};
  const repo={findById:async()=>ticket,findActiveProjectCrewBuild:async()=> 'MEDIUM',isAorNodeInSurveyRoleScope:async()=>true} as unknown as ITicketRepository;
  let scope:UUID|null=null;
  const candidates={async list(_db:DbClient,p:{aorNodeId:UUID|null}){scope=p.aorNodeId;return [];}};
  const params={tenantId:tenant,ticketId:ticket.id,actor,role:'PARTY_CHIEF' as const,search:'',limit:20,offset:0};
  assert.equal((await getAssignmentOptions(repo,candidates,db,params)).crewBuild,'MEDIUM');assert.equal(scope,null);
  await getAssignmentOptions(repo,candidates,db,{...params,actor:{...actor,actorRole:'SURVEY_SUPERINTENDENT'}});assert.equal(scope,node);
  await assert.rejects(getAssignmentOptions(repo,candidates,db,{...params,actor:{...actor,actorRole:'REQUESTER'}}),/required/);
  await assert.rejects(getAssignmentOptions({...repo,findById:async()=>null},candidates,db,params),/not found/);
  await assert.rejects(getAssignmentOptions({...repo,findById:async()=>({...ticket,status:'SUBMITTED'})},candidates,db,params));
  await assert.rejects(getAssignmentOptions({...repo,findActiveProjectCrewBuild:async()=>null},candidates,db,params),/not active/);
  await assert.rejects(getAssignmentOptions({...repo,isAorNodeInSurveyRoleScope:async()=>false},candidates,db,{...params,actor:{...actor,actorRole:'SURVEY_SUPERINTENDENT'}}),/outside/);
  assert.deepEqual((await getAssignmentOptions({...repo,findActiveProjectCrewBuild:async()=> 'SLIM'},candidates,db,params)).candidates,[]);
});
