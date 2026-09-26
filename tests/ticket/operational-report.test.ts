import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Client } from 'pg';
import type { DbClient, UUID } from '@/shared/types';
import { ForbiddenError, ValidationError } from '@/shared/errors';
import { getOperationalReport, type OperationalReportQuery } from '@/modules/ticket/application/operational-report';
import { TicketRepository } from '@/modules/ticket/infrastructure/ticket.repository';
import { getDailyTicketActivity, dailyReportEvents } from '@/modules/ticket/application/daily-report';
const id=()=>randomUUID() as UUID;

test('operational reports reject invalid dimensions and unbounded pages before querying',async()=>{
  const query:OperationalReportQuery={tenantId:id(),projectId:id(),userId:id(),dimension:'project',limit:20,offset:0};
  const db={async query(){throw Error('Unexpected database access');}} as DbClient;
  for(const invalid of [{dimension:'sql'},{limit:0},{limit:101},{offset:-1},{offset:0.5}]) {
    await assert.rejects(getOperationalReport(new TicketRepository(),db,{...query,...invalid} as OperationalReportQuery),ValidationError);
  }
});

test('daily activity rejects invalid or oversized day boundaries before reading data',async()=>{
  const query={tenantId:id(),projectId:id(),userId:id(),from:'2026-09-25T00:00:00.000Z',until:'2026-09-26T00:00:00.000Z'};
  const db={async query(){throw Error('Unexpected database access');}} as DbClient;
  for(const invalid of [{from:'2026-02-30T00:00:00.000Z'},{until:query.from},
    {until:'2026-09-24T00:00:00.000Z'},{until:'2026-09-26T02:00:00.000Z'},{from:'yesterday'}]) {
    await assert.rejects(getDailyTicketActivity(new TicketRepository(),db,{...query,...invalid}),ValidationError);
  }
});

