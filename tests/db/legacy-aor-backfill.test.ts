import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Client } from 'pg';

const sql=readFileSync('db/migrations/021_legacy_area_aor_backfill.sql','utf8');
const id=()=>randomUUID();

test('migration 021 maps evidenced areas, subareas, tickets and viewers, then reruns',
  {skip:!process.env.DATABASE_URL},async()=>{
    const db=new Client({connectionString:process.env.DATABASE_URL});
    await db.connect(); await db.query('BEGIN');
    try{
      // A latest-schema database normally requires AOR on new tickets; this
      // transaction recreates an upgrade-era legacy ticket as the fixture.
      await db.query('ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_location_source_check');
      const t=id(),p=id(),c=id(),u=id(),a=id(),s=id(),ticket=id();
      const legacyDraft=id(),selectedDraft=id(),p2=id(),level=id(),node=id();
      await db.query("INSERT INTO tenants(id,name) VALUES($1,'Legacy AOR')",[t]);
      await db.query("INSERT INTO companies(id,tenant_id,name,type) VALUES($1,$2,'GC','GC')",[c,t]);
      await db.query("INSERT INTO users(id,tenant_id,company_id,email,password_hash,name) VALUES($1,$2,$3,'legacy-aor@example.test','fixture','Viewer')",[u,t,c]);
      await db.query("INSERT INTO projects(id,tenant_id,name,status,crew_build) VALUES($1,$2,'Legacy','ACTIVE','MEDIUM')",[p,t]);
      await db.query("INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,'AREA_VIEWER')",[p,u]);
      await db.query("INSERT INTO areas(id,project_id,tenant_id,name,code) VALUES($1,$2,$3,'Root','ROOT')",[a,p,t]);
      await db.query("INSERT INTO subareas(id,area_id,project_id,tenant_id,name) VALUES($1,$2,$3,$4,'Child')",[s,a,p,t]);
      await db.query("INSERT INTO area_memberships(project_id,user_id,area_id) VALUES($1,$2,$3)",[p,u,a]);
      await db.query(`INSERT INTO tickets(id,tenant_id,project_id,area_id,subarea_id,
        company_id,ticket_number,requester_id,workflow_variant,status,craft,
        description,requested_date,ticket_type)
        VALUES($1,$2,$3,$4,$5,$6,'FSS-ROOT-0001',$7,
          'DIRECT_ASSIGNMENT','IN_PROGRESS','Pipe','Legacy',
          '2026-10-01','LAYOUT')`,[ticket,t,p,a,s,c,u]);
      await db.query(`INSERT INTO tickets(id,tenant_id,project_id,area_id,subarea_id,
        company_id,requester_id,workflow_variant,status,craft,description,
        requested_date,ticket_type)
        VALUES($1,$2,$3,$4,$5,$6,$7,'DIRECT_ASSIGNMENT','DRAFT',
          'Pipe','Legacy draft','2026-10-01','LAYOUT')`,
        [legacyDraft,t,p,a,s,c,u]);
      await db.query("INSERT INTO projects(id,tenant_id,name,status,crew_build) VALUES($1,$2,'New AOR','SETUP','MEDIUM')",[p2,t]);
      await db.query("INSERT INTO aor_levels(id,project_id,tenant_id,depth,label) VALUES($1,$2,$3,0,'Zone')",[level,p2,t]);
      await db.query("INSERT INTO aor_nodes(id,project_id,tenant_id,level_id,name,code) VALUES($1,$2,$3,$4,'Zone','ZONE')",[node,p2,t,level]);
      await db.query(`INSERT INTO tickets(id,tenant_id,project_id,aor_node_id,
        company_id,requester_id,workflow_variant,status,craft,description,
        requested_date,ticket_type)
        VALUES($1,$2,$3,$4,$5,$6,'DIRECT_ASSIGNMENT','DRAFT',
          'Pipe','Selected AOR draft','2026-10-01','LAYOUT')`,
        [selectedDraft,t,p2,node,c,u]);
      await db.query(sql);
      const {rows:nodes}=await db.query<{id:string;parent_id:string|null;code:string}>(
        `SELECT id,parent_id,code FROM aor_nodes WHERE tenant_id=$1 AND project_id=$2
         ORDER BY parent_id NULLS FIRST`,[t,p]);
      assert.deepEqual(nodes.map(n=>n.id),[a,s]);
      assert.equal(nodes[1]?.parent_id,a);
      assert.match(nodes[1]?.code??'',/^LS[A-Fa-f0-9]{14}$/);
      const {rows:tickets}=await db.query<{
        aor_node_id:string;area_id:string;subarea_id:string}>(
        'SELECT aor_node_id,area_id,subarea_id FROM tickets WHERE id=$1',[ticket]);
      assert.deepEqual(tickets[0],{aor_node_id:s,area_id:a,subarea_id:s});
      const {rows:drafts}=await db.query<{
        id:string;aor_node_id:string;area_id:string|null;subarea_id:string|null}>(
        'SELECT id,aor_node_id,area_id,subarea_id FROM tickets WHERE id=ANY($1::uuid[]) ORDER BY id',
        [[legacyDraft,selectedDraft]]);
      assert.deepEqual(drafts.find(d=>d.id===legacyDraft),
        {id:legacyDraft,aor_node_id:s,area_id:a,subarea_id:s});
      assert.deepEqual(drafts.find(d=>d.id===selectedDraft),
        {id:selectedDraft,aor_node_id:node,area_id:null,subarea_id:null});
      const {rows:scope}=await db.query<{count:string}>(
        `SELECT count(*) FROM aor_assignments WHERE tenant_id=$1 AND project_id=$2
         AND aor_node_id=$3 AND user_id=$4`,[t,p,a,u]);
      assert.equal(Number(scope[0]?.count),1);
      await db.query(sql);
      const {rows:counts}=await db.query<{nodes:string;assignments:string}>(
        `SELECT (SELECT count(*) FROM aor_nodes WHERE project_id=$1)::text AS nodes,
          (SELECT count(*) FROM aor_assignments WHERE project_id=$1)::text AS assignments`,[p]);
      assert.deepEqual(counts[0],{nodes:'2',assignments:'1'});
    }finally{await db.query('ROLLBACK');await db.end();}
  });

