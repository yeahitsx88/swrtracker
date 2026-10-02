import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {newRuntime,newPopulation,validateRuntime,validatePopulation,assertDatabaseTarget,assertOwner,assertLocalBase,databaseUrl,names} from '../../scripts/dot-sim/policy.mjs';
import {DotActor,ActorHttpError,type Trace} from '../../scripts/dot-sim/actors.mjs';

test('dot bootstrap refuses unrelated targets, inherited host URLs, missing guard and altered runtime settings',()=>{
  const config=newRuntime();assertDatabaseTarget(databaseUrl(config),'1');
  for(const url of ['postgresql://postgres:secret@localhost:15488/swr_sabine_simulation',databaseUrl(config).replace(names.db,'127.0.0.1'),databaseUrl(config).replace(names.database,'survey_dev'),databaseUrl(config)+'?host=/tmp']) {
    assert.throws(()=>assertDatabaseTarget(url,'1'));
  }
  assert.throws(()=>assertDatabaseTarget(databaseUrl(config),undefined));
  assert.throws(()=>validateRuntime({...config,baseUrl:'https://hosted.example'}));
  assert.throws(()=>assertLocalBase('http://localhost:3118'));
  assert.throws(()=>assertLocalBase('http://127.0.0.1:3106'));
  assert.throws(()=>assertLocalBase('http://user:secret@127.0.0.1:3118'));
});
test('dot resource ownership requires both simulation identity and generated owner',()=>{
  const config=newRuntime();
  assertOwner({Labels:{[names.label]:'dot-sim',[names.ownerLabel]:config.ownerId}},config,'volume');
  for(const labels of [{}, {[names.label]:'sabine',[names.ownerLabel]:config.ownerId},{[names.label]:'dot-sim',[names.ownerLabel]:randomUUID()}])assert.throws(()=>assertOwner({Config:{Labels:labels}},config,'container'));
});
test('dot population is fictional, has unique generated passwords and no intended tenant power for the Project Admin',()=>{
  const config=newRuntime(),population=newPopulation(config);
  validatePopulation(population,config);
  assert.equal(population.actors.find(a=>a.key==='project-admin')!.role,'PROJECT_ADMIN');
  assert.equal(new Set(population.actors.map(a=>a.password)).size,16);
  assert.ok(population.actors.every(a=>a.email.endsWith('@dot-sim.example.invalid')));
  const changed=structuredClone(population);changed.actors[0]!.email='real@customer.com';assert.throws(()=>validatePopulation(changed,config));
});
test('actor cookies stay independent, logout clears one session, and trace omits all secrets',async()=>{
  const config=newRuntime(),population=newPopulation(config),trace:Trace[]=[],requests:Array<{cookie:string|null;key:string|null;body:string;path:string}>=[];
  const identities=population.actors.slice(0,2),cookies=['swr_session=secret-token-one','swr_session=secret-token-two'];
  const fetchImpl:typeof fetch=async(input,init)=>{
    const path=String(input),headers=new Headers(init?.headers),body=String(init?.body??'');
    requests.push({cookie:headers.get('cookie'),key:headers.get('Idempotency-Key'),body,path});
    if(path.endsWith('/login')) {
      const i=identities.findIndex(a=>a.email===JSON.parse(body).email),a=identities[i]!;
      return Response.json({user:{id:a.id,tenantId:a.tenantId}},{headers:{'set-cookie':cookies[i]!+'; HttpOnly; Secure; SameSite=Strict'}});
    }
    return Response.json({projects:[]});
  };
  const [one,two]=identities.map(identity=>new DotActor({identity,baseUrl:config.baseUrl,runId:randomUUID(),trace:r=>trace.push(r),fetchImpl}));
  await one!.login();await two!.login();await one!.act('listProjects');await two!.act('listProjects');
  assert.equal(requests[2]!.cookie,cookies[0]);assert.equal(requests[3]!.cookie,cookies[1]);
  await one!.logout();assert.equal(one!.hasSession,false);assert.equal(two!.hasSession,true);
  await one!.act('listProjects');assert.equal(requests.at(-1)!.cookie,null);
  await two!.act('listProjects');assert.equal(requests.at(-1)!.cookie,cookies[1]);
  const serialized=JSON.stringify(trace);
  for(const secret of [...identities.map(a=>a.password),...cookies])assert.ok(!serialized.includes(secret));
  assert.ok(!serialized.includes('cookie'));assert.ok(!serialized.includes('token'));
});
test('actor preserves explicit retry key, refuses redirects, and never retries a denial as another identity',async()=>{
  const config=newRuntime(),identity=newPopulation(config).actors[1]!,seen:string[]=[],key=randomUUID();
  const fake:typeof fetch=async(_input,init)=>{seen.push(new Headers(init?.headers).get('Idempotency-Key')!);return Response.json({error:{type:'ForbiddenError',message:'server-secret-do-not-log'}},{status:403});};
  const actor=new DotActor({identity,baseUrl:config.baseUrl,runId:randomUUID(),fetchImpl:fake});
  for(let i=0;i<2;i++)await assert.rejects(()=>actor.act('addMember',{projectId:randomUUID(),userId:randomUUID(),role:'REQUESTER'},{key}),e=>e instanceof ActorHttpError&&e.status===403&&!e.message.includes('server-secret'));
  assert.deepEqual(seen,[key,key]);
  const redirect=new DotActor({identity,baseUrl:config.baseUrl,runId:randomUUID(),fetchImpl:async()=>new Response(null,{status:302,headers:{location:'https://external.example'}})});
  await assert.rejects(()=>redirect.login(),e=>e instanceof ActorHttpError&&e.status===302);
});
test('actor freezes queued intent and emits one sanitized failure for a transport interruption',async()=>{
  const config=newRuntime(),identity=newPopulation(config).actors[1]!,trace:Trace[]=[];
  const body={projectId:randomUUID(),userId:randomUUID(),role:'REQUESTER'};
  let observed='';
  const actor=new DotActor({identity,baseUrl:config.baseUrl,runId:randomUUID(),trace:r=>trace.push(r),fetchImpl:async(_input,init)=>{observed=String(init?.body);throw new Error('transport cookie-secret');}});
  const pending=actor.act('addMember',body);body.role='TENANT_ADMIN';
  await assert.rejects(()=>pending,/before a confirmed result/);
  assert.equal(JSON.parse(observed).role,'REQUESTER');assert.equal(trace.length,1);assert.equal(trace[0]!.success,false);assert.equal(trace[0]!.httpStatus,null);
});

