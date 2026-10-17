import {inUnitRequestScope} from '../setup/unit-request-scope';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {NextRequest} from 'next/server';
import {getPool} from '../../src/lib/db';
import {signToken} from '../../src/lib/auth';
import {acquireTenantLifecycleLock} from '../../src/lib/tenant-lifecycle-lock';
import {GET as GETHandler} from '../../src/app/api/projects/[projectId]/request-recovery/route';
import {POST as POSTHandler} from '../../src/app/api/projects/[projectId]/request-recovery/[ticketId]/route';
import {handlePostSurveyTeam as TEAM} from '../../src/app/api/projects/[projectId]/survey/teams/handler';
import type {UUID} from '../../src/shared/types';
const GET=inUnitRequestScope(GETHandler);
const POST=inUnitRequestScope(POSTHandler);
async function main(){
 const url=new URL(process.env.DATABASE_URL??'');assert.equal(process.env.SWR_RECONCILIATION_TEST,'1');assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'15489');assert.equal(url.pathname,'/swr_team_isolated');assert.match(url.searchParams.get('options')??'',/^-c search_path=d23_current_[a-f0-9]{32},public$/);
 const owned=JSON.parse(await readFile('.local/alpha-acceptance197/ownership.json','utf8'));assert.equal(owned.owner,'Alpha acceptance197');assert.equal(owned.hostPort,15500);assert.match(owned.container,/^swr-alpha-acceptance197-db-[a-f0-9]{8}$/);const pool=getPool(),checks:string[]=[];
 const tenant=randomUUID(),foreignTenant=randomUUID(),project=randomUUID(),otherProject=randomUUID(),foreignProject=randomUUID(),company=randomUUID(),scCompany=randomUUID(),foreignCompany=randomUUID(),area=randomUUID(),level=randomUUID();
 const people:Record<string,string>={},tokens:Record<string,string>={};
 const roles:Record<string,string>={admin:'REQUESTER',projectAdmin:'REQUESTER',combined:'PARTY_CHIEF',manager:'SURVEY_MANAGER',superintendent:'SURVEY_SUPERINTENDENT',chief:'PARTY_CHIEF',instrument:'INSTRUMENT_MAN',requester:'REQUESTER',viewer:'VIEWER',subject:'REQUESTER',subcontractor:'REQUESTER',incoming:'SURVEY_SUPERINTENDENT',coverage:'SURVEY_SUPERINTENDENT',otherAdmin:'VIEWER',foreignAdmin:'VIEWER'};
 for(const who of Object.keys(roles))people[who]=randomUUID();
 await pool.query('BEGIN');try{
  await pool.query("INSERT INTO tenants(id,name) VALUES($1,'Owned recovery189'),($2,'Owned foreign recovery189')",[tenant,foreignTenant]);
  await pool.query("INSERT INTO companies(id,tenant_id,name,type) VALUES($1,$2,'GC','GC'),($3,$2,'Owned subcontractor','SUBCONTRACTOR'),($4,$5,'Foreign GC','GC')",[company,tenant,scCompany,foreignCompany,foreignTenant]);
  for(const [id,t] of [[project,tenant],[otherProject,tenant],[foreignProject,foreignTenant]])await pool.query("INSERT INTO projects(id,tenant_id,name,status,crew_build) VALUES($1,$2,'Owned role acceptance','ACTIVE','FULL')",[id,t]);
  for(const [who,id] of Object.entries(people)){
   const foreign=who==='foreignAdmin',t=foreign?foreignTenant:tenant,p=foreign?foreignProject:who==='otherAdmin'?otherProject:project;
   await pool.query("INSERT INTO users(id,tenant_id,company_id,email,name,password_hash) VALUES($1,$2,$3,$4,$5,'no-login-fixture')",[id,t,foreign?foreignCompany:who==='subcontractor'?scCompany:company,id+'@recovery189.invalid','Recovery '+who]);
   await pool.query('INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,$3)',[p,id,roles[who]]);tokens[who]=signToken(id as UUID,t as UUID);
   if(['admin','foreignAdmin'].includes(who))await pool.query("INSERT INTO tenant_memberships(tenant_id,user_id,role) VALUES($1,$2,'TENANT_ADMIN')",[t,id]);
   if(['projectAdmin','combined','otherAdmin'].includes(who))await pool.query("INSERT INTO project_admin_grants(tenant_id,project_id,user_id,origin,granted_by) VALUES($1,$2,$3,'EXPLICIT',$3)",[t,p,id]);
  }
  await pool.query("INSERT INTO aor_levels(id,tenant_id,project_id,depth,label) VALUES($1,$2,$3,0,'Area')",[level,tenant,project]);
  await pool.query("INSERT INTO aor_nodes(id,tenant_id,project_id,level_id,name,code) VALUES($1,$2,$3,$4,'Owned Area','A')",[area,tenant,project,level]);
  await pool.query('COMMIT');
 }catch(e){await pool.query('ROLLBACK');throw e;}

 const area2=randomUUID();await pool.query("INSERT INTO aor_nodes(id,tenant_id,project_id,level_id,name,code) VALUES($1,$2,$3,$4,'Second owned Area','B')",[area2,tenant,project,level]);

 const ctx=(p=project,t?:string)=>({params:Promise.resolve({projectId:p,ticketId:t!})});
 const req=(method:string,who:string,path:string,body?:unknown,key:string=randomUUID())=>new NextRequest('http://localhost/api/projects/'+path,{method,headers:{cookie:'swr_session='+tokens[who],'Content-Type':'application/json','Idempotency-Key':key},...(body?{body:JSON.stringify(body)}:{})});
 const call=async(result:Promise<Response>,status:number,label:string)=>{const response=await result,body=await response.json();assert.equal(response.status,status,label+': '+JSON.stringify(body));checks.push(label);return body;};
 const list=(who='manager',p=project)=>GET(req('GET',who,p+'/request-recovery'),ctx(p));
 const team=(await call(TEAM(req('POST','manager',project+'/survey/teams',{teamId:null,expectedVersion:null,name:'Owned recovery team',areaId:area,areaIds:[area,area2],leadUserId:people.superintendent,memberIds:[people.superintendent,people.chief]}),ctx()),201,'Current team retains complete named coverage')).teamId;
 const tickets:Record<string,string>={};
 async function ticket(name:string,status='SURVEY_CANCELED',p=project,t=tenant,submitted=true,chief:string|null=people.chief!){
  const id=randomUUID();tickets[name]=id;
  await pool.query("INSERT INTO tickets(id,tenant_id,project_id,company_id,requester_id,workflow_variant,status,craft,description,aor_node_id,ticket_type,requested_date,ticket_number,first_submitted_at,assigned_party_chief_id,assigned_instrument_man_id,survey_lead_id,closed_at,rejection_reason) VALUES($1,$2,$3,$4,$5,'STANDARD_APPROVAL',$6,'Survey',$7,$8,'LAYOUT',CURRENT_DATE+7,$9,$10,$11,$12,$13,now(),$14)",[id,t,p,company,people.requester,status,'Recover '+name,p===project?area:null,submitted?'REC189-'+name:null,submitted?new Date():null,chief,people.instrument,people.manager,status==='REJECTED'?'Original rejected evidence':null]);
  if(chief)await pool.query('INSERT INTO ticket_assignment_history(tenant_id,ticket_id,party_chief_id,instrument_man_id,assigned_by,ended_at,end_reason) VALUES($1,$2,$3,$4,$5,now(),$6)',[t,id,chief,people.instrument,people.manager,'SURVEY_CANCELED']);
  await pool.query("INSERT INTO ticket_events(tenant_id,ticket_id,actor_id,event_type,payload) VALUES($1,$2,$3,'ticket.survey_canceled',$4)",[t,id,people.manager,JSON.stringify({ownedFixture:true,originalReason:'retained cancellation evidence'})]);
  return id;
 }
 const input=(status='SURVEY_CANCELED')=>({expectedStatus:status,expectedVersion:0,reason:'Requester confirmed corrected scope is needed.',confirmed:true});
 const post=(id:string,who='manager',body=input(),key:string=randomUUID(),p=project)=>POST(req('POST',who,p+'/request-recovery/'+id,body,key),ctx(p,id));
 const witness=async(id:string)=>JSON.stringify(await Promise.all(['tickets','ticket_events','ticket_return_cycles','ticket_assignment_history','notification_outbox','survey_work_delegations','survey_rejection_proposals'].map(async table=>(await pool.query('SELECT to_jsonb(r) row FROM '+table+' r WHERE tenant_id=$1 AND '+(table==='tickets'?'id':'ticket_id')+'=$2 ORDER BY to_jsonb(r)::text',[tenant,id])).rows)));
 const deny=async(id:string,who:string,status:number,label:string,body=input(),p=project)=>{const before=await witness(id);await call(post(id,who,body,randomUUID(),p),status,label);assert.equal(await witness(id),before);};
 const recoveries:Record<string,string>={},recoveryKeys:Record<string,string>={};
 try{
  for(const who of ['requester','viewer','instrument','subcontractor','incoming'])await call(list(who),who==='incoming'?200:403,who+' has only authorized recovery disclosure');
  const main=await ticket('chief-recovery');
  for(const who of ['admin','projectAdmin','combined','manager','superintendent','chief']){const page=await call(list(who),200,who+' receives bounded scoped recovery summary');assert(page.data.some((r:{id:string})=>r.id===main));assert(!JSON.stringify(page).includes('storage_key'));}
  await deny(main,'requester',403,'Requester cannot self-recover a submitted cancellation');
  await deny(main,'instrument',403,'Current Instrument Man has no recovery role');
  await deny(main,'foreignAdmin',404,'Foreign tenant administration cannot discover project');
  await deny(main,'otherAdmin',403,'Independent grant on another project gives no recovery');
  await deny(main,'incoming',404,'Superintendent without Area coverage cannot discover recovery request');
  await deny(main,'subcontractor',403,'Subcontractor Requester cannot use recovery metadata');
  await deny(main,'manager',403,'Same tenant wrong project UUID does not reveal request',input(),otherProject);
  await deny(main,'manager',400,'Explicit recovery consent required',{...input(),confirmed:false});
  await deny(main,'manager',400,'Recovery reason validates before effects',{...input(),reason:'short'});
  await deny(main,'manager',400,'Caller cannot change transition target',{...input(),targetStatus:'ASSIGNED'} as ReturnType<typeof input>);
  await deny(main,'manager',409,'Stale reviewed status conflicts',{...input(),expectedStatus:'REJECTED'});
  await deny(main,'manager',409,'Stale reviewed row version conflicts',{...input(),expectedVersion:2});
  for(const status of ['DRAFT','SUBMITTED','APPROVED','ASSIGNED','IN_PROGRESS','COMPLETED','RETURNED_FOR_CORRECTION']){const id=await ticket('wrong-'+status,status);await deny(id,'manager',409,'Cannot recover '+status);}
  const unsubmitted=await ticket('unsubmitted','REQUESTER_CANCELED',project,tenant,false);await deny(unsubmitted,'manager',409,'Unnumbered never-submitted cancellation stays excluded',input('REQUESTER_CANCELED'));
  const neverDirect=await ticket('never-direct');await pool.query("UPDATE tickets SET workflow_variant='DIRECT_ASSIGNMENT',first_submitted_at=NULL WHERE id=$1 AND tenant_id=$2",[neverDirect,tenant]);await deny(neverDirect,'manager',409,'Numbered direct work without actual submission is excluded');
  const deleted=await ticket('deleted','DRAFT',project,tenant,false,null);await pool.query("UPDATE tickets SET draft_deleted_at=now(),draft_deleted_reason='REQUESTER_DELETED' WHERE tenant_id=$1 AND id=$2",[tenant,deleted]);await deny(deleted,'manager',404,'Deleted records cannot enter submitted recovery');
  const missing=await ticket('no-chief','SURVEY_CANCELED',project,tenant,true,null);await deny(missing,'chief',404,'Missing canonical assignment is not inferred from reporting');
  const newer=await ticket('newer-chief');await pool.query("INSERT INTO ticket_assignment_history(tenant_id,ticket_id,party_chief_id,assigned_by,assigned_at,ended_at) VALUES($1,$2,$3,$4,now()+interval '1 second',now())",[tenant,newer,people.combined,people.manager]);await deny(newer,'chief',404,'Earlier Chief loses recovery ownership to newer recorded Chief');
  const tied=await ticket('tied-chief');await pool.query('INSERT INTO ticket_assignment_history(tenant_id,ticket_id,party_chief_id,assigned_by,assigned_at,ended_at) SELECT tenant_id,ticket_id,$3,$4,assigned_at,ended_at FROM ticket_assignment_history WHERE tenant_id=$1 AND ticket_id=$2',[tenant,tied,people.combined,people.manager]);await deny(tied,'chief',404,'Conflicting same-time Chiefs fail closed');
  // Real fault at append-only correction audit must undo the preceding status patch.
  const fault=await ticket('fault'),fn='recovery189_'+tenant.replaceAll('-',''),before=await witness(fault);
  await pool.query('CREATE FUNCTION '+fn+"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.tenant_id='"+tenant+"'::uuid AND NEW.event_type='ticket.returned_for_correction' THEN RAISE EXCEPTION 'owned recovery audit fault'; END IF; RETURN NEW; END $$");await pool.query('CREATE TRIGGER '+fn+' BEFORE INSERT ON ticket_events FOR EACH ROW EXECUTE FUNCTION '+fn+'()');
  try{await call(post(fault),500,'Actual audit fault rolls back recovery');assert.equal(await witness(fault),before);assert.equal((await pool.query('SELECT count(*)::int n FROM api_idempotency WHERE tenant_id=$1 AND endpoint LIKE $2',[tenant,'%'+fault])).rows[0].n,0);checks.push('Status/cycle/evidence/outbox/ledger all roll back under actual audit failure');}finally{await pool.query('DROP TRIGGER '+fn+' ON ticket_events');await pool.query('DROP FUNCTION '+fn+'()');}
  const key:string=randomUUID(),retained=await pool.query('SELECT id,ticket_number,first_submitted_at,created_at,company_id,requester_id,requested_date FROM tickets WHERE tenant_id=$1 AND id=$2',[tenant,main]);
  await call(post(main,'chief',input(),key),200,'Verified current last Chief recovers same request');const after=await witness(main);await call(post(main,'chief',input(),key),200,'Exact Chief retry survives cleared live assignment');assert.equal(await witness(main),after);
  assert.deepEqual((await pool.query('SELECT id,ticket_number,first_submitted_at,created_at,company_id,requester_id,requested_date FROM tickets WHERE tenant_id=$1 AND id=$2',[tenant,main])).rows,retained.rows);
  const result=(await pool.query('SELECT status,row_version,return_cycle,assigned_party_chief_id,assigned_instrument_man_id,survey_lead_id,closed_at,rejection_reason FROM tickets WHERE tenant_id=$1 AND id=$2',[tenant,main])).rows[0];assert.deepEqual(result,{status:'RETURNED_FOR_CORRECTION',row_version:1,return_cycle:1,assigned_party_chief_id:null,assigned_instrument_man_id:null,survey_lead_id:null,closed_at:null,rejection_reason:null});
  assert.equal((await pool.query("SELECT count(*)::int n FROM ticket_return_cycles WHERE tenant_id=$1 AND ticket_id=$2 AND origin='SUBMITTED_RECOVERY'",[tenant,main])).rows[0].n,1);assert.equal((await pool.query('SELECT count(*)::int n FROM notification_outbox WHERE tenant_id=$1 AND ticket_id=$2',[tenant,main])).rows[0].n,1);checks.push('One correction cycle/version/requester notice retains identity/date/number and immutable original evidence');
  await call(post(main,'chief',{...input(),reason:'Different reviewed scope.'},key),409,'Key collision cannot replace reviewed reason');
  await pool.query('UPDATE aor_nodes SET retired_at=now() WHERE tenant_id=$1 AND id=$2',[tenant,area]);await call(post(main,'chief',input(),key),404,'Retired Area refuses historical Chief replay');await pool.query('UPDATE aor_nodes SET retired_at=NULL WHERE tenant_id=$1 AND id=$2',[tenant,area]);
  await pool.query("UPDATE project_memberships SET role='INSTRUMENT_MAN' WHERE project_id=$1 AND user_id=$2",[project,people.chief]);await call(post(main,'chief',input(),key),403,'Revoked current Chief role refuses recorded replay');await pool.query("UPDATE project_memberships SET role='PARTY_CHIEF' WHERE project_id=$1 AND user_id=$2",[project,people.chief]);
  for(const [who,status] of [['admin','REQUESTER_CANCELED'],['projectAdmin','FIELD_CANCELED'],['manager','REJECTED'],['superintendent','SURVEY_CANCELED']] as const){const id=await ticket('by-'+who,status);recoveries[who]=id;recoveryKeys[who]=randomUUID();await call(post(id,who,input(status),recoveryKeys[who]),200,who+' recovers eligible submitted '+status);}
  await pool.query('UPDATE project_admin_grants SET revoked_at=now(),revoked_by=$3 WHERE tenant_id=$1 AND project_id=$2 AND user_id=$4',[tenant,project,people.admin,people.projectAdmin]);await call(post(recoveries.projectAdmin!,'projectAdmin',input('FIELD_CANCELED'),recoveryKeys.projectAdmin),403,'Revoked independent Project Admin grant blocks exact recorded recovery replay');
  // Add a new independently granted PA fixture for subsequent browser gates; never revive the revoked grant.
  await pool.query("INSERT INTO project_admin_grants(tenant_id,project_id,user_id,origin,granted_by) VALUES($1,$2,$3,'EXPLICIT',$4)",[tenant,project,people.projectAdmin,people.admin]);
  const outboxFault=await ticket('outbox-fault'),outboxFn='recovery189_outbox_'+tenant.replaceAll('-',''),outboxBefore=await witness(outboxFault);
  await pool.query('CREATE FUNCTION '+outboxFn+"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.tenant_id='"+tenant+"'::uuid THEN RAISE EXCEPTION 'owned recovery outbox fault'; END IF; RETURN NEW; END $$");await pool.query('CREATE TRIGGER '+outboxFn+' BEFORE INSERT ON notification_outbox FOR EACH ROW EXECUTE FUNCTION '+outboxFn+'()');
  try{await call(post(outboxFault),500,'Actual requester outbox failure refuses recovery');assert.equal(await witness(outboxFault),outboxBefore);checks.push('Failure after transition/cycle/audit writes atomically restores status/history and removes ledger');}finally{await pool.query('DROP TRIGGER '+outboxFn+' ON notification_outbox');await pool.query('DROP FUNCTION '+outboxFn+'()');}
  const hanging=await ticket('open-terminal-history');await pool.query('UPDATE ticket_assignment_history SET ended_at=NULL,end_reason=NULL WHERE tenant_id=$1 AND ticket_id=$2',[tenant,hanging]);
  await pool.query('INSERT INTO survey_work_delegations(tenant_id,project_id,ticket_id,team_id,lead_user_id,delegated_by) VALUES($1,$2,$3,$4,$5,$6)',[tenant,project,hanging,team,people.superintendent,people.manager]);
  await call(post(hanging),200,'Recovery reconciles lingering current terminal assignment and delegation');
  assert.equal((await pool.query("SELECT count(*)::int n FROM ticket_assignment_history WHERE tenant_id=$1 AND ticket_id=$2 AND ended_at IS NOT NULL AND end_reason='SUBMITTED_RECOVERY'",[tenant,hanging])).rows[0].n,1);assert.equal((await pool.query("SELECT count(*)::int n FROM survey_work_delegations WHERE tenant_id=$1 AND ticket_id=$2 AND ended_at IS NOT NULL AND end_reason='SUBMITTED_RECOVERY'",[tenant,hanging])).rows[0].n,1);checks.push('Current assignment/delegation closure is atomic recovery evidence while already-ended rows remain unchanged');
  const preparingId=randomUUID();await pool.query('INSERT INTO project_recommissioning(id,tenant_id,project_id,replacement_admin_id,initiated_by,reason,archived_evidence) VALUES($1,$2,$3,$4,$5,$6,$7)',[preparingId,tenant,project,people.projectAdmin,people.admin,'Owned preparation gate stage',JSON.stringify({ownedFixture:true})]);
  await deny(outboxFault,'manager',409,'Recommissioning preparation blocks fresh recovery');await call(post(main,'chief',input(),key),409,'Preparation blocks historical recovery replay');assert.equal((await call(list('admin'),200,'Preparation recovery summaries remain read-only')).readOnly,true);await pool.query('UPDATE project_recommissioning SET opened_at=now(),opened_by=$3 WHERE tenant_id=$1 AND id=$2',[tenant,preparingId,people.admin]);
  await pool.query('UPDATE survey_team_members SET deactivated_at=now() WHERE tenant_id=$1 AND team_id=$2 AND user_id=$3',[tenant,team,people.chief]);await call(post(main,'chief',input(),key),404,'Current named-team exit revokes Chief recovery replay despite retained history');
  // A different named team keeps the ended source membership as evidence.
  await call(TEAM(req('POST','manager',project+'/survey/teams',{teamId:null,expectedVersion:null,name:'Owned subsequent Chief team',areaId:area,areaIds:[area,area2],leadUserId:people.incoming,memberIds:[people.incoming,people.chief]}),ctx()),201,'Explicit new named team retains prior exited membership');
  const race=await ticket('race');const outcomes=await Promise.all([post(race,'manager'),post(race,'projectAdmin')]);assert.deepEqual(outcomes.map(r=>r.status).sort(),[200,409]);checks.push('Concurrent independently authorized recovery commits one transition');
  const blocked=await ticket('blocked-requester');await pool.query('UPDATE project_memberships SET access_disabled_at=now(),access_disabled_by=user_id WHERE project_id=$1 AND user_id=$2',[project,people.requester]);await deny(blocked,'manager',409,'Disabled requester requires separate restored access');const disabledPage=await call(list('admin'),200,'Administrator sees actionable requester blocker without read expansion');assert(disabledPage.data.find((r:{id:string})=>r.id===blocked).blocker);await pool.query('UPDATE project_memberships SET access_disabled_at=NULL,access_disabled_by=NULL WHERE project_id=$1 AND user_id=$2',[project,people.requester]);
  const archive=await ticket('archived');await pool.query("UPDATE projects SET status='ARCHIVED' WHERE tenant_id=$1 AND id=$2",[tenant,project]);await deny(archive,'manager',409,'Archived recovery mutation is refused');await call(post(main,'chief',input(),key),409,'Archived project blocks recorded recovery replay');assert.equal((await call(list('admin'),200,'Archived bounded history remains read-only')).readOnly,true);await pool.query("UPDATE projects SET status='ACTIVE' WHERE tenant_id=$1 AND id=$2",[tenant,project]);
  const staged=await ticket('browser-request');tickets.browser=staged;
  // Real EXCLUSIVE wait: revoke actor session while a SHARED recovery waits.
  const waiting=await ticket('wait-session'),holder=await pool.connect();try{await holder.query('BEGIN');await acquireTenantLifecycleLock(holder,tenant as UUID,'EXCLUSIVE');const pending=post(waiting,'manager');await new Promise(r=>setTimeout(r,150));assert((await pool.query("SELECT count(*)::int n FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE '%FROM tenants%'")).rows[0].n>0);await holder.query('UPDATE users SET session_version=session_version+1 WHERE tenant_id=$1 AND id=$2',[tenant,people.manager]);await holder.query('COMMIT');await call(pending,401,'Recovery revalidates revoked session after observed lifecycle wait');tokens.manager=signToken(people.manager as UUID,tenant as UUID,2);}finally{holder.release();}
  // Deliberately retain only owned fixtures for production/browser checks.
  await writeFile('.local/d1-d8/d23/submitted-recovery-fixture.json',JSON.stringify({tenant,project,otherProject,foreignTenant,foreignProject,company,scCompany,area,area2,team,people,tokens,tickets,recoveries}));
  console.log(JSON.stringify({checks:checks.length,cases:checks}));
 }finally{await pool.end();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
