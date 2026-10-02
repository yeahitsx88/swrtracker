import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {DotActor,ActorHttpError} from './actors.mjs';
import {validateRuntime,validatePopulation} from './policy.mjs';

const root = path.resolve('.data/dot-sim');
const config = validateRuntime(JSON.parse(fs.readFileSync(path.join(root,'runtime.json'),'utf8')));
const population = validatePopulation(JSON.parse(fs.readFileSync(path.join(root,'credentials.json'),'utf8')),config);
const runId = randomUUID();
const tracePath = path.join(root,`trace-${runId}.jsonl`);
const append = record => fs.appendFileSync(tracePath,JSON.stringify(record)+'\n',{mode:0o600});
const actors = Object.fromEntries(population.actors.map(identity => [identity.key,new DotActor({identity,baseUrl:config.baseUrl,runId,trace:append})]));
const identity = key => population.actors.find(a=>a.key===key);
const company = key => population.companies.find(c=>c.key===key);
const results = [];
async function denial(actor, action, input, status) {
  await assert.rejects(()=>actor.act(action,input),error=>error instanceof ActorHttpError && error.status === status,`${action} must deny ${status}`);
  results.push({actorId:actor.actorId,action,status});
}
const rootActor = actors['central-it'], admin = actors['project-admin'], manager = actors.manager;
await rootActor.login();
await admin.login();
await denial(admin,'createProject',{name:'DOT SIM forbidden creation',crewBuild:'FULL'},403);
const project = (await rootActor.act('createProject',{name:`DOT SIM V1 ${runId}`,crewBuild:'FULL'})).project;
const projectId = project.id;
await rootActor.act('associateCompany',{projectId,companyId:company('gc').id});
await rootActor.act('addMember',{projectId,userId:admin.actorId,role:'REQUESTER'});
await rootActor.act('grantAdministrator',{projectId,userId:admin.actorId,enabled:true});
// The earlier session is intentionally stale after membership/grant writes.
await denial(admin,'listMembers',{projectId},401);
await admin.login();
const cap = (await admin.act('capabilities',{projectId})).capabilities;
assert.equal(cap.canAdminister,true); assert.equal(cap.centralIT,false); assert.equal(cap.operationalRole,'REQUESTER');
assert.ok((await admin.act('listMembers',{projectId})).members.some(m=>m.userId===admin.actorId));
assert.equal((await admin.act('companies',{projectId})).candidates.some(c=>c.companyName===company('owner').name),false);
// Current UI hides candidates from an unassociated company; current POST also refuses it.
await denial(admin,'addMember',{projectId,userId:identity('owner-witness').id,role:'REQUESTER'},403);
await admin.act('associateCompany',{projectId,companyId:company('owner').id});
assert.ok((await admin.act('companies',{projectId})).candidates.some(c=>c.userId===identity('owner-witness').id));
await admin.act('addMember',{projectId,userId:identity('owner-witness').id,role:'REQUESTER'});
await admin.act('grantAdministrator',{projectId,userId:identity('owner-witness').id,enabled:true});
await admin.act('grantAdministrator',{projectId,userId:identity('owner-witness').id,enabled:false});
await denial(admin,'addMember',{projectId,userId:identity('disabled-control').id,role:'REQUESTER'},409);
await denial(admin,'addMember',{projectId,userId:identity('requester-1').id,role:'PROJECT_ADMIN'},400);
for (const [key,role] of [['manager','SURVEY_MANAGER'],['superintendent','SURVEY_SUPERINTENDENT'],
  ['chief-1','REQUESTER'],['chief-2','REQUESTER'],...[1,2,3,4].map(n=>[`instrument-${n}`,'REQUESTER']),
  ['requester-1','REQUESTER'],['requester-2','REQUESTER']]) {
  await admin.act('addMember',{projectId,userId:identity(key).id,role});
}
await denial(admin,'addMember',{projectId,userId:identity('requester-1').id,role:'VIEWER'},409);
await admin.act('associateCompany',{projectId,companyId:company('sub').id});
const sub = actors['sub-requester'];
if (!identity('sub-requester').registeredThroughApp) {
  const invited = await admin.act('inviteRequester',{projectId,companyId:company('sub').id,email:identity('sub-requester').email});
  const registered = await sub.register(invited.inviteToken);
  identity('sub-requester').id = registered.user.id;
  identity('sub-requester').registeredThroughApp = true;
  fs.writeFileSync(path.join(root,'credentials.json'),JSON.stringify(population,null,2)+'\n',{mode:0o600});
} else await admin.act('addMember',{projectId,userId:sub.actorId,role:'REQUESTER'});
await denial(admin,'addMember',{projectId,userId:sub.actorId,role:'SURVEY_MANAGER'},403);
await denial(admin,'grantAdministrator',{projectId,userId:sub.actorId,enabled:true},404);
const unrelated = (await rootActor.act('createProject',{name:`DOT SIM Project Isolation Control ${runId}`,crewBuild:'FULL'})).project;
await denial(admin,'listMembers',{projectId:unrelated.id},403);
await denial(admin,'associateCompany',{projectId:unrelated.id,companyId:company('gc').id},403);
await actors['foreign-control'].login();
const foreignProject = (await actors['foreign-control'].act('createProject',{name:`DOT SIM Foreign Negative Control ${runId}`,crewBuild:'FULL'})).project;
await denial(admin,'listMembers',{projectId:foreignProject.id},404);
await denial(rootActor,'addMember',{projectId,userId:actors['foreign-control'].actorId,role:'REQUESTER'},403);
await denial(admin,'associateCompany',{projectId,companyId:company('control').id},404);

