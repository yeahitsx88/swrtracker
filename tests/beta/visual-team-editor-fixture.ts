import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {NextRequest} from 'next/server';
import {getPool} from '../../src/lib/db';
import {signToken} from '../../src/lib/auth';
import {handlePostSurveyTeam} from '../../src/app/api/projects/[projectId]/survey/teams/handler';
import type {UUID} from '../../src/shared/types';
async function main(){
 const url=new URL(process.env.DATABASE_URL??'');assert.equal(process.env.SWR_VISUAL_TEAM,'198');assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'15500');assert.equal(url.pathname,'/swr_team_isolated');
 const own=JSON.parse(await readFile('.local/alpha-acceptance197/ownership.json','utf8'));assert.equal(own.owner,'Alpha acceptance197');assert.equal(own.hostPort,15500);assert.match(own.container,/^swr-alpha-acceptance197-db-[a-f0-9]{8}$/);
 const pg=getPool(),tenant=randomUUID(),foreignTenant=randomUUID(),company=randomUUID(),foreignCompany=randomUUID(),project=randomUUID(),archivedProject=randomUUID(),foreignProject=randomUUID(),level=randomUUID(),areas=[randomUUID(),randomUUID()],people:Record<string,string>={},tokens:Record<string,string>={};
 const roles:Record<string,string>={manager:'SURVEY_MANAGER',superintendent:'SURVEY_SUPERINTENDENT',otherSuperintendent:'SURVEY_SUPERINTENDENT',chief:'PARTY_CHIEF',secondChief:'PARTY_CHIEF',otherChief:'PARTY_CHIEF',instrument:'INSTRUMENT_MAN',secondInstrument:'INSTRUMENT_MAN',otherInstrument:'INSTRUMENT_MAN',available:'INSTRUMENT_MAN',requester:'REQUESTER',viewer:'VIEWER',admin:'PROJECT_ADMIN',foreignManager:'SURVEY_MANAGER'};
 try{
 await pg.query("INSERT INTO tenants(id,name) VALUES($1,'Owned Visual198'),($2,'Owned Foreign Visual198')",[tenant,foreignTenant]);
 await pg.query("INSERT INTO companies(id,tenant_id,name,type) VALUES($1,$2,'Owned visual GC','GC'),($3,$4,'Owned foreign visual GC','GC')",[company,tenant,foreignCompany,foreignTenant]);
 for(const [p,t,name]of[[project,tenant,'Owned Visual198'],[archivedProject,tenant,'Owned archived Visual198'],[foreignProject,foreignTenant,'Owned foreign Visual198']])await pg.query("INSERT INTO projects(id,tenant_id,name,status,crew_build) VALUES($1,$2,$3,'ACTIVE','FULL')",[p,t,name]);
 for(const [who,role]of Object.entries(roles)){
  const user=randomUUID(),foreign=who==='foreignManager',t=foreign?foreignTenant:tenant,c=foreign?foreignCompany:company;people[who]=user;
  await pg.query("INSERT INTO users(id,tenant_id,company_id,email,name,password_hash) VALUES($1,$2,$3,$4,$5,'synthetic-no-login')",[user,t,c,user+'@visual198.invalid','Visual '+who]);
  for(const p of foreign?[foreignProject]:[project,archivedProject])await pg.query('INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,$3)',[p,user,role]);tokens[who]=signToken(user as UUID,t as UUID);
 }
 await pg.query("INSERT INTO project_admin_grants(tenant_id,project_id,user_id,granted_by,origin) VALUES($1,$2,$3,$4,'EXPLICIT')",[tenant,project,people.admin,people.manager]);
 await pg.query("INSERT INTO aor_levels(id,tenant_id,project_id,depth,label) VALUES($1,$2,$3,0,'Area')",[level,tenant,project]);
 for(const [i,a]of areas.entries())await pg.query('INSERT INTO aor_nodes(id,tenant_id,project_id,level_id,name,code) VALUES($1,$2,$3,$4,$5,$6)',[a,tenant,project,level,i?'Visual South':'Visual North',i?'V198S':'V198N']);
 for(const who of ['superintendent','otherSuperintendent'])for(const a of areas)await pg.query('INSERT INTO aor_assignments(tenant_id,project_id,user_id,aor_node_id) VALUES($1,$2,$3,$4)',[tenant,project,people[who],a]);
 for(const who of ['chief','secondChief','otherChief']){
  const a=who==='otherChief'?areas[1]:areas[0],sup=who==='otherChief'?people.otherSuperintendent:people.superintendent;
  await pg.query('INSERT INTO aor_assignments(tenant_id,project_id,user_id,aor_node_id) VALUES($1,$2,$3,$4)',[tenant,project,people[who],a]);
  await pg.query('INSERT INTO survey_reporting_links(tenant_id,project_id,superintendent_id,party_chief_id,aor_node_id,assigned_by) VALUES($1,$2,$3,$4,$5,$6)',[tenant,project,sup,people[who],a,people.manager]);
 }
 for(const [chief,im]of [['chief','instrument'],['secondChief','secondInstrument'],['otherChief','otherInstrument']] as const)await pg.query('INSERT INTO crew_rosters(tenant_id,project_id,party_chief_id,instrument_man_id) VALUES($1,$2,$3,$4)',[tenant,project,people[chief],people[im]]);
 const create=async(name:string,sup:string,members:string[],primary:string)=>{
  const response=await handlePostSurveyTeam(new NextRequest('http://localhost/api/projects/'+project+'/survey/teams',{method:'POST',headers:{cookie:'swr_session='+tokens.manager,'Idempotency-Key':randomUUID(),'content-type':'application/json'},body:JSON.stringify({name,areaId:primary,areaIds:areas,leadUserId:people[sup],memberIds:members.map(w=>people[w])})}),{params:Promise.resolve({projectId:project})});
  const value=await response.json();assert.equal(response.status,201,JSON.stringify(value));return value.teamId;
 };
 const teamA=await create('Visual Team North','superintendent',['superintendent','chief','secondChief','instrument','secondInstrument'],areas[0]!);
 const teamB=await create('Visual Team South','otherSuperintendent',['otherSuperintendent','otherChief','otherInstrument'],areas[1]!);
 await pg.query("UPDATE projects SET status='ARCHIVED' WHERE id=$1",[archivedProject]);
 const retained=randomUUID();
 await pg.query(`INSERT INTO tickets(id,tenant_id,project_id,company_id,requester_id,aor_node_id,ticket_number,workflow_variant,status,craft,description,ticket_type,requested_date,first_submitted_at,completed_at,assigned_party_chief_id,assigned_instrument_man_id)
 VALUES($1,$2,$3,$4,$5,$6,'V198-RETAINED','STANDARD_APPROVAL','COMPLETED','Survey','Synthetic retained assignment witness','LAYOUT',CURRENT_DATE,NOW()-INTERVAL '2 days',NOW()-INTERVAL '1 day',$7,$8)`,[retained,tenant,project,company,people.requester,areas[0],people.chief,people.instrument]);
 await pg.query("INSERT INTO ticket_events(ticket_id,tenant_id,actor_id,event_type,payload) VALUES($1,$2,$3,'ticket.completed','{}')",[retained,tenant,people.instrument]);
 await pg.query('INSERT INTO ticket_assignment_history(tenant_id,ticket_id,party_chief_id,instrument_man_id,assigned_by,ended_at,end_reason) VALUES($1,$2,$3,$4,$5,NOW(),$6)',[tenant,retained,people.chief,people.instrument,people.manager,'Synthetic completed witness']);
 await mkdir('.local/visual-team198',{recursive:true});await writeFile('.local/visual-team198/fixture.json',JSON.stringify({ownership:'New UUID Visual198 population in currently owned Alpha acceptance197 database; all prior fixtures retained',tenant,foreignTenant,company,project,archivedProject,foreignProject,people,tokens,areas,teamA,teamB}));
 console.log('Fresh owned Visual198 identities and governed teams created; private manifest retained');
 }finally{await pg.end();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
