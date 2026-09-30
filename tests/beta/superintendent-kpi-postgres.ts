import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { resolveVisibility } from '../../src/lib/resolve-visibility';
import { getAmeliaMetrics } from '../../src/modules/reporting/application/amelia-metrics';
import { AmeliaMetricsReader } from '../../src/modules/reporting/infrastructure/amelia-metrics.reader';
import { TicketRepository } from '../../src/modules/ticket/infrastructure/ticket.repository';
import type { UUID } from '../../src/shared/types';
import type { MetricsFilters } from '../../src/modules/reporting/application/metrics-filters';

// Run after the fresh survey-teams-postgres fixture, never against Sabine.
const id=(n:number)=>`20000000-0000-4000-8000-${String(n).padStart(12,'0')}` as UUID;
const tenant=id(1),project=id(2),manager=id(3),company=id(4),area=id(5),level=id(6),chief=id(7),im=id(8),sup=id(9),otherProject=id(10),otherTenant=id(11),otherCompany=id(12),outsider=id(13),otherArea=id(14),otherChief=id(16),sameProject=id(17);
const child=id(100),areaB=id(101),areaC=id(102),outsideChief=id(103);
async function main(){
  const url=new URL(process.env.DATABASE_URL??'');
  if(process.env.SWR_TEAM_POSTGRES!=='1'||url.hostname!=='127.0.0.1'||url.port!=='15489'||url.pathname!=='/swr_team_isolated')throw new Error('Disposable loopback team fixture only');
  const pool=new Pool({connectionString:url.href,max:4});let scenarios=0;
  try{
    assert.equal((await pool.query('SELECT name FROM tenants WHERE id=$1',[tenant])).rows[0]?.name,'Team test');
    assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM tickets')).rows[0].n,0,'Fresh base fixture required');
    await pool.query(`INSERT INTO aor_nodes(id,tenant_id,project_id,level_id,parent_id,name,code) VALUES
      ($1,$4,$5,$6,$7,'Train 1 East','T1E'),($2,$4,$5,$6,NULL,'Train 2','T2'),($3,$4,$5,$6,NULL,'Brownfield','BF')`,[child,areaB,areaC,tenant,project,level,area]);
    await pool.query(`INSERT INTO aor_nodes(id,tenant_id,project_id,level_id,name,code) VALUES ($1,$2,$3,$4,'Other project Area','OTHER')`,[id(104),tenant,sameProject,level]);
    await pool.query(`INSERT INTO users(id,tenant_id,company_id,email,name,password_hash) VALUES ($1,$2,$3,'outside-chief@example.test','Out-of-scope Chief','not-a-login-hash')`,[outsideChief,tenant,company]);
    await pool.query(`INSERT INTO project_memberships(project_id,user_id,role) VALUES ($1,$2,'PARTY_CHIEF')`,[project,outsideChief]);
    await pool.query(`INSERT INTO aor_assignments(tenant_id,project_id,user_id,aor_node_id) VALUES ($1,$2,$3,$4),($1,$2,$3,$5)`,[tenant,project,sup,area,areaB]);
    // Named-team membership from the base fixture must not infer reporting links.
    const before=await resolveVisibility(pool,tenant,project,sup,'SURVEY_SUPERINTENDENT','linkedCrews');
    assert.deepEqual(before.linkedCrewAssignments,[]);scenarios++;
    await pool.query(`UPDATE survey_reporting_links SET deactivated_at=NULL WHERE project_id=$1 AND party_chief_id=$2`,[project,chief]);
    await pool.query(`INSERT INTO survey_reporting_links(tenant_id,project_id,superintendent_id,party_chief_id,aor_node_id,assigned_by) VALUES ($1,$2,$3,$4,$5,$6)`,[tenant,project,sup,outsideChief,areaC,manager]);
    await pool.query(`INSERT INTO crew_rosters(tenant_id,project_id,party_chief_id,instrument_man_id) VALUES ($1,$2,$3,$4)`,[tenant,project,chief,im]);
    const insert=async(n:number,node:UUID,pc:UUID|null,assignedIm:UUID|null,status='ASSIGNED',recordProject=project,recordTenant=tenant,recordCompany=company,requester=manager)=>{
      await pool.query(`INSERT INTO tickets(id,tenant_id,project_id,aor_node_id,company_id,ticket_number,requester_id,assigned_party_chief_id,assigned_instrument_man_id,workflow_variant,status,craft,description,requested_date,ticket_type,first_submitted_at,submitted_at,completed_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'STANDARD_APPROVAL',$10,'Survey','Synthetic scope test','2026-09-30','LAYOUT','2026-09-01','2026-09-01',CASE WHEN $10='COMPLETED' THEN '2026-09-03'::timestamptz ELSE NULL END)`,[id(n),recordTenant,recordProject,node,recordCompany,`TEST-${n}`,requester,pc,assignedIm,status]);
    };
    await insert(200,area,chief,im);await insert(201,child,chief,im,'COMPLETED');await insert(202,area,chief,null);
    await insert(203,area,null,null,'APPROVED');await insert(204,area,otherChief,im);await insert(205,areaB,chief,im);
    await insert(206,area,null,im);await insert(207,areaC,outsideChief,im);await insert(208,area,chief,im,'DRAFT');
    await insert(209,id(104),chief,im,'ASSIGNED',sameProject);await insert(210,otherArea,outsider,null,'ASSIGNED',otherProject,otherTenant,otherCompany,outsider);
    const read=async(filters:MetricsFilters={})=>{
      const visibility=await resolveVisibility(pool,tenant,project,sup,'SURVEY_SUPERINTENDENT',filters.cohort);
      const metrics=await getAmeliaMetrics(new AmeliaMetricsReader(),pool,{tenantId:tenant,projectId:project,visibility,filters,includeCharts:true,today:'2026-10-01'});
      const {population,...rest}=filters;
      const requests=await new TicketRepository().list(pool,tenant,{projectId:project,visibility,filters:{...rest,queue:population??'all'},limit:10,offset:0});
      assert.equal(requests.total,metrics.total,'Aggregate and drill-down populations must agree');scenarios++;
      return {metrics,requests,visibility};
    };
    const wide=await read({cohort:'areaWorkload'});assert.equal(wide.metrics.total,7);assert.equal(wide.metrics.populationTotal,7);
    assert.ok(wide.requests.data.some(t=>t.id===id(203)));assert.ok(wide.requests.data.some(t=>t.id===id(204)));assert.deepEqual(wide.metrics.charts?.crews,[]);
    const linked=await read({cohort:'linkedCrews'});assert.equal(linked.metrics.total,3);assert.equal(linked.metrics.populationTotal,3);
    assert.deepEqual(linked.requests.data.map(t=>t.id).sort(),[id(200),id(201),id(202)]);
    assert.deepEqual(linked.visibility.linkedCrewAssignments,[{partyChiefId:chief,areaId:area},{partyChiefId:chief,areaId:child}]);
    assert.deepEqual(linked.metrics.charts?.crews.map(row=>row.key),[chief]);assert.deepEqual(linked.metrics.charts?.facets.crews.map(row=>row.key),[chief]);
    assert.deepEqual(linked.metrics.charts?.facets.instrumentMen.map(row=>row.key),[im]);
    assert.equal(linked.metrics.charts?.areas.reduce((n,row)=>n+row.count,0),3);assert.equal(linked.metrics.averageSubmissionToCompletionHours,48);
    assert.equal((await read({cohort:'linkedCrews',population:'completed'})).metrics.populationTotal,3);
    assert.equal((await read({cohort:'linkedCrews',population:'open'})).metrics.total,2);
    assert.equal((await read({cohort:'linkedCrews',crewId:otherChief})).metrics.total,0);
    assert.equal((await read({cohort:'linkedCrews',instrumentManId:outsider})).metrics.total,0);
    assert.equal((await read({cohort:'linkedCrews',areaId:areaB})).metrics.total,0);
    assert.equal((await read({cohort:'linkedCrews',areaId:child})).metrics.total,1);
    assert.equal((await read({cohort:'linkedCrews',dateBasis:'completed',dateFrom:'2026-09-03',dateTo:'2026-09-03'})).metrics.total,1);
    await pool.query('UPDATE survey_reporting_links SET deactivated_at=NOW() WHERE party_chief_id=$1',[chief]);
    assert.equal((await read({cohort:'linkedCrews'})).metrics.total,0);assert.equal((await read()).metrics.total,7);
    await pool.query('UPDATE survey_reporting_links SET deactivated_at=NULL WHERE party_chief_id=$1',[chief]);
    for(const user of [chief,sup]){
      await pool.query('UPDATE users SET deactivated_at=NOW() WHERE id=$1',[user]);assert.equal((await read({cohort:'linkedCrews'})).metrics.total,0);
      await pool.query('UPDATE users SET deactivated_at=NULL WHERE id=$1',[user]);
    }
    for(const [user,role] of [[chief,'PARTY_CHIEF'],[sup,'SURVEY_SUPERINTENDENT']]){
      await pool.query(`UPDATE project_memberships SET role='REQUESTER' WHERE project_id=$1 AND user_id=$2`,[project,user]);assert.equal((await read({cohort:'linkedCrews'})).metrics.total,0);
      await pool.query('UPDATE project_memberships SET role=$3 WHERE project_id=$1 AND user_id=$2',[project,user,role]);
    }
    await pool.query('UPDATE aor_nodes SET retired_at=NOW() WHERE id=$1',[area]);assert.equal((await read({cohort:'linkedCrews'})).metrics.total,0);
    await pool.query('UPDATE aor_nodes SET retired_at=NULL WHERE id=$1',[area]);
    await pool.query('UPDATE aor_assignments SET deactivated_at=NOW() WHERE user_id=$1',[sup]);assert.equal((await read({cohort:'linkedCrews'})).metrics.total,0);assert.equal((await read()).metrics.total,0);
    await pool.query('UPDATE aor_assignments SET deactivated_at=NULL WHERE user_id=$1',[sup]);
    await pool.query(`UPDATE projects SET status='ARCHIVED' WHERE id=$1`,[project]);assert.equal((await read({cohort:'linkedCrews'})).metrics.total,3);
    await pool.query(`UPDATE projects SET status='ACTIVE' WHERE id=$1`,[project]);
    console.log(`Superintendent PostgreSQL population scenarios passed: ${scenarios}`);
  }finally{await pool.end();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
