import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import {Pool} from 'pg';
assert.equal(process.env.SWR_METRICS_ACCEPTANCE,'214');
const dir='.local/alpha-closure214',schema=JSON.parse(await fs.readFile(dir+'/schema.json','utf8')).schema;
const settings=Object.fromEntries((await fs.readFile(dir+'/host.env','utf8')).split(/\r?\n/).filter(x=>x.includes('=')).map(x=>{const i=x.indexOf('=');return[x.slice(0,i),x.slice(i+1)];}));
const url=new URL(settings.DATABASE_URL),own=JSON.parse(await fs.readFile('.local/alpha-acceptance197/ownership.json','utf8'));
assert.equal(own.owner,'Alpha acceptance197');assert.equal(own.hostPort,15500);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'15500');assert.equal(url.pathname,'/swr_team_isolated');assert.match(schema,/^alpha_metrics214_[a-f0-9]{32}$/);assert.equal(url.searchParams.get('options'),'-c search_path='+schema+',public');
const id=n=>`20000000-0000-4000-8000-${String(n).padStart(12,'0')}`,project=id(2),tenant=id(1),sup=id(9);
const origin='http://127.0.0.1:3232';let scenarios=0;
const token=(user,sv=1,tenantId=tenant)=>jwt.sign({sub:user,tenantId,sv},settings.JWT_SECRET,{expiresIn:'1h',jwtid:randomUUID()});
const bearer=token(sup);
const read=async(path,expected=200,cookie=bearer)=>{const response=await fetch(origin+path,{headers:{cookie:`swr_session=${cookie}`}});const data=await response.json();assert.equal(response.status,expected,JSON.stringify(data));scenarios++;return data;};
const metrics=`/api/projects/${project}/metrics?view=charts`,tickets=`/api/tickets?projectId=${project}&limit=10&queue=all`;
const wide=await read(metrics);assert.equal(wide.metrics.total,7);assert.equal(wide.analytics.scopeKind,'areaWorkload');assert.equal(wide.analytics.personnelFilters,false);
const linked=await read(metrics+'&cohort=linkedCrews');assert.equal(linked.metrics.total,3);assert.equal(linked.analytics.scopeKind,'linkedCrews');assert.equal(linked.analytics.personnelFilters,true);assert.equal(linked.analytics.linkedCrewCount,1);
assert.equal((await read(tickets)).total,7);assert.equal((await read(tickets+'&cohort=linkedCrews')).total,3);
// Batch66 assigned-workforce contract denies a Chief outside the current pool.
await read(metrics+`&cohort=linkedCrews&crewId=${id(16)}`,404);
assert.equal((await read(tickets+`&cohort=linkedCrews&crewId=${id(16)}`)).total,0);
await read(metrics+`&crewId=${id(7)}`,403);await read(metrics+'&cohort=all',400);await read(tickets+'&cohort=linkedCrews&cohort=areaWorkload',400);
await read(metrics+'&cohort=linkedCrews',403,token(id(7)));await read(tickets+'&cohort=linkedCrews',403,token(id(7)));
await read(metrics+'&cohort=linkedCrews',404,token(id(13),1,id(11)));await read(tickets+'&cohort=linkedCrews',403,token(id(13),1,id(11)));
await read(metrics+'&cohort=linkedCrews',401,token(sup,99));await read(metrics+'&cohort=linkedCrews&actorRole=SURVEY_MANAGER',400);

const pg=new Pool({connectionString:url.href});
let managerCharts,activity;
try{
 const managerVersion=(await pg.query('SELECT session_version FROM users WHERE tenant_id=$1 AND id=$2',[tenant,id(3)])).rows[0].session_version,managerToken=token(id(3),managerVersion);
 managerCharts=await read(metrics,200,managerToken);assert.equal(managerCharts.metrics.total,8);assert.equal(managerCharts.metrics.openTotal,7);assert.equal(managerCharts.metrics.completedTotal,1);assert.equal(managerCharts.metrics.approvedWithoutInstrumentMan,1);
 const managerList=await read(tickets,200,managerToken);assert.equal(managerList.total,8);
 activity=(await read('/api/projects/'+project+'/metrics?view=activity&dateFrom=2026-09-01&dateTo=2026-09-03',200,managerToken)).activity;
 assert.equal(activity.timezone,'UTC');assert.deepEqual(activity.days,[{date:'2026-09-01',submitted:8,recordedCompletions:0},{date:'2026-09-02',submitted:0,recordedCompletions:0},{date:'2026-09-03',submitted:0,recordedCompletions:1}]);assert.equal(activity.excludedSyntheticCompletions,0);
 const completedActivity=(await read('/api/projects/'+project+'/metrics?view=activity&dateFrom=2026-09-01&dateTo=2026-09-03&status=COMPLETED',200,managerToken)).activity;assert.equal(completedActivity.days[0].submitted,1);assert.equal(completedActivity.days[2].recordedCompletions,1);
 assert.equal((await read(metrics+'&dateBasis=needBy&dateFrom=2030-01-01',200,managerToken)).metrics.total,0);
 await read('/api/projects/'+project+'/metrics?view=activity&dateFrom=2026-01-01&dateTo=2026-09-03',400,managerToken);
 await read('/api/projects/'+project+'/metrics?view=activity&dateFrom=2026-09-01&dateTo=2026-09-03',403,bearer);
 await read('/api/projects/'+project+'/metrics?view=activity&population=completed',400,managerToken);
}finally{await pg.end();}
console.log(`Actual production scoped metric/date HTTP scenarios passed: ${scenarios}`);
await fs.writeFile(dir+'/http-results.json',JSON.stringify({checks:scenarios,areaTotal:wide.metrics.total,linkedTotal:linked.metrics.total,managerTotal:managerCharts.metrics.total,activity,scope:'Actual Superintendent/Manager metric/list/date/refusal checks'},null,2));
