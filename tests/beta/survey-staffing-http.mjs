import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';

// Read-only HTTP check after the isolated PostgreSQL staffing fixture.
const dbUrl=new URL(process.env.DATABASE_URL??'');
if(process.env.SWR_TEAM_POSTGRES!=='1'||dbUrl.hostname!=='127.0.0.1'||dbUrl.port!=='15489'||dbUrl.pathname!=='/swr_team_isolated')throw new Error('Disposable loopback staffing fixture only');
const id=n=>`20000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const tenant=id(1),project=id(2),manager=id(3),chief=id(7),otherTenant=id(11),outsider=id(13);
const origin='http://127.0.0.1:3107',path=`/api/projects/${project}/survey/staffing`;
const token=(user,version=1,userTenant=tenant)=>jwt.sign({sub:user,tenantId:userTenant,sv:version},process.env.JWT_SECRET,{expiresIn:'1h',jwtid:randomUUID()});
const managerToken=token(manager,2),observations=[];
async function read(query,expected=200,bearer=managerToken,resource=path){
  const start=performance.now();const response=await fetch(`${origin}${resource}?${query}`,{headers:{cookie:`swr_session=${bearer}`}});
  const value=await response.json();assert.equal(response.status,expected,JSON.stringify(value));
  observations.push({status:response.status,ms:Math.round(performance.now()-start)});return value.staffing;
}
const scope=`partyChiefId=${chief}`;
const detail=await read(`${scope}&limit=10`);
assert.equal(detail.partyChief.userId,chief);assert.equal(detail.areas.total,101);assert.equal(detail.areas.data.length,100);assert.equal(detail.areas.truncated,true);
assert.equal(detail.instrumentManTotal,24);assert.equal(detail.instrumentMen.limit,10);assert.equal(detail.instrumentMen.data.length,10);
assert.equal(detail.reporting,null,'Detached reporting link must not be inferred from team or Area');
assert.equal((await read(`${scope}&search=fixture-23%40&limit=10`)).instrumentMen.total,1);
assert.equal((await read(`${scope}&offset=100&limit=10`)).instrumentMen.data.length,0);
await read(scope,403,token(chief));await read(scope,403,token(outsider,1,otherTenant));await read(scope,401,token(manager,1));
await read(`${scope}&actorRole=SURVEY_MANAGER`,400);await read(`${scope}&limit=10&limit=25`,400);
await read(`partyChiefId=${id(9999)}`,404);await read(scope,403,managerToken,`/api/projects/${id(10)}/survey/staffing`);
console.log(`Actual production staffing HTTP scenarios passed: ${observations.length}`);
console.log(JSON.stringify(observations));
