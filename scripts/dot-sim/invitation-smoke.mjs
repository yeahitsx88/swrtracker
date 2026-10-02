import fs from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {DotActor,ActorHttpError} from './actors.mjs';
import {validateRuntime,validatePopulation} from './policy.mjs';
import {runSmoke} from './smoke.mjs';
const root='.data/dot-sim';
const config=validateRuntime(JSON.parse(fs.readFileSync(root+'/runtime.json','utf8')));
const population=validatePopulation(JSON.parse(fs.readFileSync(root+'/credentials.json','utf8')),config);
// Create a dedicated proof project NOW through normal authenticated application behavior.
// Its ID comes directly from this invocation, never retained data or a caller-selected target.
const lifecycle=await runSmoke('INVITATION_PROOF');
assert.equal(lifecycle.purpose,'INVITATION_PROOF');
const projectId=lifecycle.projectId,runId=randomUUID();
assert.ok(lifecycle.completed);
const traceFile=root+'/invitation-trace-'+runId+'.jsonl';
const trace=record=>fs.appendFileSync(traceFile,JSON.stringify(record)+'\n',{mode:0o600});
const identities=[];const report={runId,projectId,sourceLifecycleRunId:lifecycle.runId,tenantId:config.tenantId,createdAccounts:[],denials:[],traceFile,archived:false};
const accountsPath=root+'/invitation-credentials-'+runId+'.json';
const saveCredentials=()=>fs.writeFileSync(accountsPath,JSON.stringify({runId,actors:identities},null,2)+'\n',{mode:0o600});
const existing=key=>new DotActor({identity:population.actors.find(x=>x.key===key),baseUrl:config.baseUrl,runId,trace});
const admin=existing('project-admin'),ordinary=existing('requester-1'),central=existing('central-it');
const createdActors=[];
async function deny(actor,action,input,status,options){
 await assert.rejects(()=>actor.act(action,input,options),error=>error instanceof ActorHttpError&&error.status===status);
 report.denials.push({actorId:actor.actorId,action,status});
}
async function invalidRegistration(identity,inviteToken,change){
 const response=await fetch(config.baseUrl+'/api/auth/register',{method:'POST',headers:{'content-type':'application/json'},redirect:'manual',body:JSON.stringify({tenantId:identity.tenantId,name:identity.name,email:identity.email,password:identity.password,inviteToken,...change})});
 assert.equal(response.status,400);report.denials.push({action:'register-binding',status:response.status});
}
await admin.login();await ordinary.login();await central.login();
try{
 const capabilities=(await admin.act('capabilities',{projectId})).capabilities;
 assert.ok(capabilities.canAdminister&&!capabilities.centralIT&&capabilities.operationalRole==='REQUESTER');
 const options=await admin.act('invitationOptions',{projectId});
 const itIntent={projectId,companyId:population.companies.find(c=>c.key==='gc').id,email:'central-invited-'+runId+'@dot-sim.example.invalid'};
 assert.ok((await central.act('inviteRequester',itIntent)).inviteToken);
 report.centralItInvitationEmail=itIntent.email;
 assert.ok(['GC','OWNER_REP','SUBCONTRACTOR'].every(type=>options.companies.some(c=>c.type===type)));
 await deny(ordinary,'invitationOptions',{projectId},403);
 await deny(ordinary,'inviteRequester',{projectId,companyId:population.companies.find(c=>c.key==='gc').id,email:'unauthorized-'+runId+'@dot-sim.example.invalid'},403);
 await deny(admin,'inviteRequester',{projectId:lifecycle.unrelatedProjectId,companyId:options.companies[0].id,email:'scope-'+runId+'@dot-sim.example.invalid'},403);
 await deny(admin,'inviteRequester',{projectId:lifecycle.foreignProjectId,companyId:options.companies[0].id,email:'tenant-'+runId+'@dot-sim.example.invalid'},404);
 await deny(admin,'inviteRequester',{projectId,companyId:population.companies.find(c=>c.key==='control').id,email:'foreign-'+runId+'@dot-sim.example.invalid'},400);
 const unassociated=(await central.act('associateCompany',{projectId:lifecycle.unrelatedProjectId,name:'DOT SIM invitation isolation '+runId,type:'GC'})).company;
 await deny(admin,'inviteRequester',{projectId,companyId:unassociated.id,email:'unassociated-'+runId+'@dot-sim.example.invalid'},400);
 await deny(admin,'inviteRequester',{projectId,companyId:options.companies[0].id,email:'escalation-'+runId+'@dot-sim.example.invalid',role:'TENANT_ADMIN'},400);
 for(const [companyKey,label] of [['gc','Terry Smith'],['owner','Owner Requester'],['sub','Subcontractor Requester']]){
  const company=population.companies.find(c=>c.key===companyKey);
  const identity={key:'invited-'+companyKey,id:randomUUID(),tenantId:config.tenantId,companyId:company.id,name:'DOT SIM '+label,email:'invited-'+companyKey+'-'+runId+'@dot-sim.example.invalid',password:randomBytes(24).toString('base64url'),role:'REQUESTER'};
  identities.push(identity);saveCredentials();
  const intent={projectId,companyId:company.id,email:identity.email},key=randomUUID();
  const {inviteToken}=await admin.act('inviteRequester',intent,{key});
  assert.ok((await admin.act('inviteRequester',intent,{key})).inviteToken===inviteToken,'Invitation replay changed token');
  await deny(admin,'inviteRequester',{...intent,email:'changed-'+identity.email},409,{key});
  await deny(admin,'inviteRequester',intent,409);
  const pending=await admin.act('invitationOptions',{projectId});assert.ok(pending.pendingInvites.some(i=>i.email===identity.email));
  const validation=await fetch(config.baseUrl+'/api/auth/invite/'+inviteToken,{redirect:'manual'});
  assert.equal(validation.status,200);const validated=(await validation.json()).invite;
  assert.equal(validated.tenantId,config.tenantId);assert.equal(validated.projectId,projectId);assert.equal(validated.role,'REQUESTER');
  await invalidRegistration(identity,inviteToken,{email:'wrong-'+identity.email});
  await invalidRegistration(identity,inviteToken,{tenantId:config.controlTenantId});
  await invalidRegistration(identity,inviteToken,{companyId:unassociated.id});
  const actor=new DotActor({identity,baseUrl:config.baseUrl,runId,trace});createdActors.push(actor);
  const {user}=await actor.register(inviteToken);identity.id=user.id;saveCredentials();
  await assert.rejects(()=>actor.register(inviteToken),error=>error instanceof ActorHttpError&&error.status===400);
  report.denials.push({actorId:actor.actorId,action:'register-reuse',status:400});
  await actor.login();assert.equal(actor.actorId,user.id);
  const access=(await actor.act('capabilities',{projectId})).capabilities;
  assert.equal(access.operationalRole,'REQUESTER');assert.equal(access.canAdminister,false);assert.equal(access.centralIT,false);
  assert.deepEqual((await actor.act('listProjects')).projects.map(p=>p.id),[projectId]);
  await deny(actor,'createProject',{name:'DOT SIM unauthorized employee project',crewBuild:'SLIM'},403);
  await deny(actor,'listMembers',{projectId},403);
  await deny(actor,'viewRequest',{ticketId:lifecycle.ticketId},404);
  await deny(admin,'inviteRequester',intent,409);
  const draft=(await actor.act('createRequest',{projectId,aorNodeId:lifecycle.aorNodeId,ticketType:'LAYOUT',fieldContact:'DOT SIM fictional contact',requestedDate:new Date(Date.now()+7*86400000).toISOString(),description:'DOT SIM newly invited requester acceptance'})).ticket;
  assert.equal(draft.status,'DRAFT');assert.equal((await actor.act('viewRequest',{ticketId:draft.id})).ticket.id,draft.id);
  report.createdAccounts.push({id:user.id,email:identity.email,companyId:company.id,draftId:draft.id});
 }
 const archivedIdentity={id:randomUUID(),tenantId:config.tenantId,companyId:options.companies[0].id,name:'DOT SIM archived invitation control',email:'archived-'+runId+'@dot-sim.example.invalid',password:randomBytes(24).toString('base64url'),role:'REQUESTER'};
 const archiveKey=randomUUID(),archiveIntent={projectId,companyId:archivedIdentity.companyId,email:archivedIdentity.email};
 const {inviteToken:archiveToken}=await admin.act('inviteRequester',archiveIntent,{key:archiveKey});
 assert.equal((await admin.act('archiveProject',{projectId})).project.status,'ARCHIVED');report.archived=true;
 await deny(admin,'inviteRequester',archiveIntent,409,{key:archiveKey});
 await deny(admin,'inviteRequester',{...archiveIntent,email:'new-'+archivedIdentity.email},409);
 const archivedActor=new DotActor({identity:archivedIdentity,baseUrl:config.baseUrl,runId,trace});
 await assert.rejects(()=>archivedActor.register(archiveToken),error=>error instanceof ActorHttpError&&error.status===400);
 report.denials.push({action:'register-archived-project',status:400});
 assert.equal((await admin.act('invitationOptions',{projectId})).projectStatus,'ARCHIVED');
 fs.writeFileSync(root+'/last-invitation-run.json',JSON.stringify(report,null,2)+'\n',{mode:0o600});
 console.log(JSON.stringify({runId,projectId,registeredRequesters:report.createdAccounts.length,denials:report.denials.length,archived:report.archived}));
}finally{for(const actor of [admin,ordinary,central,...createdActors])if(actor.hasSession)await actor.logout();}