test('migration 021 fails closed on incompatible level and AOR code collision',
  {skip:!process.env.DATABASE_URL},async()=>{
    const db=new Client({connectionString:process.env.DATABASE_URL});
    await db.connect(); await db.query('BEGIN');
    try{
      const t=id(),p=id(),a=id(),l=id(),n=id();
      await db.query("INSERT INTO tenants(id,name) VALUES($1,'Collision')",[t]);
      await db.query("INSERT INTO projects(id,tenant_id,name,status,crew_build) VALUES($1,$2,'Project','ACTIVE','MEDIUM')",[p,t]);
      await db.query("INSERT INTO areas(id,project_id,tenant_id,name,code) VALUES($1,$2,$3,'Root','ROOT')",[a,p,t]);
      await db.query("INSERT INTO aor_levels(id,project_id,tenant_id,depth,label) VALUES($1,$2,$3,0,'District')",[l,p,t]);
      await db.query('SAVEPOINT before_backfill');
      await assert.rejects(db.query(sql),/existing AOR depth 0 label is not Area/);
      await db.query('ROLLBACK TO SAVEPOINT before_backfill');
      await db.query("UPDATE aor_levels SET label='Area' WHERE id=$1",[l]);
      await db.query("INSERT INTO aor_nodes(id,project_id,tenant_id,level_id,name,code) VALUES($1,$2,$3,$4,'Different','ROOT')",[n,p,t,l]);
      await db.query('SAVEPOINT before_collision');
      await assert.rejects(db.query(sql),/existing AOR code belongs to another node/);
      await db.query('ROLLBACK TO SAVEPOINT before_collision');
      const {rows}=await db.query<{count:string}>(
        'SELECT count(*) FROM aor_nodes WHERE id=$1',[a]);
      assert.equal(Number(rows[0]?.count),0);
    }finally{await db.query('ROLLBACK');await db.end();}
  });
