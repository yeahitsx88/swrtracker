import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewProjectTemplate} from '../../src/modules/tenancy/application/project-templates';
import type {ITenancyRepository} from '../../src/modules/tenancy/application/ports';
import type {DbClient,UUID} from '../../src/shared/types';
import type {ProjectTemplate} from '../../src/modules/tenancy/domain/types';
const tenant='tenant' as UUID,id='template' as UUID;
const template:ProjectTemplate={id,tenantId:tenant,name:'Review template',crewBuild:'FULL',aorDepth:1,aorLevelLabels:['Area'],disciplineGroups:['Survey'],createdBy:null,createdAt:new Date('2026-10-08T00:00:00Z')};
function fixture(evidence='event-a',found=true){
 const calls:string[]=[];
 const repo={findProjectTemplateById:async(_db:DbClient,t:UUID,resource:UUID)=>{assert.equal(t,tenant);assert.equal(resource,id);calls.push('read');return found?template:null;},findProjectsUsingTemplate:async(_db:DbClient,t:UUID,resource:UUID)=>{assert.equal(t,tenant);assert.equal(resource,id);calls.push('usage');return[{id:'project' as UUID,name:'Established project'}];}} as unknown as ITenancyRepository;
 const db={query:async<T extends object>(sql:string,params?:unknown[])=>{assert(sql.includes('administrative_events'));assert.deepEqual(params,[tenant,id]);calls.push('evidence');return{rows:[{evidence}] as unknown as T[]};}} as DbClient;
 return{repo,db,calls};
}
test('current Central template review retains complete structure, identity and referencing projects',async()=>{const f=fixture();const r=await reviewProjectTemplate(f.repo,f.db,{tenantId:tenant,templateId:id,actorRole:'TENANT_ADMIN'});assert.deepEqual(r.template,template);assert.equal(r.referencingProjects[0]?.name,'Established project');assert.match(r.snapshot,/^[a-f0-9]{64}$/);assert.deepEqual(f.calls,['read','usage','evidence']);});
test('template review snapshot rejects change-and-revert through retained audit evidence',async()=>{const a=fixture('event-a'),b=fixture('event-a,event-b,event-c');const review=async(f:ReturnType<typeof fixture>)=>reviewProjectTemplate(f.repo,f.db,{tenantId:tenant,templateId:id,actorRole:'TENANT_ADMIN'});assert.notEqual((await review(a)).snapshot,(await review(b)).snapshot);});
test('unchanged template and evidence retain an identical review snapshot',async()=>{const a=fixture(),b=fixture();const review=async(f:ReturnType<typeof fixture>)=>reviewProjectTemplate(f.repo,f.db,{tenantId:tenant,templateId:id,actorRole:'TENANT_ADMIN'});assert.equal((await review(a)).snapshot,(await review(b)).snapshot);});
test('ordinary users cannot read current template data or evidence',async()=>{const f=fixture();await assert.rejects(()=>reviewProjectTemplate(f.repo,f.db,{tenantId:tenant,templateId:id,actorRole:null}),{name:'ForbiddenError'});assert.deepEqual(f.calls,[]);});
test('missing scoped template does not read usage or another tenant evidence',async()=>{const f=fixture('',false);await assert.rejects(()=>reviewProjectTemplate(f.repo,f.db,{tenantId:tenant,templateId:id,actorRole:'TENANT_ADMIN'}),{name:'NotFoundError'});assert.deepEqual(f.calls,['read']);});