test('dot launcher refuses remote Docker daemons and filesystem redirection into other environments',async()=>{
  const {assertLocalDockerTarget,assertDataRoot}=await import('../../scripts/dot-sim/policy.mjs');
  const fs=await import('node:fs'),os=await import('node:os'),path=await import('node:path');
  assertLocalDockerTarget('npipe:////./pipe/dockerDesktopLinuxEngine');assertLocalDockerTarget('unix:///var/run/docker.sock');
  for(const value of ['tcp://127.0.0.1:2375','tcp://hosted.example:2376','ssh://server','https://remote'])assert.throws(()=>assertLocalDockerTarget(value));
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'swr-dot-policy-'));
  try{
    const data=path.join(root,'.data','dot-sim');assertDataRoot(root,data);
    assert.throws(()=>assertDataRoot(root,path.join(root,'.data','sabine')));
    fs.mkdirSync(path.join(root,'.data'));fs.mkdirSync(path.join(root,'foreign'));
    fs.symlinkSync(path.join(root,'foreign'),data,'junction');assert.throws(()=>assertDataRoot(root,data));
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('bootstrap requires the exact database ownership marker and refuses a moved control administrator',async()=>{
  const {assertDatabaseMarker}=await import('../../scripts/dot-sim/policy.mjs');
  const config=newRuntime(),marker={owner_id:config.ownerId,kind:'dot-sim',version:1,tenant_id:config.tenantId};
  assertDatabaseMarker([marker],config);
  for(const rows of [[],[marker,marker],[{...marker,owner_id:randomUUID()}],[{...marker,kind:'sabine'}],[{...marker,tenant_id:randomUUID()}]])assert.throws(()=>assertDatabaseMarker(rows,config));
  const population=newPopulation(config),control=population.actors.find(a=>a.key==='foreign-control')!,gc=population.companies.find(c=>c.key==='gc')!;
  control.companyId=gc.id;control.tenantId=gc.tenantId;assert.throws(()=>validatePopulation(population,config));
});

test('capability traces whitelist metadata instead of logging raw application responses',async()=>{
  const config=newRuntime(),identity=newPopulation(config).actors[1]!,trace:Trace[]=[],projectId=randomUUID();
  const actor=new DotActor({identity,baseUrl:config.baseUrl,runId:randomUUID(),trace:r=>trace.push(r),fetchImpl:async()=>Response.json({capabilities:{canAdminister:true,centralIT:false,operationalRole:'REQUESTER',accessDisabled:false,jwt:'forbidden-response-secret',password:'forbidden-response-secret'}})});
  await actor.act('capabilities',{projectId});
  assert.equal(trace[0]!.observedCapabilities?.operationalRole,'REQUESTER');
  assert.ok(!JSON.stringify(trace).includes('forbidden-response-secret'));
});
