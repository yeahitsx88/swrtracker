import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Client } from 'pg';
import type { DbClient, UUID } from '@/shared/types';
import { ForbiddenError, ValidationError } from '@/shared/errors';
import { getTenantHealth, type TenantHealthPort, type HealthContinuityPort } from '@/modules/reporting/application/tenant-health';
import { TenantHealthRepository } from '@/modules/reporting/infrastructure/tenant-health.repository';
import { getProjectContinuityHealth } from '@/modules/tenancy/application/continuity-health';
import { TenancyRepository } from '@/modules/tenancy/infrastructure/tenancy.repository';
import { ContinuityHealthRepository } from '@/modules/tenancy/infrastructure/continuity-health.repository';
const id=()=>randomUUID() as UUID;
const continuity:HealthContinuityPort={read:(db,tenantId,projectId,now)=>getProjectContinuityHealth(new TenancyRepository(),new ContinuityHealthRepository(),db,{tenantId,projectId,actorRole:'TENANT_ADMIN'},now)};

test('tenant health rejects non-admin callers and invalid pagination before reporting reads',async()=>{
  let reads=0;const repo={list:async()=>{reads++;return [];}} as unknown as TenantHealthPort;
  const query={tenantId:id(),userId:id(),limit:20,offset:0};
  const denied={async query(){return {rows:[]};}} as unknown as DbClient;
  await assert.rejects(getTenantHealth(repo,continuity,denied,query),ForbiddenError);
  const admin={async query(){return {rows:[{role:'TENANT_ADMIN'}]};}} as unknown as DbClient;
  for(const invalid of [{limit:0},{limit:51},{offset:-1},{offset:0.5}])await assert.rejects(getTenantHealth(repo,continuity,admin,{...query,...invalid}),ValidationError);
  assert.equal(reads,0);
});

