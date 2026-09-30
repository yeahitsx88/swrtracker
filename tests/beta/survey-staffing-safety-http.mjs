import assert from 'node:assert/strict';
import { Pool } from 'pg';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
const url=new URL(process.env.DATABASE_URL??'');
if(process.env.SWR_TEAM_POSTGRES!=='1'||url.hostname!=='127.0.0.1'||url.port!=='15489'||url.pathname!=='/swr_team_isolated')throw Error('Disposable staffing fixture only');
const id=n=>`20000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const tenant=id(1),project=id(700),manager=id(709),chief=id(701),im=id(703),im2=id(710),superintendent=id(705),area=id(706);
const pool=new Pool({connectionString:url.href});
try{
  assert.equal((await pool.query('SELECT name FROM projects WHERE tenant_id=$1 AND id=$2',[tenant,project])).rows[0]?.name,'Staffing safety fixture');
  const version=(await pool.query('SELECT session_version FROM users WHERE tenant_id=$1 AND id=$2',[tenant,manager])).rows[0].session_version;
  const token=(user,sv=version)=>jwt.sign({sub:user,tenantId:tenant,sv},process.env.JWT_SECRET,{expiresIn:'1h',jwtid:randomUUID()});
  const bearer=token(manager),path=`http://127.0.0.1:3107/api/projects/${project}/survey/staffing`;let checks=0;
  const call=async(method,query='',body,key=randomUUID(),auth=bearer,expected=200)=>{
    const response=await fetch(path+query,{method,headers:{cookie:`swr_session=${auth}`,'content-type':'application/json',...(key===null?{}:{'Idempotency-Key':key})},...(body===undefined?{}:{body:JSON.stringify(body)})});
    const value=await response.json();assert.equal(response.status,expected,JSON.stringify(value));checks++;return value;
  };
  const snapshot=await call('GET','?mode=snapshot');assert.match(snapshot.snapshotToken,/^[a-f0-9]{32}$/);
  const input={expectedSnapshot:snapshot.snapshotToken,partyChiefId:chief,areaId:area,superintendentId:superintendent,instrumentManIds:[im,im2],confirmRoleChanges:true};
  const key=randomUUID();const first=await call('POST','',input,key);assert.equal(first.success,true);assert.equal(first.changed,true,'Fresh safety fixture must start with the other Superintendent');
  const beforeReplay=(await pool.query('SELECT COUNT(*)::int AS n FROM survey_staffing_events WHERE project_id=$1',[project])).rows[0].n;
  assert.deepEqual(await call('POST','',input,key),first);
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM survey_staffing_events WHERE project_id=$1',[project])).rows[0].n,beforeReplay);
  assert.equal((await call('POST','',{...input,instrumentManIds:[]},key,bearer,409)).error.code,'IDEMPOTENCY_KEY_REUSE_MISMATCH');
  assert.equal((await call('POST','',input,randomUUID(),bearer,409)).error.code,'STALE_STAFFING');
  const detail=await call('GET',`?partyChiefId=${chief}&search=no-match&limit=10`);
  assert.equal(detail.staffing.snapshotToken,(await call('GET','?mode=snapshot')).snapshotToken);assert.equal(detail.staffing.instrumentManTotal,2);
  await call('POST','',input,key,token(chief,1),403);await call('POST','',input,key,token(manager,1),401);
  await call('POST','',input,null,bearer,400);await call('POST','',{...input,expectedSnapshot:undefined},randomUUID(),bearer,400);
  console.log(`Actual production staffing safety HTTP checks passed: ${checks}`);
}finally{await pool.end();}
