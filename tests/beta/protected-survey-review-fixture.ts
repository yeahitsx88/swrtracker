import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {NextRequest} from 'next/server';
import {getPool} from '../../src/lib/db';
import {signToken} from '../../src/lib/auth';
import {handlePostSurveyTeam as TEAM} from '../../src/app/api/projects/[projectId]/survey/teams/handler';
import type {UUID} from '../../src/shared/types';
async function main(){
 const url=new URL(process.env.DATABASE_URL??'');assert.equal(process.env.SWR_FINALIZATION_TEST,'1');assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'15498');assert.equal(url.pathname,'/swr_finalization_184');
 const pool=getPool(),checks:string[]=[],prior=JSON.parse(await readFile('.local/finalization/fixture.json','utf8'));assert.equal((await pool.query('SELECT name FROM tenants WHERE id=$1',[prior.tenant])).rows[0]?.name,'Owned Finalization 184');
 const tenant=randomUUID(),foreignTenant=randomUUID(),project=randomUUID(),otherProject=randomUUID(),foreignProject=randomUUID(),company=randomUUID(),scCompany=randomUUID(),foreignCompany=randomUUID(),level=randomUUID(),area=randomUUID(),area2=randomUUID(),area3=randomUUID();
 const people:Record<string,string>={},tokens:Record<string,string>={},roles:Record<string,string>={secondChief:'PARTY_CHIEF',freeInstrument:'INSTRUMENT_MAN',manager:'SURVEY_MANAGER',admin:'VIEWER',superintendent:'SURVEY_SUPERINTENDENT',destinationLead:'SURVEY_SUPERINTENDENT',chief:'PARTY_CHIEF',instrument:'INSTRUMENT_MAN',instrument2:'INSTRUMENT_MAN',destinationChief:'PARTY_CHIEF',requester:'REQUESTER',viewer:'VIEWER',subcontractor:'SURVEY_MANAGER',foreignManager:'SURVEY_MANAGER'};
 for(const who of Object.keys(roles))people[who]=randomUUID();
 await pool.query("INSERT INTO tenants(id,name) VALUES($1,'Owned surveyReview193'),($2,'Owned foreign surveyReview193')",[tenant,foreignTenant]);
 await pool.query("INSERT INTO companies(id,tenant_id,name,type) VALUES($1,$2,'Owned GC','GC'),($3,$2,'Owned subcontractor','SUBCONTRACTOR'),($4,$5,'Owned foreign GC','GC')",[company,tenant,scCompany,foreignCompany,foreignTenant]);
 for(const [id,t] of [[project,tenant],[otherProject,tenant],[foreignProject,foreignTenant]])await pool.query("INSERT INTO projects(id,tenant_id,name,status,crew_build) VALUES($1,$2,'Owned protected Survey review','ACTIVE','FULL')",[id,t]);
 for(const [who,id] of Object.entries(people)){const foreign=who==='foreignManager',t=foreign?foreignTenant:tenant,p=foreign?foreignProject:project;await pool.query("INSERT INTO users(id,tenant_id,company_id,email,name,password_hash) VALUES($1,$2,$3,$4,$5,'no-login-fixture')",[id,t,foreign?foreignCompany:who==='subcontractor'?scCompany:company,id+'@surveyReview193.invalid','Review '+who]);await pool.query('INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,$3)',[p,id,roles[who]]);tokens[who]=signToken(id as UUID,t as UUID);}
 await pool.query("INSERT INTO tenant_memberships(tenant_id,user_id,role) VALUES($1,$2,'TENANT_ADMIN')",[tenant,people.admin!]);await pool.query("INSERT INTO project_admin_grants(tenant_id,project_id,user_id,origin,granted_by) VALUES($1,$2,$3,'EXPLICIT',$4)",[tenant,project,people.admin!,people.manager!]);
 await pool.query("INSERT INTO aor_levels(id,tenant_id,project_id,depth,label) VALUES($1,$2,$3,0,'Area')",[level,tenant,project]);for(const [id,name]of[[area,'Source Area'],[area2,'Transfer Area'],[area3,'Retained Coverage']])await pool.query('INSERT INTO aor_nodes(id,tenant_id,project_id,level_id,name,code) VALUES($1,$2,$3,$4,$5,$6)',[id,tenant,project,level,name,id]);
 for(const [who,areas]of[['superintendent',[area,area2]],['destinationLead',[area,area2]],['secondChief',[area]],['chief',[area]],['destinationChief',[area2]]] as const)for(const a of areas)await pool.query('INSERT INTO aor_assignments(tenant_id,project_id,user_id,aor_node_id) VALUES($1,$2,$3,$4)',[tenant,project,people[who],a]);
 await pool.query('INSERT INTO survey_reporting_links(tenant_id,project_id,superintendent_id,party_chief_id,aor_node_id,assigned_by) VALUES($1,$2,$3,$4,$5,$6)',[tenant,project,people.superintendent!,people.chief!,area,people.manager!]);for(const who of ['instrument','instrument2'])await pool.query('INSERT INTO crew_rosters(tenant_id,project_id,party_chief_id,instrument_man_id) VALUES($1,$2,$3,$4)',[tenant,project,people.chief!,people[who]]);
 const context=(id=project)=>({params:Promise.resolve({projectId:id})});
 async function result(response:Promise<Response>,status:number,label:string){const r=await response;assert.equal(r.status,status,label);checks.push(label);return r.json();}
 async function team(name:string,lead:string,ids:string[],areas:string[],primary:string){const body={teamId:null,expectedVersion:null,name,areaId:primary,areaIds:areas,leadUserId:lead,memberIds:ids};const req=new NextRequest('http://localhost/api/projects/'+project+'/survey/teams',{method:'POST',headers:{cookie:'swr_session='+tokens.manager,'content-type':'application/json','Idempotency-Key':randomUUID()},body:JSON.stringify(body)});return(await result(TEAM(req,context()),201,'Current Manager creates '+name)).teamId as string;}
 const source=await team('Source multi-Area team',people.superintendent!,[people.superintendent!,people.chief!,people.instrument!,people.instrument2!,people.secondChief!,people.freeInstrument!,...Object.keys(roles).filter(w=>w.startsWith('pageChief')).map(w=>people[w]!) ],[area,area2],area),destination=await team('Destination complete coverage',people.destinationLead!,[people.destinationLead!,people.destinationChief!],[area2,area3],area3);
 await pool.query('INSERT INTO survey_reporting_links(tenant_id,project_id,superintendent_id,party_chief_id,aor_node_id,assigned_by) VALUES($1,$2,$3,$4,$5,$6)',[tenant,project,people.superintendent!,people.secondChief!,area,people.manager!]);
 await writeFile('.local/finalization/protected-survey-review-fixture.json',JSON.stringify({tenant,foreignTenant,project,otherProject,foreignProject,company,people,tokens,area,area2,area3,source,destination}));
 console.log(JSON.stringify({checks:checks.length,cases:checks}));await pool.end();
}
main().catch(error=>{console.error(error);process.exitCode=1;});