test('PostgreSQL tenant dashboard counts statuses, strict stale thresholds, help levels and named continuity',
  {skip:!process.env.DATABASE_URL},async()=>{
    const client=new Client({connectionString:process.env.DATABASE_URL});await client.connect();await client.query('BEGIN');
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
          'Manager vacancy','2026-09-24T11:00:00Z')`,
      [grant,t,p,im,JSON.stringify({projectId:p,actions:['manage_workflow']})]);
      await client.query(`UPDATE users SET deactivated_at='2026-09-23T10:00:00Z'
        WHERE id=$1 AND tenant_id=$2`,[pc,t]);
      await client.query(`UPDATE crew_rosters SET deactivated_at='2026-09-23T10:00:00Z'
        WHERE tenant_id=$1 AND project_id=$2 AND party_chief_id=$3`,[t,p,pc]);
      await client.query(`INSERT INTO tenant_events(tenant_id,actor_id,event_type,payload,created_at)
        VALUES($1,$2,'user.deactivated',$3,'2026-09-23T10:00:00Z')`,
      [t,admin,JSON.stringify({userId:pc,affectedRoles:['PARTY_CHIEF']})]);

      const now=new Date('2026-09-25T12:00:00Z');
      await client.query("INSERT INTO tenant_memberships(tenant_id,user_id,role) VALUES($1,$2,'TENANT_ADMIN')",[t,admin]);
      const setup=id(),archived=id(),empty=id(),foreign=id(),outside=id();
      await client.query("INSERT INTO tenants(id,name) VALUES($1,'Foreign health')",[foreign]);
      await client.query("INSERT INTO projects(id,tenant_id,name,status,crew_build) VALUES($1,$5,'A setup','SETUP','FULL'),($2,$5,'B archive','ARCHIVED','MEDIUM'),($3,$5,'C empty','ACTIVE','SLIM'),($4,$6,'Foreign','ACTIVE','SLIM')",[setup,archived,empty,outside,t,foreign]);
      const statuses=['CREATED','SUBMITTED','SUBMITTED','APPROVED','APPROVED','ASSIGNED','PENDING_PC_APPROVAL','PENDING_PC_APPROVAL','DELAYED','COMPLETED','REQUESTER_CANCELED','FIELD_CANCELED','SURVEY_CANCELED','REJECTED','DRAFT'];
      for(const [i,status] of statuses.entries()){
        await client.query(`INSERT INTO tickets(id,tenant_id,project_id,aor_node_id,company_id,ticket_number,requester_id,assigned_party_chief_id,assigned_instrument_man_id,workflow_variant,status,craft,description,requested_date,ticket_type,submitted_at,approved_at,updated_at)
          SELECT $1,tenant_id,project_id,aor_node_id,company_id,$2,requester_id,assigned_party_chief_id,assigned_instrument_man_id,'STANDARD_APPROVAL',$3,craft,description,requested_date,ticket_type,$4,$5,$6 FROM tickets WHERE id=$7 AND tenant_id=$8`,
          [id(),'FSS-HE-'+i,status,new Date(now.getTime()-(i===1?25:24)*3600000),new Date(now.getTime()-(i===3?49:48)*3600000),new Date(now.getTime()-(i===6?5:4)*3600000),ticket,t]);
      }
      await client.query(`INSERT INTO help_flags(tenant_id,project_id,raised_by,level,status,affected_ticket_ids) VALUES
        ($1,$2,$3,1,'ACTIVE',ARRAY[$5]::uuid[]),($1,$2,$4,2,'ACTIVE','{}'),($1,$2,$3,2,'CLEARED','{}')`,[t,p,im,pc,ticket]);
      const repo=new TenantHealthRepository(),query={tenantId:t,userId:admin,limit:2,offset:0};
      const first=await getTenantHealth(repo,continuity,client,query,now);
      assert.deepEqual(first.projects.map(row=>row.id),[setup,archived]);assert.equal(first.hasMore,true);
      assert.ok(first.projects.every(row=>row.tickets===null && row.stale===null && row.activeHelpFlags===null && row.continuity===null));
      const second=await getTenantHealth(repo,continuity,client,{...query,offset:2},now);
      assert.equal(second.hasMore,false);assert.deepEqual(second.projects.map(row=>row.id),[empty,p]);
      assert.deepEqual(second.projects[0]?.tickets,{created:0,submitted:0,approved:0,assignedInProgress:0,pendingApproval:0,delayed:0,canceled:0});
      const health=second.projects[1]!;
      assert.deepEqual(health.tickets,{created:1,submitted:2,approved:2,assignedInProgress:2,pendingApproval:2,delayed:1,canceled:3});
      assert.deepEqual(health.stale,{submitted:1,approved:1,pendingApproval:1});assert.equal(health.activeHelpFlags,1);
      assert.equal(health.continuity?.activeGrants[0]?.userName,'Instrument');
      assert.equal(health.continuity?.activeGrants[0]?.ageHours,25);assert.equal(health.continuity?.activeGrants[0]?.confirmationOverdue,true);
      assert.equal(health.continuity?.crewVacancies[0]?.userName,'Chief');assert.equal(health.continuity?.crewVacancies[0]?.ageHours,50);
      assert.equal(health.continuity?.crewVacancies[0]?.openTicketCount,5);
      await assert.rejects(getTenantHealth(repo,continuity,client,{...query,userId:req},now),ForbiddenError);
      await assert.rejects(getTenantHealth(repo,continuity,client,{...query,tenantId:foreign},now),ForbiddenError);
      assert.deepEqual(await repo.list(client,{...query,userId:req},now),[]);
      assert.deepEqual(await repo.list(client,{...query,tenantId:foreign},now),[]);
      assert.deepEqual(await repo.names(client,foreign,[im,pc]),[]);
      await client.query('UPDATE users SET deactivated_at=NOW() WHERE id=$1',[admin]);
      await assert.rejects(getTenantHealth(repo,continuity,client,query,now),ForbiddenError);
    }finally{await client.query('ROLLBACK');await client.end();}
  });