test('PostgreSQL operational groups preserve statuses, pagination, historical names and ticket visibility',
  {skip:!process.env.DATABASE_URL},async()=>{
    const db=new Client({connectionString:process.env.DATABASE_URL});await db.connect();await db.query('BEGIN');
    try{
      const tenant=id(),project=id(),otherProject=id(),gc=id(),sub=id(),actor=id(),other=id(),im=id();
      const level=id(),area=id(),secondArea=id(),otherLevel=id(),otherArea=id();
      await db.query("INSERT INTO tenants(id,name) VALUES($1,'Reports')",[tenant]);
      await db.query("INSERT INTO companies(id,tenant_id,name,type) VALUES($1,$3,'GC','GC'),($2,$3,'Sub','SUBCONTRACTOR')",[gc,sub,tenant]);
      await db.query("INSERT INTO projects(id,tenant_id,name,status) VALUES($1,$3,'Main','ACTIVE'),($2,$3,'Other','ACTIVE')",[project,otherProject,tenant]);
      for(const [user,company,name] of [[actor,gc,'Lead'],[other,sub,'Other'],[im,gc,'Instrument']]) {
        await db.query('INSERT INTO users(id,tenant_id,company_id,email,name) VALUES($1,$2,$3,$4,$5)',[user,tenant,company,user+'@example.test',name]);
      }
      await db.query("INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,'VIEWER'),($1,$3,'INSTRUMENT_MAN')",[project,actor,im]);
      await db.query("INSERT INTO aor_levels(id,tenant_id,project_id,depth,label) VALUES($1,$2,$3,0,'Area')",[level,tenant,project]);
      await db.query("INSERT INTO aor_nodes(id,tenant_id,project_id,level_id,name,code) VALUES($1,$3,$4,$5,'Area','A'),($2,$3,$4,$5,'Area','B')",[area,secondArea,tenant,project,level]);
      await db.query("INSERT INTO aor_levels(id,tenant_id,project_id,depth,label) VALUES($1,$2,$3,0,'Area')",[otherLevel,tenant,otherProject]);
      await db.query("INSERT INTO aor_nodes(id,tenant_id,project_id,level_id,name,code) VALUES($1,$2,$3,$4,'Other area','C')",[otherArea,tenant,otherProject,otherLevel]);
      const statuses=['CREATED','SUBMITTED','APPROVED','ASSIGNED','IN_PROGRESS','PENDING_PC_APPROVAL','DELAYED','COMPLETED','REJECTED','REQUESTER_CANCELED','FIELD_CANCELED','SURVEY_CANCELED','DRAFT'];
      for(const [index,status] of statuses.entries()) {
        await db.query(`INSERT INTO tickets(tenant_id,project_id,company_id,requester_id,workflow_variant,status,
          ticket_number,aor_node_id,craft,assigned_party_chief_id,assigned_instrument_man_id,description,requested_date,ticket_type)
          VALUES($1,$2,$3,$4,'STANDARD_APPROVAL',$5,$6,$7,$8,$9,$10,'Report fixture','2026-10-01','LAYOUT')`,
        [tenant,project,index%2?sub:gc,index%2?other:actor,status,status==='DRAFT'?null:'FSS-R-'+index,
          index%2?secondArea:area,index%2?'Pipe':'Civil',index%2?null:actor,index%2?null:im]);
      }
      // Other projects and deleted drafts must never contribute to this project's groups.
      await db.query(`INSERT INTO tickets(tenant_id,project_id,company_id,requester_id,workflow_variant,status,draft_deleted_at,draft_deleted_reason)
        VALUES($1,$2,$3,$4,'STANDARD_APPROVAL','DRAFT',NOW(),'REQUESTER_DELETED')`,[tenant,project,gc,actor]);
      await db.query(`INSERT INTO tickets(tenant_id,project_id,company_id,requester_id,workflow_variant,status,
        ticket_number,aor_node_id,craft,description,requested_date,ticket_type)
        SELECT tenant_id,$3,company_id,requester_id,workflow_variant,status,'FSS-OTHER',$4,craft,description,requested_date,ticket_type
        FROM tickets WHERE tenant_id=$1 AND project_id=$2 AND status='CREATED'`,[tenant,project,otherProject,otherArea]);
      const repo=new TicketRepository();
      const query:OperationalReportQuery={tenantId:tenant,projectId:project,userId:actor,dimension:'project',limit:20,offset:0};
      const report=await getOperationalReport(repo,db,query);
      assert.equal(report.groups[0]?.total,12);
      assert.deepEqual(report.groups[0]?.statuses,Object.fromEntries(statuses.filter(s=>s!=='DRAFT').map(s=>[s,1])));
      assert.equal(report.groups[0]?.label,'Main');assert.equal(report.hasMore,false);
      const dailyQuery={tenantId:tenant,projectId:project,userId:actor,
        from:'2026-09-25T00:00:00.000Z',until:'2026-09-26T00:00:00.000Z'};
      await db.query("UPDATE tickets SET workflow_variant='DIRECT_ASSIGNMENT' WHERE tenant_id=$1 AND project_id=$2 AND status='CREATED'",[tenant,project]);
      const eventStatuses=['CREATED','SUBMITTED','APPROVED','REJECTED','APPROVED','ASSIGNED',
        'IN_PROGRESS','PENDING_PC_APPROVAL','COMPLETED','DELAYED','IN_PROGRESS',
        'REQUESTER_CANCELED','FIELD_CANCELED','SURVEY_CANCELED'];
      for(const [index,eventType] of dailyReportEvents.entries()) {
        await db.query(`INSERT INTO ticket_events(ticket_id,tenant_id,actor_id,event_type,payload,created_at)
          SELECT id,tenant_id,$3,$4,'{}',$5 FROM tickets WHERE tenant_id=$1 AND project_id=$2 AND status=$6`,
        [tenant,project,actor,eventType,dailyQuery.from,eventStatuses[index]]);
      }
      for(const [status,eventType,time,projectId] of [
        ['ASSIGNED','ticket.assigned','2026-09-25T12:00:00.000Z',project],
        ['COMPLETED','ticket.completed','2026-09-24T23:59:59.999Z',project],
        ['COMPLETED','ticket.completed',dailyQuery.until,project],
        ['SUBMITTED','ticket.created',dailyQuery.from,project],
        ['CREATED','ticket.created',dailyQuery.from,otherProject],
        ['CREATED','attachment.uploaded',dailyQuery.from,project],
      ]) {
        await db.query(`INSERT INTO ticket_events(ticket_id,tenant_id,actor_id,event_type,payload,created_at)
          SELECT id,tenant_id,$3,$4,'{}',$5 FROM tickets WHERE tenant_id=$1 AND project_id=$2 AND status=$6`,
        [tenant,projectId,actor,eventType,time,status]);
      }
      const daily=await getDailyTicketActivity(repo,db,dailyQuery);
      assert.equal(daily.activity.length,dailyReportEvents.length);
      for(const row of daily.activity){assert.equal(row.requests,1,row.eventType);assert.equal(row.events,row.eventType==='ticket.assigned'?2:1,row.eventType);}
      const emptyDay=await getDailyTicketActivity(repo,db,{...dailyQuery,from:'2026-09-20T00:00:00.000Z',until:'2026-09-21T00:00:00.000Z'});
      assert.deepEqual(emptyDay.activity,[]);
      // Both daylight-saving day lengths are valid; exact end stays exclusive.
      for(const until of ['2026-09-25T23:00:00.000Z','2026-09-26T01:00:00.000Z']) {
        assert.equal((await getDailyTicketActivity(repo,db,{...dailyQuery,until})).activity.length,dailyReportEvents.length);
      }
      const crafts=await getOperationalReport(repo,db,{...query,dimension:'craft',limit:1});
      assert.equal(crafts.groups[0]?.label,'Civil');assert.equal(crafts.groups[0]?.total,6);assert.equal(crafts.hasMore,true);
      const next=await getOperationalReport(repo,db,{...query,dimension:'craft',limit:1,offset:1});
      assert.equal(next.groups[0]?.label,'Pipe');assert.equal(next.hasMore,false);
      const areas=await getOperationalReport(repo,db,{...query,dimension:'area'});
      assert.equal(areas.groups.length,2);assert.deepEqual(new Set(areas.groups.map(g=>g.key)),new Set([area,secondArea]));
      const chiefs=await getOperationalReport(repo,db,{...query,dimension:'partyChief'});
      assert.equal(chiefs.groups[0]?.key,null);assert.equal(chiefs.groups[0]?.total,6);
      assert.equal(chiefs.groups[1]?.label,'Lead');assert.equal(chiefs.groups[1]?.total,6);
      await db.query('UPDATE users SET deactivated_at=NOW() WHERE id=$1',[im]);
      assert.equal((await getOperationalReport(repo,db,{...query,dimension:'instrumentMan'})).groups[1]?.label,'Instrument');
      await db.query("UPDATE projects SET status='ARCHIVED' WHERE id=$1",[project]);
      assert.equal((await getOperationalReport(repo,db,query)).groups[0]?.total,12);
      for(const role of ['REQUESTER','PARTY_CHIEF','INSTRUMENT_MAN']) {
        await db.query('UPDATE project_memberships SET role=$1 WHERE project_id=$2 AND user_id=$3',[role,project,actor]);
        // IM sees only explicitly assigned work in this fixture (no roster).
        if(role==='INSTRUMENT_MAN')await db.query('UPDATE tickets SET assigned_instrument_man_id=$1 WHERE tenant_id=$2 AND project_id=$3 AND company_id=$4',[actor,tenant,project,gc]);
        assert.equal((await getOperationalReport(repo,db,query)).groups[0]?.total,6,role);
        const scopedDaily=await getDailyTicketActivity(repo,db,dailyQuery);
        assert.ok(scopedDaily.activity.every(row=>!['ticket.submitted','ticket.assigned','ticket.completed','ticket.pending_pc_approval','ticket.requester_canceled','ticket.survey_canceled'].includes(row.eventType)),role);
        assert.ok(scopedDaily.activity.some(row=>row.eventType==='ticket.field_canceled'),role);
      }
      await db.query("UPDATE project_memberships SET role='AREA_VIEWER' WHERE project_id=$1 AND user_id=$2",[project,actor]);
      assert.deepEqual((await getOperationalReport(repo,db,query)).groups,[]);
      await db.query('INSERT INTO aor_assignments(tenant_id,project_id,user_id,aor_node_id) VALUES($1,$2,$3,$4)',[tenant,project,actor,secondArea]);
      assert.equal((await getOperationalReport(repo,db,query)).groups[0]?.total,6);
      const department=id();
      await db.query("INSERT INTO departments(id,tenant_id,project_id,name,manager_title,created_by) VALUES($1,$2,$3,'Civil','Manager',$4)",[department,tenant,project,actor]);
      await db.query('INSERT INTO department_memberships(tenant_id,project_id,user_id,department_id) VALUES($1,$2,$3,$4)',[tenant,project,actor,department]);
      await db.query("UPDATE tickets SET department_id=$1 WHERE tenant_id=$2 AND project_id=$3 AND status IN ('CREATED','SUBMITTED','APPROVED')",[department,tenant,project]);
      await db.query("UPDATE project_memberships SET role='DEPARTMENT_MANAGER' WHERE project_id=$1 AND user_id=$2",[project,actor]);
      assert.equal((await getOperationalReport(repo,db,query)).groups[0]?.total,3);
      await db.query("UPDATE project_memberships SET role='DEPARTMENT_LEAD' WHERE project_id=$1 AND user_id=$2",[project,actor]);
      assert.deepEqual((await getOperationalReport(repo,db,query)).groups[0]?.statuses,{SUBMITTED:1});
      await db.query("UPDATE project_memberships SET role='SUBCONTRACTS_COORDINATOR' WHERE project_id=$1 AND user_id=$2",[project,actor]);
      assert.equal((await getOperationalReport(repo,db,query)).groups[0]?.total,6);
      await db.query("UPDATE project_memberships SET role='VIEWER' WHERE project_id=$1 AND user_id=$2",[project,actor]);
      await db.query('UPDATE users SET company_id=$1 WHERE id=$2',[sub,actor]);
      const isolated=await getOperationalReport(repo,db,{...query,dimension:'craft'});
      assert.deepEqual(isolated.groups.map(g=>g.label),['Pipe']);assert.equal(isolated.groups[0]?.total,6);
      await db.query("UPDATE project_memberships SET role='PROJECT_ADMIN' WHERE project_id=$1 AND user_id=$2",[project,actor]);
      await assert.rejects(getOperationalReport(repo,db,query),ForbiddenError);
      await assert.rejects(getDailyTicketActivity(repo,db,dailyQuery),ForbiddenError);
      await db.query("INSERT INTO tenant_memberships(tenant_id,user_id,role) VALUES($1,$2,'TENANT_ADMIN')",[tenant,actor]);
      assert.equal((await getOperationalReport(repo,db,query)).groups[0]?.total,6,'subcontractor isolation also applies to tenant admin');
      await db.query('UPDATE users SET company_id=$1 WHERE id=$2',[gc,actor]);
      assert.equal((await getOperationalReport(repo,db,query)).groups[0]?.total,12);
      await assert.rejects(getOperationalReport(repo,db,{...query,tenantId:id()}),ForbiddenError);
      await assert.rejects(getDailyTicketActivity(repo,db,{...dailyQuery,tenantId:id()}),ForbiddenError);
      assert.deepEqual((await getOperationalReport(repo,db,{...query,projectId:id()})).groups,[]);
      await db.query("UPDATE tickets SET status='COMPLETED' WHERE tenant_id=$1 AND project_id=$2 AND status='SUBMITTED'",[tenant,project]);
      assert.equal((await getDailyTicketActivity(repo,db,dailyQuery)).activity.find(row=>row.eventType==='ticket.submitted')?.requests,1);
      await db.query('UPDATE users SET deactivated_at=NOW() WHERE id=$1',[actor]);
      await assert.rejects(getOperationalReport(repo,db,query),ForbiddenError);
      await assert.rejects(getDailyTicketActivity(repo,db,dailyQuery),ForbiddenError);
    }finally{await db.query('ROLLBACK');await db.end();}
  });
