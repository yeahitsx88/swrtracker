// Opt-in unique-schema acceptance. Never edits retained public fixtures or production data.
import assert from 'node:assert/strict';
import {Pool} from 'pg';
import fs from 'node:fs/promises';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import jwt from 'jsonwebtoken';
const url=new URL(process.env.DATABASE_URL??'');
assert.equal(process.env.SWR_TEAM_POSTGRES,'1');assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'15489');assert.equal(url.pathname,'/swr_team_isolated');
const file='.local-fixture.json',mode=process.argv[2],origin=process.env.SWR_ACCEPTANCE_ORIGIN??'http://127.0.0.1:3113';
assert.match(origin,/^http:\/\/127\.0\.0\.1:\d+$/);
const pg=new Pool({connectionString:url.href,max:6});let checks=0;
const check=(actual,expected,label)=>{assert.deepEqual(actual,expected,label);checks++;};
try{
 if(mode==='setup'){
  const schema='phase5_acceptance_'+randomUUID().replaceAll('-','');assert.match(schema,/^phase5_acceptance_[a-f0-9]{32}$/);
  const f={schema};for(const k of ['tenant','foreignTenant','company','foreignCompany','project','otherProject','archivedProject','foreignProject','actor','localAdmin','subject','foreignSubject','foreignAdmin','manager','superintendent','chief','im','area','level','team','draft','attachment','event'])f[k]=randomUUID();
  const db=await pg.connect();
  try{await db.query('BEGIN');await db.query(`CREATE SCHEMA "${schema}"`);await db.query(`SET LOCAL search_path TO "${schema}",public`);
   for(const migration of (await fs.readdir('db/migrations')).filter(p=>p.endsWith('.sql')).sort())await db.query(await fs.readFile('db/migrations/'+migration,'utf8'));
   await db.query("INSERT INTO tenants(id,name) VALUES($1,'Synthetic primary'),($2,'Synthetic second')",[f.tenant,f.foreignTenant]);
   await db.query("INSERT INTO companies(id,tenant_id,name,type) VALUES($1,$2,'Primary GC','GC'),($3,$4,'Second GC','GC')",[f.company,f.tenant,f.foreignCompany,f.foreignTenant]);
   for(const [p,t,status] of [[f.project,f.tenant,'ACTIVE'],[f.otherProject,f.tenant,'ACTIVE'],[f.archivedProject,f.tenant,'ARCHIVED'],[f.foreignProject,f.foreignTenant,'ACTIVE']])await db.query('INSERT INTO projects(id,tenant_id,name,status,crew_build) VALUES($1,$2,$3,$4,\'FULL\')',[p,t,p===f.project?'Acceptance project':status+' project',status]);
   for(const [id,name,t,c] of [[f.actor,'Central operator',f.tenant,f.company],[f.localAdmin,'Project operator',f.tenant,f.company],[f.subject,'Departing requester',f.tenant,f.company],[f.manager,'Actual Manager',f.tenant,f.company],[f.superintendent,'Duty Superintendent',f.tenant,f.company],[f.chief,'Duty Chief',f.tenant,f.company],[f.im,'Duty Instrument Man',f.tenant,f.company],[f.foreignAdmin,'Second project operator',f.foreignTenant,f.foreignCompany],[f.foreignSubject,'Second departing requester',f.foreignTenant,f.foreignCompany]])await db.query("INSERT INTO users(id,tenant_id,company_id,name,email,password_hash) VALUES($1,$2,$3,$4,$5,'fixture')",[id,t,c,name,id+'@example.test']);
   for(const [p,u,r] of [[f.project,f.actor,'SURVEY_MANAGER'],[f.project,f.localAdmin,'VIEWER'],[f.project,f.subject,'REQUESTER'],[f.otherProject,f.subject,'REQUESTER'],[f.archivedProject,f.subject,'REQUESTER'],[f.project,f.manager,'SURVEY_MANAGER'],[f.project,f.superintendent,'SURVEY_SUPERINTENDENT'],[f.project,f.chief,'PARTY_CHIEF'],[f.project,f.im,'INSTRUMENT_MAN'],[f.foreignProject,f.foreignAdmin,'SURVEY_MANAGER'],[f.foreignProject,f.foreignSubject,'REQUESTER']])await db.query('INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,$3)',[p,u,r]);
   await db.query("INSERT INTO tenant_memberships(tenant_id,user_id,role) VALUES($1,$2,'TENANT_ADMIN')",[f.tenant,f.actor]);
   for(const [t,p,u] of [[f.tenant,f.project,f.actor],[f.tenant,f.project,f.localAdmin],[f.foreignTenant,f.foreignProject,f.foreignAdmin]])await db.query("INSERT INTO project_admin_grants(tenant_id,project_id,user_id,origin,granted_by) VALUES($1,$2,$3,'EXPLICIT',$3)",[t,p,u]);
   await db.query("INSERT INTO aor_levels(id,tenant_id,project_id,depth,label) VALUES($1,$2,$3,0,'Area')",[f.level,f.tenant,f.project]);
   await db.query("INSERT INTO aor_nodes(id,tenant_id,project_id,level_id,name,code) VALUES($1,$2,$3,$4,'Active duty Area','A')",[f.area,f.tenant,f.project,f.level]);
   await db.query('INSERT INTO aor_assignments(tenant_id,project_id,user_id,aor_node_id) VALUES($1,$2,$3,$4)',[f.tenant,f.project,f.superintendent,f.area]);
   await db.query('INSERT INTO survey_reporting_links(tenant_id,project_id,superintendent_id,party_chief_id,aor_node_id,assigned_by) VALUES($1,$2,$3,$4,$5,$6)',[f.tenant,f.project,f.superintendent,f.chief,f.area,f.actor]);
   await db.query('INSERT INTO crew_rosters(tenant_id,project_id,party_chief_id,instrument_man_id) VALUES($1,$2,$3,$4)',[f.tenant,f.project,f.chief,f.im]);
   await db.query("INSERT INTO survey_teams(id,tenant_id,project_id,name,aor_node_id,lead_user_id,created_by) VALUES($1,$2,$3,'Duty team',$4,$5,$6)",[f.team,f.tenant,f.project,f.area,f.superintendent,f.actor]);
   for(const u of [f.superintendent,f.chief,f.im])await db.query('INSERT INTO survey_team_members(tenant_id,project_id,team_id,user_id) VALUES($1,$2,$3,$4)',[f.tenant,f.project,f.team,u]);
   await db.query("INSERT INTO project_responsibility_grants(tenant_id,project_id,user_id,aor_node_id,responsibility,granted_by) VALUES($1,$2,$3,$4,'SURVEY_REVIEWER',$5)",[f.tenant,f.project,f.superintendent,f.area,f.actor]);
   await db.query("INSERT INTO tickets(id,tenant_id,project_id,company_id,requester_id,workflow_variant,status,craft,description) VALUES($1,$2,$3,$4,$5,'STANDARD_APPROVAL','DRAFT','Survey','Retained draft')",[f.draft,f.tenant,f.project,f.company,f.subject]);
   await db.query("INSERT INTO ticket_events(id,tenant_id,ticket_id,actor_id,event_type,payload) VALUES($1,$2,$3,$4,'ticket.created','{\"retained\":true}')",[f.event,f.tenant,f.draft,f.subject]);
   await db.query("INSERT INTO attachments(id,tenant_id,ticket_id,uploaded_by,filename,mime_type,storage_key,size_bytes) VALUES($1,$2,$3,$4,'retained.txt','text/plain','synthetic-history',7)",[f.attachment,f.tenant,f.draft,f.subject]);
   for(const status of ['COMPLETED','REQUESTER_CANCELED'])await db.query("INSERT INTO tickets(id,tenant_id,project_id,company_id,requester_id,workflow_variant,status,craft,description,aor_node_id,ticket_type,requested_date,ticket_number) VALUES($1,$2,$3,$4,$5,'STANDARD_APPROVAL',$6,'Survey','Retained terminal history',$7,'TOPO','2026-10-01',$8)",[randomUUID(),f.tenant,f.project,f.company,f.subject,status,f.area,'SYN-'+status]);
   const digest=createHash('sha256').update('Retained synthetic file bytes').digest('hex');await db.query('UPDATE attachments SET content_sha256=$2 WHERE id=$1',[f.attachment,digest]);
   await db.query('COMMIT');
  }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
  await fs.writeFile(file,JSON.stringify(f,null,2));
  const env=await fs.readFile('.local-test.env','utf8');url.searchParams.set('options','-c search_path='+schema+',public');
  await fs.writeFile('.local-runtime.env',env.replace(/^DATABASE_URL=.*$/m,'DATABASE_URL='+url.href)+'\nJWT_SECRET='+randomBytes(64).toString('hex')+'\n');
  console.log('Synthetic two-tenant fixture ready in an owned schema.');
 }else{
  const f=JSON.parse(await fs.readFile(file,'utf8'));assert.match(f.schema,/^phase5_acceptance_[a-f0-9]{32}$/);
  if(mode==='cleanup'){await pg.query(`DROP SCHEMA "${f.schema}" CASCADE`);await fs.unlink(file);await fs.unlink('.local-runtime.env');console.log('Owned acceptance schema removed.');}
  else if(mode==='http'){
   const db=await pg.connect();await db.query(`SET search_path TO "${f.schema}",public`);
   try{
    const cookie=(u=f.actor,t=f.tenant,sv=1)=>'swr_session='+jwt.sign({sub:u,tenantId:t,sv},process.env.JWT_SECRET,{expiresIn:'1h',jwtid:randomUUID()});
    const request=(path,body,token=cookie(),key=randomUUID(),method=body?'POST':'GET')=>fetch(origin+path,{method,headers:{cookie:token,'content-type':'application/json','idempotency-key':key},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(12000)});
    const expect=async(response,status=200)=>{check(response.status,status,await response.clone().text());return response.json();};
    const local=(p=f.project,u=f.subject)=>`/api/projects/${p}/members/${u}/offboarding`,global=(u=f.subject)=>`/api/accounts/${u}/offboarding`;
    const command=(p,scope,subject=f.subject)=>({subjectUserId:subject,scope,reason:'Confirmed synthetic departure',snapshot:p.snapshot,confirmed:true});
    const preserve=async()=>{const out={};for(const table of ['tickets','ticket_events','attachments','companies','aor_assignments','crew_rosters','survey_reporting_links','survey_teams','survey_team_members','project_responsibility_grants'])out[table]=(await db.query(`SELECT to_jsonb(t) AS row FROM ${table} t ORDER BY to_jsonb(t)::text`)).rows;return out;};
    const before=await preserve();
    await expect(await request(global(),undefined,cookie(f.localAdmin)),403);
    await expect(await request(local(f.foreignProject),undefined,cookie(f.localAdmin)),404);
    await expect(await request(local(f.otherProject),undefined,cookie(f.localAdmin)),403);
    await expect(await request(local(f.project,f.actor)),403);
    const duties=(await expect(await request(local(f.project,f.superintendent)))).preview;
    for(const code of ['AREA_ASSIGNMENT','REPORTING_LINK','TEAM_LEAD','TEAM_MEMBERSHIP','RESPONSIBILITY_GRANT'])check(duties.blockers.some(b=>b.code===code),true,code);
    await expect(await request(local(f.project,f.superintendent),command(duties,{kind:'PROJECT_ACCESS',projectId:f.project},f.superintendent)),409);
    const chief=(await expect(await request(local(f.project,f.chief)))).preview;check(chief.blockers.some(b=>b.code==='CREW_ROSTER'),true,'Crew duty');
    const p=(await expect(await request(local(),undefined,cookie(f.localAdmin)))).preview;
    const body=command(p,{kind:'PROJECT_ACCESS',projectId:f.project}),key=randomUUID();
    const responses=await Promise.all([request(local(),body,cookie(f.localAdmin),key),request(local(),body,cookie(f.localAdmin),key),request(local(),body,cookie(f.localAdmin))]);
    const results=[];for(const response of responses)results.push((await expect(response)).result);
    check(results[0].eventId,results[1].eventId,'Same-key concurrent replay');check(results[0].eventId,results[2].eventId,'Different-key concurrent no-op');
    check((await db.query('SELECT session_version,deactivated_at FROM users WHERE id=$1',[f.subject])).rows[0],{session_version:2,deactivated_at:null},'Local disable only');
    check((await db.query("SELECT count(*)::int AS n FROM account_lifecycle_events WHERE subject_user_id=$1",[f.subject])).rows[0].n,1,'One transition');
    await expect(await request('/api/projects',undefined,cookie(f.subject)),401);
    const renewed=await expect(await request('/api/projects',undefined,cookie(f.subject,f.tenant,2)));check(renewed.projects.map(p=>p.id),[f.otherProject],'Other project preserved');
    await db.query('UPDATE project_admin_grants SET revoked_at=NOW(),revoked_by=$2 WHERE user_id=$1',[f.localAdmin,f.actor]);await expect(await request(local(),body,cookie(f.localAdmin),key),403);
    const gp=(await expect(await request(global()))).preview;const tenant=(await expect(await request(global(),command(gp,{kind:'TENANT_ACCOUNT'})))).result;
    await expect(await request('/api/projects',undefined,cookie(f.subject,f.tenant,2)),401);
    await expect(await request('/api/auth/forgot-password',{tenantId:f.tenant,email:f.subject+'@example.test'}));check((await db.query('SELECT count(*)::int AS n FROM password_reset_tokens WHERE user_id=$1',[f.subject])).rows[0].n,0,'Reset cannot restore disabled account');
    const reviewId=results[0].reviewId,reviewPath='/api/accounts/offboarding-reviews/'+reviewId;const rp=await expect(await request(reviewPath));
    const resolution={reviewId,disposition:'TENANT_ACCOUNT_DISABLED',reason:'Confirmed independent tenant decision',tenantEventId:tenant.eventId,snapshot:rp.snapshot,confirmed:true};const rk=randomUUID();await expect(await request(reviewPath,resolution,cookie(),rk));await expect(await request(reviewPath,resolution,cookie(),rk));
    const noCentral=(await expect(await request(local(f.foreignProject,f.foreignSubject),undefined,cookie(f.foreignAdmin,f.foreignTenant)))).preview;check(noCentral.centralITRecipientCount,0,'No eligible Central IT');
    const second=(await expect(await request(local(f.foreignProject,f.foreignSubject),command(noCentral,{kind:'PROJECT_ACCESS',projectId:f.foreignProject},f.foreignSubject),cookie(f.foreignAdmin,f.foreignTenant)))).result;check(second.centralReview,'NOT_QUEUED_NO_CENTRAL_IT','Local disable succeeds without Central IT');
    check(await preserve(),before,'History, duties and files preserved across scoped actions');
    // A14/A16: actual tenant commands race with same and different keys.
    const race=randomUUID();await db.query("INSERT INTO users(id,tenant_id,company_id,email,name,password_hash) VALUES($1,$2,$3,$4,'Global concurrent departure','fixture')",[race,f.tenant,f.company,race+'@example.test']);
    const racePreview=(await expect(await request(global(race)))).preview,raceBody=command(racePreview,{kind:'TENANT_ACCOUNT'},race),raceKey=randomUUID();
    const raced=await Promise.all([request(global(race),raceBody,cookie(),raceKey),request(global(race),raceBody,cookie(),raceKey),request(global(race),raceBody,cookie())]);
    const racedBodies=[];for(const response of raced)racedBodies.push(await expect(response));
    check(racedBodies[0].result.eventId,racedBodies[1].result.eventId,'A14 same-key tenant replay');check(racedBodies[0].result.eventId,racedBodies[2].result.eventId,'A16 different-key tenant no-op');
    check((await db.query('SELECT session_version FROM users WHERE id=$1',[race])).rows[0].session_version,2,'A16 one tenant session increment');
    check((await db.query('SELECT count(*)::int AS n FROM account_lifecycle_events WHERE subject_user_id=$1',[race])).rows[0].n,1,'A14 one tenant event');
    // Retain stable fixture persons for browser evidence by adding a separate eligible requester.
    f.browserSubject=randomUUID();await db.query("INSERT INTO users(id,tenant_id,company_id,email,name,password_hash) VALUES($1,$2,$3,$4,'Browser departure','fixture')",[f.browserSubject,f.tenant,f.company,f.browserSubject+'@example.test']);await db.query("INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,'REQUESTER')",[f.project,f.browserSubject]);
    await fs.writeFile(file,JSON.stringify(f,null,2));
    console.log('Scoped offboarding production HTTP checks passed: '+checks);
   }finally{db.release();}
  }else throw Error('Choose setup, http or cleanup');
 }
}finally{await pg.end();}
