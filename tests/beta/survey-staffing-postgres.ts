import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { NextRequest } from 'next/server';
import { signToken, requireActiveAuth } from '../../src/lib/auth';
import { getProjectRole } from '../../src/lib/get-project-role';
import { SurveyStaffingPgRepository } from '../../src/modules/tenancy/infrastructure/survey-staffing.repository';
import { handleGetSurveyStaffing, type StaffingDeps } from '../../src/app/api/projects/[projectId]/survey/staffing/handler';
import type { DbClient, UUID } from '../../src/shared/types';
import { executeIdempotentHttpMutation } from '../../src/lib/idempotency';

// Run survey-teams-postgres.ts first on its fresh fixture. Never target Sabine.
const id=(n:number)=>`20000000-0000-4000-8000-${String(n).padStart(12,'0')}` as UUID;
const tenant=id(1),project=id(2),manager=id(3),company=id(4),area=id(5),level=id(6),chief=id(7),im=id(8),superintendent=id(9);
const otherProject=id(10),otherTenant=id(11),outsider=id(13),otherChief=id(16),sameTenantProject=id(17);

async function main(){
  const url=new URL(process.env.DATABASE_URL??'');
  if(process.env.SWR_TEAM_POSTGRES!=='1'||url.hostname!=='127.0.0.1'||url.port!=='15489'||url.pathname!=='/swr_team_isolated')throw new Error('Disposable loopback team fixture only');
  const pool=new Pool({connectionString:url.href,max:4});let scenarios=0;
  const transaction=async<T>(fn:(db:DbClient)=>Promise<T>)=>{
    const client=await pool.connect();try{await client.query('BEGIN');const value=await fn(client);await client.query('COMMIT');return value;}
    catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  };
  try{
    assert.equal((await pool.query('SELECT COUNT(*)::int AS count FROM tenants')).rows[0].count,2);
    assert.equal((await pool.query('SELECT name FROM tenants WHERE id=$1',[tenant])).rows[0]?.name,'Team test');
    assert.equal((await pool.query('SELECT session_version FROM users WHERE id=$1',[manager])).rows[0]?.session_version,2);
    assert.equal((await pool.query('SELECT COUNT(*)::int AS count FROM users WHERE id=$1',[id(1000)])).rows[0].count,0,'Fresh base fixture required; do not rerun on populated staffing fixture');
    const repo=new SurveyStaffingPgRepository();
    const deps:StaffingDeps={repo,getProjectRole,withTransaction:transaction,requireAuth:(req:NextRequest)=>requireActiveAuth(req,pool),executeIdempotent:executeIdempotentHttpMutation};
    const ctx={params:Promise.resolve({projectId:project})},token=signToken(manager,tenant,2);
    const request=(query='',bearer=token)=>new NextRequest(`http://localhost/api/projects/${project}/survey/staffing?partyChiefId=${chief}${query}`,{headers:{cookie:`swr_session=${bearer}`}});
    const call=async(query='',expected=200,bearer=token,context=ctx)=>{
      const response=await handleGetSurveyStaffing(request(query,bearer),context,deps);const body=await response.json();assert.equal(response.status,expected,JSON.stringify(body));scenarios++;return body.staffing;
    };
    const initial=await call('&limit=10');assert.equal(initial.reporting,null);assert.deepEqual(initial.areas,{data:[],total:0,limit:100,truncated:false});
    assert.equal(initial.instrumentManTotal,0,'Named team membership must not establish a roster');
    await call('',403,signToken(superintendent,tenant));await call('',403,signToken(chief,tenant));
    await call('',403,signToken(outsider,otherTenant));await call('',401,signToken(manager,tenant,1));
    await call('',403,token,{params:Promise.resolve({projectId:otherProject})});
    await call('',403,token,{params:Promise.resolve({projectId:sameTenantProject})});
    const pageQuery={search:'',limit:10,offset:0};
    assert.equal(await repo.readStaffing(pool,otherTenant,project,chief,pageQuery),null);scenarios++;
    assert.equal(await repo.readStaffing(pool,tenant,sameTenantProject,chief,pageQuery),null);scenarios++;
    assert.equal(await repo.readStaffing(pool,tenant,project,id(20),pageQuery),null);scenarios++;
    await pool.query('UPDATE users SET deactivated_at=NOW(),deactivated_by=id WHERE id=$1',[chief]);await call('',404);
    await pool.query('UPDATE users SET deactivated_at=NULL,deactivated_by=NULL WHERE id=$1',[chief]);
    await pool.query('INSERT INTO aor_assignments (tenant_id,project_id,user_id,aor_node_id) VALUES ($1,$2,$3,$4)',[tenant,project,chief,area]);
    await pool.query(`INSERT INTO survey_reporting_links (tenant_id,project_id,superintendent_id,party_chief_id,aor_node_id,assigned_by)
      VALUES ($1,$2,$3,$4,$5,$6)`,[tenant,project,superintendent,chief,area,manager]);
    await pool.query('INSERT INTO crew_rosters (tenant_id,project_id,party_chief_id,instrument_man_id) VALUES ($1,$2,$3,$4)',[tenant,project,chief,im]);
    const linked=await call('&limit=10');assert.equal(linked.reporting.superintendent.userId,superintendent);assert.equal(linked.reporting.area.id,area);
    assert.deepEqual(linked.areas.data,[{id:area,name:'Train 1',retired:false,individualAssignmentId:linked.areas.data[0].individualAssignmentId}]);
    assert.match(linked.areas.data[0].individualAssignmentId,/^[a-f0-9-]{36}$/);assert.match(linked.instrumentMen.data[0].rosterLinkId,/^[a-f0-9-]{36}$/);assert.equal(linked.instrumentMen.data[0].userId,im);
    for(let n=0;n<25;n++){
      const user=id(1000+n),name=`Fixture IM ${String(n).padStart(2,'0')}`;
      await pool.query(`INSERT INTO users (id,tenant_id,company_id,email,name,password_hash) VALUES ($1,$2,$3,$4,$5,'not-a-login-hash')`,[user,tenant,company,`fixture-${n}@example.test`,name]);
      await pool.query(`INSERT INTO project_memberships (project_id,user_id,role) VALUES ($1,$2,'INSTRUMENT_MAN')`,[project,user]);
      await pool.query('INSERT INTO crew_rosters (tenant_id,project_id,party_chief_id,instrument_man_id) VALUES ($1,$2,$3,$4)',[tenant,project,chief,user]);
    }
    await pool.query('UPDATE users SET deactivated_at=NOW(),deactivated_by=id WHERE id=$1',[id(1000)]);
    await pool.query('UPDATE crew_rosters SET deactivated_at=NOW() WHERE instrument_man_id=$1',[id(1024)]);
    const first=await call('&limit=10'),second=await call('&limit=10&offset=10');
    assert.equal(first.instrumentMen.total,25);assert.equal(first.instrumentMen.data.length,10);assert.equal(first.instrumentManTotal,25);
    assert.ok(first.instrumentMen.data.some((person:{userId:string;active:boolean})=>person.userId===id(1000)&&!person.active),'Inactive linked people remain explicit cleanup evidence');
    assert.ok(second.instrumentMen.data.every((person:{userId:string})=>!first.instrumentMen.data.some((other:{userId:string})=>other.userId===person.userId)));
    const searched=await call('&limit=10&search=fixture-23%40');assert.equal(searched.instrumentMen.total,1);assert.equal(searched.instrumentMen.data[0].userId,id(1023));assert.equal(searched.instrumentManTotal,25);
    assert.equal((await call('&search='+encodeURIComponent("' OR TRUE --"))).instrumentMen.total,0,'Search must be bound, not executable SQL');
    assert.equal((await call('&limit=10&offset=100')).instrumentMen.data.length,0);
    await pool.query('UPDATE aor_nodes SET retired_at=NOW() WHERE id=$1',[area]);
    await pool.query('UPDATE users SET deactivated_at=NOW(),deactivated_by=id WHERE id=$1',[superintendent]);
    const retired=await call();assert.equal(retired.areas.data[0].retired,true);assert.equal(retired.reporting.area.retired,true);assert.equal(retired.reporting.superintendent.active,false);
    // A linked current member with a changed role is shown as such, not relabeled.
    await pool.query(`UPDATE project_memberships SET role='REQUESTER' WHERE project_id=$1 AND user_id=$2`,[project,superintendent]);
    assert.equal((await call()).reporting.superintendent.role,'REQUESTER');
    await pool.query('UPDATE survey_reporting_links SET deactivated_at=NOW() WHERE project_id=$1 AND party_chief_id=$2',[project,chief]);
    await pool.query('UPDATE crew_rosters SET deactivated_at=NOW() WHERE project_id=$1 AND instrument_man_id=$2',[project,im]);
    await pool.query('UPDATE aor_assignments SET deactivated_at=NOW() WHERE project_id=$1 AND user_id=$2',[project,chief]);
    const detached=await call();assert.equal(detached.reporting,null);assert.equal(detached.areas.total,0);assert.equal(detached.instrumentManTotal,24);
    // Another chief's roster never leaks into this selected chief's population.
    await pool.query('INSERT INTO crew_rosters (tenant_id,project_id,party_chief_id,instrument_man_id) VALUES ($1,$2,$3,$4) ON CONFLICT(project_id,instrument_man_id) DO UPDATE SET party_chief_id=EXCLUDED.party_chief_id,deactivated_at=NULL',[tenant,project,otherChief,im]);
    assert.equal((await call()).instrumentMen.data.some((person:{userId:string})=>person.userId===im),false);
    for(let n=0;n<101;n++){
      const node=id(2000+n);await pool.query(`INSERT INTO aor_nodes (id,tenant_id,project_id,level_id,name,code) VALUES ($1,$2,$3,$4,$5,$6)`,[node,tenant,project,level,`Fixture Area ${String(n).padStart(3,'0')}`,`F${n}`]);
      await pool.query('INSERT INTO aor_assignments (tenant_id,project_id,user_id,aor_node_id) VALUES ($1,$2,$3,$4)',[tenant,project,chief,node]);
    }
    const bounded=await call();assert.equal(bounded.areas.total,101);assert.equal(bounded.areas.data.length,100);assert.equal(bounded.areas.truncated,true);
    await pool.query(`UPDATE projects SET status='ARCHIVED' WHERE id=$1`,[project]);
    const events=(await pool.query('SELECT COUNT(*)::int AS count FROM survey_staffing_events')).rows[0].count;
    assert.equal((await call('&limit=10')).areas.total,101,'Closed projects remain readable');
    assert.equal((await pool.query('SELECT COUNT(*)::int AS count FROM survey_staffing_events')).rows[0].count,events,'Read must not write events');
    await pool.query(`UPDATE projects SET status='ACTIVE' WHERE id=$1`,[project]);
    console.log(`Explicit staffing PostgreSQL/route read scenarios passed: ${scenarios}`);
  }finally{await pool.end();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
