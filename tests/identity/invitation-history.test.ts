import test from 'node:test';
import assert from 'node:assert/strict';
import {parseInvitationHistoryQuery} from '../../src/modules/identity/application/project-invitation-history';
import {readProjectInvitationHistory} from '../../src/modules/identity/infrastructure/project-invitation-history.reader';
import type {DbClient,UUID} from '../../src/shared/types';
test('invitation history defaults to retained outcomes and bounds pages with explicit state/literal search',()=>{
 assert.deepEqual(parseInvitationHistoryQuery(new URLSearchParams()),{state:'HISTORY',search:'',limit:25,offset:0});
 assert.deepEqual(parseInvitationHistoryQuery(new URLSearchParams('state=ALL&search=%25_&limit=100&offset=25')),{state:'ALL',search:'%_',limit:100,offset:25});
 for(const input of ['state=UNKNOWN','limit=0','limit=101','offset=-1','offset=1.5','offset=9007199254740992','limit=','state=ACCEPTED&state=EXPIRED','search=a&search=b','token=secret','search='+encodeURIComponent('x'.repeat(201)),'search=hello%00world'])assert.throws(()=>parseInvitationHistoryQuery(new URLSearchParams(input)),{name:'ValidationError'});
});
test('history returns only public retained fields, bounds tenant/project/page and preserves date identity',async()=>{
 const when=new Date('2026-01-01T00:00:00Z');const query={state:'HISTORY' as const,search:'%_',limit:25,offset:0};
 const db:DbClient={query:async<T extends object>(_sql:string,params?:unknown[])=>{assert.deepEqual(params,['tenant','project','HISTORY','%_',25,0]);return {rows:[{id:'owned',email:'owned@example.test',role:'REQUESTER',company_id:'company',company_name:'Retained company',state:'ACCEPTED',created_at:when,expires_at:when,accepted_at:when,canceled_at:null,project_status:'ARCHIVED',cancellation_id:null,witnessed:false,total:'1',observed_at:when,token:'never-public',invited_by:'private-actor'}] as T[]};}};
 const history=await readProjectInvitationHistory(db,'tenant' as UUID,'project' as UUID,query);
 assert.equal(history.total,1);assert.equal(history.observedAt,when.toISOString());assert.deepEqual(history.data[0],{id:'owned',email:'owned@example.test',role:'REQUESTER',companyId:'company',companyName:'Retained company',state:'ACCEPTED',createdAt:when.toISOString(),expiresAt:when.toISOString(),acceptedAt:when.toISOString(),canceledAt:null,canCancel:false});assert(!JSON.stringify(history).includes('never-public'));
});
test('empty and beyond-last pages keep aggregate total without inventing an invitation',async()=>{
 for(const total of ['0','104']){const db:DbClient={query:async<T extends object>()=>({rows:[{id:null,total,observed_at:new Date('2026-01-01')}] as T[]})};
 const result=await readProjectInvitationHistory(db,'tenant' as UUID,'project' as UUID,{state:'ALL',search:'',limit:25,offset:1000});assert.deepEqual(result.data,[]);assert.equal(result.total,Number(total));assert.equal(result.offset,1000);}
});