const level = (await admin.act('createAreaLevel',{projectId,depth:0,label:'Synthetic Area'})).level;
const area = (await admin.act('createArea',{projectId,levelId:level.id,name:'DOT SIM Synthetic Area 1',code:'DOT1'})).node;
await admin.act('configureProject',{projectId,leadTimeEnforcementEnabled:true,leadTimeDays:2,maxAttachmentsPerTicket:4});
await admin.act('assignArea',{projectId,userId:identity('superintendent').id,aorNodeId:area.id});
await manager.login();
await denial(admin,'staffingSnapshot',{projectId},403);
for(const n of [1,2]) {
  const {snapshotToken} = await manager.act('staffingSnapshot',{projectId});
  await manager.act('staffCrew',{projectId,expectedSnapshot:snapshotToken,partyChiefId:identity(`chief-${n}`).id,areaId:area.id,
    superintendentId:identity('superintendent').id,instrumentManIds:[identity(`instrument-${n*2-1}`).id,identity(`instrument-${n*2}`).id],confirmRoleChanges:true});
}
const activation = await admin.act('activateProject',{projectId,acknowledgeWarnings:true});
assert.equal(activation.project.status,'ACTIVE');
for(const key of ['superintendent','chief-1','chief-2','instrument-1','instrument-2','instrument-3','instrument-4','requester-1','requester-2','sub-requester','owner-witness']) await actors[key].login();
for(const actor of Object.values(actors))if(actor.hasSession&&actor!==actors['foreign-control'])await actor.act('capabilities',{projectId});
const requester=actors['requester-1'], other=actors['requester-2'], instrument=actors['instrument-1'];
assert.ok((await requester.act('listProjects')).projects.some(p=>p.id===projectId));
await denial(other,'listMembers',{projectId},403);
await denial(other,'addMember',{projectId,userId:identity('disabled-control').id,role:'REQUESTER'},403);
await denial(other,'grantAdministrator',{projectId,userId:other.actorId,enabled:true},403);
await denial(other,'associateCompany',{projectId,companyId:company('gc').id},403);
await denial(sub,'staffingSnapshot',{projectId},403);
await assert.rejects(()=>actors['disabled-control'].login(),error=>error instanceof ActorHttpError&&error.status===401);
await other.logout();
await denial(other,'listProjects',{},401);
assert.ok((await requester.act('listProjects')).projects.some(p=>p.id===projectId));
await other.login();
const create = {projectId,aorNodeId:area.id,ticketType:'LAYOUT',fieldContact:'DOT SIM fictional contact',
  requestedDate:new Date(Date.now()+7*86400000).toISOString(),description:'DOT SIM deterministic synthetic request'};
const createKey=randomUUID();
const draft=(await requester.act('createRequest',create,{key:createKey})).ticket;
assert.equal(draft.status,'DRAFT');assert.equal(draft.ticketNumber,null);
assert.equal((await requester.act('createRequest',create,{key:createKey})).ticket.id,draft.id);
await assert.rejects(()=>requester.act('createRequest',{...create,description:'DOT SIM changed retry'},{key:createKey}),error=>error instanceof ActorHttpError&&error.status===409);
const ticketId=draft.id;
await requester.act('saveDraft',{ticketId,description:'DOT SIM saved synthetic instructions'});
assert.equal((await requester.act('submitRequest',{ticketId})).ticket.status,'SUBMITTED');
await denial(requester,'approveRequest',{ticketId},403);
await denial(rootActor,'approveRequest',{ticketId},404);
await denial(other,'viewRequest',{ticketId},404);
await denial(sub,'viewRequest',{ticketId},404);
await denial(admin,'viewRequest',{ticketId},404);
await denial(actors['foreign-control'],'viewRequest',{ticketId},404);
const approvalKey=randomUUID();
assert.equal((await manager.act('approveRequest',{ticketId},{key:approvalKey})).ticket.status,'APPROVED');
assert.equal((await manager.act('approveRequest',{ticketId},{key:approvalKey})).ticket.status,'APPROVED');
assert.equal((await actors.superintendent.act('assignCrew',{ticketId,assignedPartyChiefId:actors['chief-1'].actorId,assignedInstrumentManId:instrument.actorId})).ticket.status,'ASSIGNED');
assert.equal((await instrument.act('startWork',{ticketId})).ticket.status,'IN_PROGRESS');
assert.equal((await instrument.act('completeWork',{ticketId})).ticket.status,'COMPLETED');
assert.equal((await requester.act('viewRequest',{ticketId})).ticket.status,'COMPLETED');
await denial(other,'completeWork',{ticketId},404);
for(const actor of Object.values(actors))if(actor.hasSession)await actor.logout();
const report = {schema:1,runId,projectId,unrelatedProjectId:unrelated.id,foreignProjectId:foreignProject.id,ticketId,
  completed:true,denials:results,traceFile:path.basename(tracePath),
  checks:['separate pure Project Admin','company prerequisite reproduced','OWNER_REP grant/revoke','disabled and duplicate member refusal',
    'scoped fixed roles','independent sessions and logout','HTTP invitation/registration','Manager staffing','Project Admin activation',
    'tenant/project/company denials','idempotent create/approval and mismatch refusal','HTTP draft-submit-approve-assign-start-complete']};
fs.writeFileSync(path.join(root,'last-run.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});
console.log(JSON.stringify(report));
