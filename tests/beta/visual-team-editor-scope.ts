import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {getPool} from '../../src/lib/db';
import {signToken} from '../../src/lib/auth';
import type {UUID} from '../../src/shared/types';
async function main(){
const url=new URL(process.env.DATABASE_URL??'');assert.equal(process.env.SWR_VISUAL_TEAM,'198');assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'15500');assert.equal(url.pathname,'/swr_team_isolated');
const owner=JSON.parse(await readFile('.local/alpha-acceptance197/ownership.json','utf8'));assert.equal(owner.hostPort,15500);assert.match(owner.container,/^swr-alpha-acceptance197-db-[a-f0-9]{8}$/);
const f=JSON.parse(await readFile('.local/visual-team198/fixture.json','utf8')),pg=getPool(),company=randomUUID();
try{await pg.query("INSERT INTO companies(id,tenant_id,name,type) VALUES($1,$2,'Owned Visual198 subcontractor refusal','SUBCONTRACTOR')",[company,f.tenant]);
for(const restricted of [false,true]){const user=randomUUID();await pg.query("INSERT INTO users(id,tenant_id,company_id,email,name,password_hash) VALUES($1,$2,$3,$4,'Owned no-team Superintendent','synthetic-no-login')",[user,f.tenant,restricted?company:f.company,user+'@visual198.invalid']);await pg.query("INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,'SURVEY_SUPERINTENDENT')",[f.project,user]);
const response=await fetch('http://127.0.0.1:3213/api/projects/'+f.project+'/survey/organization',{headers:{cookie:'swr_session='+signToken(user as UUID,f.tenant as UUID)}});
assert.equal(response.status,restricted?403:200);
if(!restricted){const data=await response.json();assert.deepEqual(data.personnel.map((p:{userId:string})=>p.userId),[user]);assert.deepEqual(data.teams,[]);assert.deepEqual(data.staffing,[]);assert.equal(data.scope,'SUPERINTENDENT');}}
await writeFile('.local/visual-team198/results/scope.json',JSON.stringify({checks:2,cases:['No-team Superintendent receives only current own identity without Area-derived workforce','Subcontractor Superintendent cannot read graph (existing current authority403)']},null,2));console.log('2 actual scoped HTTP checks passed; all owned synthetic identities retained');}finally{await pg.end();}}
main().catch(error=>{console.error(error);process.exitCode=1;});
