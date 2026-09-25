import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Client } from 'pg';
import { ForbiddenError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import type { ITenancyRepository } from '@/modules/tenancy/application/ports';
import type { ContinuityHealthRepositoryPort } from '@/modules/tenancy/application/continuity-health';
import { getProjectContinuityHealth } from '@/modules/tenancy/application/continuity-health';
import { ContinuityHealthRepository } from '@/modules/tenancy/infrastructure/continuity-health.repository';
import { TenancyRepository } from '@/modules/tenancy/infrastructure/tenancy.repository';

const id=()=>randomUUID() as UUID;
const tenantId=id(), projectId=id(), grantId=id(), actorId=id(), userId=id();
const db:DbClient={async query(){return {rows:[]};}};
const createdAt=new Date('2026-09-24T00:00:00Z');
const context={tenantId,projectId,actorRole:'PROJECT_ADMIN' as const};

test('acting confirmation and crew escalation switch on exactly 24h and 48h',async()=>{
  const repo={
    findProjectById:async()=>({status:'ACTIVE'}),
    listActiveActingGrants:async()=>[{id:grantId,userId,role:'SURVEY_MANAGER',
      scope:{projectId,actions:['manage_workflow']},confirmedAt:null,createdAt}],
  } as unknown as ITenancyRepository;
  const health={listUnresolvedCrewVacancies:async()=>[{
    eventId:id(),userId:actorId,role:'PARTY_CHIEF',detectedAt:createdAt,
    openTicketCount:1,uncoveredCrewCount:1,
  }]} as unknown as ContinuityHealthRepositoryPort;
  const before=await getProjectContinuityHealth(repo,health,db,context,
    new Date(createdAt.getTime()+24*60*60*1000-1));
  assert.equal(before.activeGrants[0]?.confirmationOverdue,false);
  const at24=await getProjectContinuityHealth(repo,health,db,context,
    new Date(createdAt.getTime()+24*60*60*1000));
  assert.equal(at24.activeGrants[0]?.confirmationOverdue,true);
  assert.equal(at24.activeGrants[0]?.reminderDay,1);
  const before48=await getProjectContinuityHealth(repo,health,db,context,
    new Date(createdAt.getTime()+48*60*60*1000-1));
  assert.equal(before48.crewVacancies[0]?.escalationDue,false);
  const at48=await getProjectContinuityHealth(repo,health,db,context,
    new Date(createdAt.getTime()+48*60*60*1000));
  assert.equal(at48.crewVacancies[0]?.reminderDay,1);
  const at72=await getProjectContinuityHealth(repo,health,db,context,
    new Date(createdAt.getTime()+72*60*60*1000));
  assert.equal(at72.crewVacancies[0]?.reminderDay,2);
  assert.equal(at72.activeGrants[0]?.reminderDay,3);
  assert.notEqual(at48.crewVacancies[0]?.reminderKey,
    at72.crewVacancies[0]?.reminderKey);
});

test('health excludes invalid grant scope, confirmed grant alert and non-admin access',async()=>{
  const repo={
    findProjectById:async()=>({status:'ACTIVE'}),
    listActiveActingGrants:async()=>[
      {id:grantId,userId,role:'SURVEY_MANAGER',
        scope:{projectId,actions:['manage_workflow']},
        confirmedAt:new Date(),createdAt},
      {id:id(),userId:id(),role:'SURVEY_MANAGER',
        scope:{projectId:id(),actions:['manage_workflow']},
        confirmedAt:null,createdAt},
    ],
  } as unknown as ITenancyRepository;
  const health: ContinuityHealthRepositoryPort = {
    async listUnresolvedCrewVacancies() { return []; },
  };
  await assert.rejects(getProjectContinuityHealth(repo,health,db,
    {...context,actorRole:'REQUESTER'},new Date('2026-09-26')),ForbiddenError);
  const result=await getProjectContinuityHealth(repo,health,db,context,
    new Date('2026-09-26'));
  assert.equal(result.activeGrants.length,1);
  assert.equal(result.activeGrants[0]?.confirmationOverdue,false);
});

test('PostgreSQL project health scopes unresolved vacancy and active grant',
  {skip:!process.env.DATABASE_URL},async()=>{
    const client=new Client({connectionString:process.env.DATABASE_URL});
    await client.connect(); await client.query('BEGIN');
    try{
      const t=id(),p=id(),c=id(),admin=id(),pc=id(),im=id(),req=id();
      const lv=id(),node=id(),ticket=id(),grant=id();
      await client.query("INSERT INTO tenants(id,name) VALUES($1,'Health')",[t]);
      await client.query("INSERT INTO companies(id,tenant_id,name,type) VALUES($1,$2,'GC','GC')",[c,t]);
      await client.query(`INSERT INTO users(id,tenant_id,company_id,email,password_hash,name) VALUES
        ($1,$5,$6,'health-admin@example.com','fixture','Admin'),
        ($2,$5,$6,'health-pc@example.com','fixture','Chief'),
        ($3,$5,$6,'health-im@example.com','fixture','Instrument'),
        ($4,$5,$6,'health-req@example.com','fixture','Requester')`,
      [admin,pc,im,req,t,c]);
      await client.query("INSERT INTO projects(id,tenant_id,name,status,crew_build) VALUES($1,$2,'Health project','ACTIVE','MEDIUM')",[p,t]);
      await client.query(`INSERT INTO project_memberships(project_id,user_id,role) VALUES
        ($1,$2,'PROJECT_ADMIN'),($1,$3,'PARTY_CHIEF'),
        ($1,$4,'INSTRUMENT_MAN'),($1,$5,'REQUESTER')`,[p,admin,pc,im,req]);
      await client.query(`INSERT INTO crew_rosters(project_id,tenant_id,party_chief_id,instrument_man_id)
        VALUES($1,$2,$3,$4)`,[p,t,pc,im]);
      await client.query("INSERT INTO aor_levels(id,project_id,tenant_id,depth,label) VALUES($1,$2,$3,0,'Area')",[lv,p,t]);
      await client.query("INSERT INTO aor_nodes(id,project_id,tenant_id,level_id,name,code) VALUES($1,$2,$3,$4,'Area','A1')",[node,p,t,lv]);
      await client.query(`INSERT INTO tickets(id,tenant_id,project_id,aor_node_id,company_id,
        ticket_number,requester_id,assigned_party_chief_id,assigned_instrument_man_id,
        workflow_variant,status,craft,description,requested_date,ticket_type)
        VALUES($1,$2,$3,$4,$5,'FSS-A1-HE01',$6,$7,$8,
        'DIRECT_ASSIGNMENT','IN_PROGRESS','Pipe','Health','2026-10-01','LAYOUT')`,
      [ticket,t,p,node,c,req,pc,im]);
      await client.query(`INSERT INTO acting_grants(id,tenant_id,project_id,user_id,role,
        scope,trigger,cascade_level,granted_by,granted_reason,created_at)
        VALUES($1,$2,$3,$4,'SURVEY_MANAGER',$5,'VACANCY',0,'SYSTEM',
          'Manager vacancy',NOW()-INTERVAL '25 hours')`,
      [grant,t,p,im,JSON.stringify({projectId:p,actions:['manage_workflow']})]);
      await client.query(`UPDATE users SET deactivated_at=NOW()-INTERVAL '50 hours'
        WHERE id=$1 AND tenant_id=$2`,[pc,t]);
      await client.query(`UPDATE crew_rosters SET deactivated_at=NOW()-INTERVAL '50 hours'
        WHERE tenant_id=$1 AND project_id=$2 AND party_chief_id=$3`,[t,p,pc]);
      await client.query(`INSERT INTO tenant_events(tenant_id,actor_id,event_type,payload,created_at)
        VALUES($1,$2,'user.deactivated',$3,NOW()-INTERVAL '50 hours')`,
      [t,admin,JSON.stringify({userId:pc,affectedRoles:['PARTY_CHIEF']})]);
      const result=await getProjectContinuityHealth(new TenancyRepository(),
        new ContinuityHealthRepository(),client,
        {tenantId:t,projectId:p,actorRole:'PROJECT_ADMIN'});
      assert.equal(result.activeGrants.length,1);
      assert.equal(result.activeGrants[0]?.confirmationOverdue,true);
      assert.equal(result.crewVacancies.length,1);
      assert.equal(result.crewVacancies[0]?.role,'PARTY_CHIEF');
      assert.equal(result.crewVacancies[0]?.openTicketCount,1);
      assert.equal(result.crewVacancies[0]?.uncoveredCrewCount,1);
      assert.equal(result.crewVacancies[0]?.escalationDue,true);
      const foreign=await new ContinuityHealthRepository()
        .listUnresolvedCrewVacancies(client,id(),p);
      assert.deepEqual(foreign,[]);
    }finally{await client.query('ROLLBACK');await client.end();}
  });
