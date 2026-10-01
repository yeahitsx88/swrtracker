import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { handlePostProject, type ProjectCreateDeps } from '@/app/api/projects/post-handler';
import type { ITenancyRepository } from '@/modules/tenancy/application/ports';
test('project API requires tenant administration and preserves SETUP without granting an operator role',async()=>{
 const saved:unknown[]=[];const repo={saveProject:async(_db:unknown,p:unknown)=>{saved.push(p);}} as unknown as ITenancyRepository;
 const deps:ProjectCreateDeps={requireAuth:async()=>({tenantId:'tenant' as never,userId:'admin' as never,sessionVersion:1}),getTenantRole:async()=>'TENANT_ADMIN',repo,db:{query:async()=>({rows:[]})}};
 const request=()=>new NextRequest('http://localhost/api/projects',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'New project',crewBuild:'FULL',tenantId:'attacker'})});
 const allowed=await handlePostProject(request(),deps);assert.equal(allowed.status,201);const body=await allowed.json();assert.equal(body.project.status,'SETUP');assert.equal(body.project.tenantId,'tenant');assert.equal(saved.length,1);
 for(const role of [null,'BILLING_VIEWER'] as const)assert.equal((await handlePostProject(request(),{...deps,getTenantRole:async()=>role})).status,403);
 assert.equal(saved.length,1);
});
