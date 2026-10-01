import assert from 'node:assert/strict';
import {Pool} from 'pg';
import jwt from 'jsonwebtoken';
import {randomUUID} from 'node:crypto';
const url=new URL(process.env.DATABASE_URL??'');
assert.equal(process.env.SWR_TEAM_POSTGRES,'1');assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'15489');assert.equal(url.pathname,'/swr_team_isolated');
const pg=new Pool({connectionString:url.href}),id=n=>`99010000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const project=randomUUID(),level=randomUUID(),area=randomUUID(),other=randomUUID(),chief=randomUUID(),selected=randomUUID(),duplicate=randomUUID(),otherAssignment=randomUUID(),johnGrant=randomUUID(),jasonGrant=randomUUID(),jasonAssignment=randomUUID(),chiefAssignment=randomUUID(),reporting=randomUUID(),ticket=randomUUID();
const base=`http://127.0.0.1:3107/api/projects/${project}`,path=base+'/survey/staffing';let checks=0;
const equal=(a,b)=>{assert.deepEqual(a,b);checks++;};
const token=(n,sv=1,tenant=id(1))=>jwt.sign({sub:typeof n==='number'?id(n):n,tenantId:tenant,sv},process.env.JWT_SECRET,{expiresIn:'1h',jwtid:randomUUID()});
const manager=token(10);
const call=async(method,query='',body,status=200,bearer=manager,key=randomUUID(),resource=path,privateCache=true)=>{
 const response=await fetch(resource+query,{method,headers:{cookie:`swr_session=${bearer}`,'content-type':'application/json','idempotency-key':key},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const value=await response.json();assert.equal(response.status,status,JSON.stringify(value));checks++;
 if(privateCache)equal(response.headers.get('cache-control'),'private, no-store');return value;
};
try{
 equal((await pg.query('SELECT name FROM tenants WHERE id=$1',[id(1)])).rows[0]?.name,'Superintendent Area unlink disposable');
 const db=await pg.connect();try{
  await db.query('BEGIN');
  await db.query("INSERT INTO projects(id,tenant_id,name,status,crew_build) VALUES($1,$2,'Area unlink HTTP disposable','ACTIVE','FULL')",[project,id(1)]);
  await db.query("INSERT INTO users(id,tenant_id,company_id,name,email,password_hash) VALUES($1,$2,$3,'HTTP Chief',$4,'not-a-login-hash')",[chief,id(1),id(2),chief+'@example.test']);
  for(const [user,role] of [[id(10),'SURVEY_MANAGER'],[id(11),'SURVEY_SUPERINTENDENT'],[id(12),'SURVEY_SUPERINTENDENT'],[id(17),'REQUESTER'],[chief,'PARTY_CHIEF']])await db.query('INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,$3)',[project,user,role]);
  await db.query("INSERT INTO aor_levels(id,tenant_id,project_id,depth,label) VALUES($1,$2,$3,0,'Area')",[level,id(1),project]);
  for(const [node,name] of [[area,'Area1'],[other,'Area2']])await db.query('INSERT INTO aor_nodes(id,tenant_id,project_id,level_id,name,code) VALUES($1,$2,$3,$4,$5,$5)',[node,id(1),project,level,name]);
  for(const [row,user,node] of [[selected,id(11),area],[duplicate,id(11),area],[otherAssignment,id(11),other],[jasonAssignment,id(12),other],[chiefAssignment,chief,area]])await db.query('INSERT INTO aor_assignments(id,tenant_id,project_id,user_id,aor_node_id) VALUES($1,$2,$3,$4,$5)',[row,id(1),project,user,node]);
  for(const [row,user,node] of [[johnGrant,id(11),area],[jasonGrant,id(12),other]])await db.query("INSERT INTO project_responsibility_grants(id,tenant_id,project_id,user_id,aor_node_id,responsibility,granted_by) VALUES($1,$2,$3,$4,$5,'SURVEY_REVIEWER',$6)",[row,id(1),project,user,node,id(10)]);
  await db.query('INSERT INTO survey_reporting_links(id,tenant_id,project_id,superintendent_id,party_chief_id,aor_node_id,assigned_by) VALUES($1,$2,$3,$4,$5,$6,$7)',[reporting,id(1),project,id(11),chief,area,id(10)]);
  await db.query("INSERT INTO tickets(id,tenant_id,project_id,aor_node_id,company_id,ticket_number,requester_id,workflow_variant,status,craft,description,requested_date,ticket_type,submitted_at) VALUES($1,$2,$3,$4,$5,$6,$7,'STANDARD_APPROVAL','SUBMITTED','Survey','Area unlink HTTP preservation','2026-10-10','LAYOUT',now())",[ticket,id(1),project,area,id(2),'AREA-HTTP-'+ticket,id(10)]);
  await db.query('COMMIT');
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
 const preserved=async()=>(await pg.query('SELECT to_jsonb(t) AS row FROM tickets t WHERE id=$1',[ticket])).rows;
 const before=await preserved(),areasQuery=`?mode=superintendent-areas&superintendentId=${id(11)}`;
 const initial=await call('GET',areasQuery);equal(initial.assignments.total,3);equal(initial.assignments.data.find(a=>a.assignmentId===selected).canUnlink,false);
 await call('GET',areasQuery,undefined,403,token(17));await call('GET',areasQuery,undefined,401,token(10,99));
 await call('GET',areasQuery,undefined,404,token(92,1,id(90)));
 for(const extra of ['&mode=superintendent-areas','&actorRole=SURVEY_MANAGER','&search=%01','&offset=9007199254740992'])await call('GET',areasQuery+extra,undefined,400);
 await call('GET',`?mode=superintendent-area-replacements&superintendentId=${id(11)}&linkId=${jasonAssignment}`,undefined,404);
 const obligations=await call('GET',`?mode=obligations&userId=${id(11)}`,undefined,200,manager,randomUUID(),base+'/survey/protected-obligations');
 const handover=await call('POST','',{userId:id(11),grantId:johnGrant,replacementUserId:id(12),expectedSnapshot:obligations.snapshotToken,coverageMode:'assignAdditional',coverageIntent:'TEMPORARY',confirmResolution:true,confirmAdditionalCoverage:true},200,manager,randomUUID(),base+'/survey/protected-obligations');
 equal(handover.createdIndividualAssignment,true);equal(handover.createdReviewGrant,true);
 const dependency=await call('GET',`?mode=superintendent-area-reporting&superintendentId=${id(11)}&linkId=${selected}`);equal(dependency.reporting.data[0].canUseStaffing,true);
 const snapshot=await call('GET','?mode=snapshot');
 await call('POST','',{expectedSnapshot:snapshot.snapshotToken,partyChiefId:chief,areaId:area,superintendentId:id(12),instrumentManIds:[],confirmRoleChanges:true},200,manager,randomUUID(),path,false);
 const current=await call('GET',areasQuery),candidates=await call('GET',`?mode=superintendent-area-replacements&superintendentId=${id(11)}&linkId=${selected}`);
 equal(candidates.snapshotToken,current.snapshotToken);const replacement=candidates.replacements.data.find(c=>c.userId===id(12));assert.ok(replacement);checks++;
 const body={action:'unlink-superintendent-area',superintendentId:id(11),linkId:selected,replacementUserId:id(12),replacementGrantId:replacement.replacementGrantId,replacementAssignmentId:replacement.replacementAssignmentId,expectedSnapshot:current.snapshotToken,confirmUnlink:true};
 for(const value of [{...body,areaId:area},{...body,confirmUnlink:false}])await call('PATCH','',value,400);
 await call('PATCH','',body,403,token(17));await call('PATCH','',{...body,replacementGrantId:jasonGrant},409);
 const coverage=(await pg.query('SELECT to_jsonb(a) AS row FROM aor_assignments a WHERE id=$1',[replacement.replacementAssignmentId])).rows;
 const key=randomUUID(),result=await call('PATCH','',body,200,manager,key);equal(result.assignmentId,selected);equal(result.changed,true);
 equal(await call('PATCH','',body,200,manager,key),result);
 await call('PATCH','',{...body,linkId:duplicate},409,manager,key);
 await call('PATCH','',{...body,linkId:duplicate},409);
 equal((await pg.query('SELECT deactivated_at FROM aor_assignments WHERE id=$1',[duplicate])).rows[0].deactivated_at,null);
 const reload=await call('GET',areasQuery),lostKey=randomUUID(),lostBody={...body,linkId:duplicate,expectedSnapshot:reload.snapshotToken};
 // Discard the entire response body after the real server commits; recover by
 // the unchanged key/payload, never infer a client success from response data.
 const dropped=await fetch(path,{method:'PATCH',headers:{cookie:`swr_session=${manager}`,'content-type':'application/json','idempotency-key':lostKey},body:JSON.stringify(lostBody)});await dropped.body?.cancel();
 assert.ok((await pg.query('SELECT deactivated_at FROM aor_assignments WHERE id=$1',[duplicate])).rows[0].deactivated_at);checks++;
 const recovered=await call('PATCH','',lostBody,200,manager,lostKey);equal(recovered.assignmentId,duplicate);equal(await call('PATCH','',lostBody,200,manager,lostKey),recovered);
 equal((await pg.query('SELECT deactivated_at FROM aor_assignments WHERE id=$1',[otherAssignment])).rows[0].deactivated_at,null);
 equal((await pg.query('SELECT to_jsonb(a) AS row FROM aor_assignments a WHERE id=$1',[replacement.replacementAssignmentId])).rows,coverage);equal(await preserved(),before);
 const roleVersion=(await pg.query('SELECT u.session_version AS role_version FROM project_memberships pm JOIN users u ON u.id=pm.user_id WHERE pm.project_id=$1 AND pm.user_id=$2',[project,id(11)])).rows[0].role_version;
 await call('PATCH','',{action:'set-role',userId:id(11),expectedRole:'SURVEY_SUPERINTENDENT',expectedRoleVersion:roleVersion,role:'REQUESTER',confirmRoleChanges:true},409,manager,randomUUID(),base+'/survey/teams',false);
 const events=(await pg.query("SELECT payload FROM survey_staffing_events WHERE project_id=$1 AND payload->>'action'='unlink-superintendent-area' ORDER BY id",[project])).rows;
 equal(events.length,2);for(const {payload} of events){equal(payload.version,1);equal(payload.replacement.provenance,'reused');equal(payload.authority.role,'SURVEY_MANAGER');}
 console.log(`PASS ${checks} actual production HTTP Superintendent Area checks; fixture project ${project}`);
}finally{await pg.end();}
