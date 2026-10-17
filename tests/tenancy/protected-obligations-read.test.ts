import test from 'node:test';
import assert from 'node:assert/strict';
import {readProtectedObligations,parseProtectedReadQuery} from '../../src/modules/tenancy/application/read-protected-obligations';
import {ForbiddenError,ValidationError} from '../../src/shared/errors';
import type {ProtectedObligationsRepository,ResolutionAuthority} from '../../src/modules/tenancy/application/protected-obligations.types';
import type {UUID,DbClient} from '../../src/shared/types';
const uid='98000000-0000-4000-8000-000000000001' as UUID;
const auth={tenantId:uid,userId:uid,sessionVersion:1};const db={} as DbClient;
const authority:ResolutionAuthority={branch:'SURVEY_MANAGER',actorId:uid,tenantId:uid,projectId:uid,actorMembershipId:uid,actorCompanyId:uid,actorCompanyType:'GC',actorSessionVersion:1,project:{status:'ACTIVE',crewBuild:'FULL'}};
test('read checks current authority before looking up a subject',async()=>{
 let read=false;const repo={readAuthority:async()=>{throw new ForbiddenError();},readPage:async()=>{read=true;}} as unknown as ProtectedObligationsRepository;
 await assert.rejects(readProtectedObligations(repo,db,auth,uid,{mode:'obligations',userId:uid,query:{search:'',limit:25,offset:0}}),ForbiddenError);assert.equal(read,false);
});
test('bounded read forwards current scoped authority and parsed query',async()=>{
 const result={mode:'personnel' as const,project:authority.project,personnel:{data:[],total:0,limit:25,offset:0}};
 const repo={readAuthority:async()=>authority,readPage:async(_db:DbClient,scope:unknown,current:ResolutionAuthority,query:unknown)=>{assert.deepEqual(scope,{tenantId:uid,projectId:uid});assert.equal(current,authority);assert.deepEqual(query,{mode:'personnel',query:{search:'Jason',limit:25,offset:0}});return result;}} as unknown as ProtectedObligationsRepository;
 assert.equal(await readProtectedObligations(repo,db,auth,uid,parseProtectedReadQuery(new URLSearchParams('mode=personnel&search=%20Jason%20'))),result);
});
test('read modes require only their exact fields, canonical UUIDs and bounded pagination',()=>{
 for(const q of ['mode=personnel&mode=personnel','mode=personnel&userId='+uid,'mode=personnel&unknown=x','mode=obligations','mode=candidates&userId='+uid,'mode=obligations&userId=no','mode=personnel&limit=11','mode=personnel&offset=-1','mode=personnel&offset=9007199254740992','mode=personnel&search='+ 'x'.repeat(201)]) assert.throws(()=>parseProtectedReadQuery(new URLSearchParams(q)),ValidationError,q);
 assert.deepEqual(parseProtectedReadQuery(new URLSearchParams('mode=candidates&userId='+uid+'&grantId='+uid+'&limit=10&offset=20')),{mode:'candidates',userId:uid,grantId:uid,query:{search:'',limit:10,offset:20}});
});

test('UUID inputs canonicalize and control-character searches are refused',()=>{
 const raw='ABCDEFAB-0000-4000-8000-000000000001';
 const result=parseProtectedReadQuery(new URLSearchParams('mode=obligations&userId='+raw));assert.equal(result.mode,'obligations');if(result.mode!=='obligations')throw Error();assert.equal(result.userId,raw.toLowerCase());
 assert.throws(()=>parseProtectedReadQuery(new URLSearchParams('mode=personnel&search=%00')),ValidationError);
});
