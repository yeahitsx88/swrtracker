import assert from 'node:assert/strict';
import {Pool} from 'pg';
import jwt from 'jsonwebtoken';
import {randomUUID} from 'node:crypto';
const url=new URL(process.env.DATABASE_URL??'');
if(process.env.SWR_TEAM_POSTGRES!=='1'||url.hostname!=='127.0.0.1'||url.port!=='15489'||url.pathname!=='/swr_team_isolated')throw Error('Named disposable loopback fixture only');
const id=n=>`98000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const pg=new Pool({connectionString:url.href});let checks=0;
const project=randomUUID(),level=randomUUID(),area=randomUUID(),area2=randomUUID(),johnGrant=randomUUID(),jasonGrant=randomUUID(),johnAssignment=randomUUID(),jasonAssignment=randomUUID(),ticket=randomUUID();
const path=`http://127.0.0.1:3107/api/projects/${project}/survey/protected-obligations`;
const token=(n,options={})=>jwt.sign({sub:id(n),tenantId:id(1),sv:1},process.env.JWT_SECRET,{expiresIn:'1h',jwtid:randomUUID(),...options});
const manager=token(10),jason=token(12),it=token(17);
const call=async(method,query='',body,status=200,bearer=manager,key=randomUUID(),resource=path)=>{
 const response=await fetch(resource+query,{method,headers:{cookie:`swr_session=${bearer}`,'content-type':'application/json','idempotency-key':key},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const result=await response.json();assert.equal(response.status,status,JSON.stringify(result));assert.equal(response.headers.get('cache-control'),'private, no-store');checks+=2;return result;
};
try{
 assert.equal((await pg.query('SELECT name FROM tenants WHERE id=$1',[id(1)])).rows[0]?.name,'Protected reviewer disposable');checks++;
 const db=await pg.connect();
 try{
  await db.query('BEGIN');
  await db.query("INSERT INTO projects(id,tenant_id,name,status) VALUES($1,$2,'Reviewer HTTP disposable','ACTIVE')",[project,id(1)]);
  for(const [n,role] of [[10,'SURVEY_MANAGER'],[11,'SURVEY_SUPERINTENDENT'],[12,'SURVEY_SUPERINTENDENT'],[13,'SURVEY_SUPERINTENDENT'],[14,'PROJECT_ADMIN']])await db.query('INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,$3)',[project,id(n),role]);
  await db.query("INSERT INTO aor_levels(id,tenant_id,project_id,depth,label) VALUES($1,$2,$3,0,'Area')",[level,id(1),project]);
  for(const [node,name] of [[area,'Area1'],[area2,'Area2']])await db.query('INSERT INTO aor_nodes(id,tenant_id,project_id,level_id,name,code) VALUES($1,$2,$3,$4,$5,$5)',[node,id(1),project,level,name]);
  for(const [grant,user,node,assignment] of [[johnGrant,id(11),area,johnAssignment],[jasonGrant,id(12),area2,jasonAssignment]]){
   await db.query("INSERT INTO project_responsibility_grants(id,tenant_id,project_id,user_id,aor_node_id,responsibility,granted_by) VALUES($1,$2,$3,$4,$5,'SURVEY_REVIEWER',$6)",[grant,id(1),project,user,node,id(14)]);
   await db.query('INSERT INTO aor_assignments(id,tenant_id,project_id,user_id,aor_node_id) VALUES($1,$2,$3,$4,$5)',[assignment,id(1),project,user,node]);
  }
  await db.query("INSERT INTO tickets(id,tenant_id,project_id,aor_node_id,company_id,ticket_number,requester_id,workflow_variant,status,craft,description,requested_date,ticket_type,submitted_at) VALUES($1,$2,$3,$4,$5,$6,$7,'STANDARD_APPROVAL','SUBMITTED','Survey','Disposable HTTP proof','2026-10-10','LAYOUT',now())",[ticket,id(1),project,area,id(2),'HTTP-'+ticket,id(10)]);
  await db.query('COMMIT');
 }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
 const before=(await pg.query('SELECT to_jsonb(t) AS row FROM tickets t WHERE id=$1',[ticket])).rows;
 const otherCoverage=(await pg.query('SELECT to_jsonb(g) AS row FROM project_responsibility_grants g WHERE id=$1',[jasonGrant])).rows;
 const read=await call('GET',`?mode=obligations&userId=${id(11)}`);
 const candidates=await call('GET',`?mode=candidates&userId=${id(11)}&grantId=${johnGrant}`);
 assert.equal(candidates.snapshotToken,read.snapshotToken);assert.equal(candidates.candidates.data.find(p=>p.userId===id(12)).missingReviewGrant,true);checks+=2;
 await call('GET',`?mode=obligations&userId=${id(11)}`,undefined,200,it);
 await call('GET','?mode=personnel&mode=personnel',undefined,400);
 await call('GET','?mode=personnel&actorRole=SURVEY_MANAGER',undefined,400);
 await call('GET','?mode=personnel',undefined,403,token(16));
 await call('GET','?mode=personnel',undefined,401,token(10,{expiresIn:-1}));
 await call('GET',`?mode=candidates&userId=${id(11)}&grantId=${jasonGrant}`,undefined,404);
 const body={userId:id(11),grantId:johnGrant,replacementUserId:id(12),expectedSnapshot:read.snapshotToken,coverageMode:'assignAdditional',confirmResolution:true,confirmAdditionalCoverage:true,coverageIntent:'TEMPORARY'};
 await call('POST','',{...body,areaId:area2},400);
 await call('POST','',{...body,confirmAdditionalCoverage:false},400);
 await call('POST','',body,403,token(16));
 await call('POST','',{...body,expectedSnapshot:'f'.repeat(32)},409);
 assert.equal((await pg.query('SELECT count(*)::int AS n FROM access_grant_events WHERE project_id=$1',[project])).rows[0].n,0);checks++;
 const inaccessible=await fetch(`http://127.0.0.1:3107/api/tickets/${ticket}`,{headers:{cookie:`swr_session=${jason}`}});assert.equal(inaccessible.status,404);checks++;
 const key=randomUUID(),result=await call('POST','',body,200,manager,key);
 assert.equal(result.createdReviewGrant,true);assert.equal(result.createdIndividualAssignment,true);checks+=2;
 assert.deepEqual(await call('POST','',body,200,manager,key),result);checks++;
 assert.deepEqual((await pg.query('SELECT to_jsonb(t) AS row FROM tickets t WHERE id=$1',[ticket])).rows,before);checks++;
 assert.deepEqual((await pg.query('SELECT to_jsonb(g) AS row FROM project_responsibility_grants g WHERE id=$1',[jasonGrant])).rows,otherCoverage);checks++;
 assert.equal((await pg.query('SELECT deactivated_at FROM aor_assignments WHERE id=$1',[johnAssignment])).rows[0].deactivated_at,null);checks++;
 const visible=await fetch(`http://127.0.0.1:3107/api/tickets/${ticket}`,{headers:{cookie:`swr_session=${jason}`}});assert.equal(visible.status,200);checks++;
 const reviewed=await fetch(`http://127.0.0.1:3107/api/tickets/${ticket}/approve`,{method:'POST',headers:{cookie:`swr_session=${jason}`,'idempotency-key':randomUUID()}});assert.equal(reviewed.status,200,await reviewed.text());checks++;
 const added=await call('GET',`?mode=obligations&userId=${id(12)}`);
 const later={...body,userId:id(12),grantId:result.replacementGrantId,replacementUserId:id(13),expectedSnapshot:added.snapshotToken,coverageIntent:'PERMANENT'};
 const permanent=await call('POST','',later,200,it);
 const evidence=(await pg.query('SELECT resolution_evidence AS evidence FROM access_grant_events WHERE id=$1',[permanent.resolutionEventId])).rows[0].evidence;
 assert.equal(evidence.coverageIntent,'PERMANENT');assert.equal(evidence.temporaryCoverage,false);assert.equal(evidence.authority.branch,'TENANT_ADMIN');checks+=3;
 assert.deepEqual((await pg.query('SELECT to_jsonb(g) AS row FROM project_responsibility_grants g WHERE id=$1',[jasonGrant])).rows,otherCoverage);checks++;
 const deniedAdmin=await fetch(`http://127.0.0.1:3107/api/projects/${project}/company-authority`,{headers:{cookie:`swr_session=${manager}`}});assert.equal(deniedAdmin.status,403);checks++;
 await pg.query("UPDATE projects SET status='ARCHIVED' WHERE id=$1",[project]);
 await call('GET',`?mode=obligations&userId=${id(13)}`);
 await call('POST','',body,409,manager,key);
 console.log(`PASS ${checks} actual production HTTP reviewer handover checks; fixture project ${project}`);
}finally{await pg.end();}
