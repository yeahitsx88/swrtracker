import test from 'node:test';
import assert from 'node:assert/strict';
import {assertRecommissioningMutation} from '../../src/lib/recommissioning-gate';
import type {DbClient,UUID} from '../../src/shared/types';
const tenant='tenant' as UUID,project='project' as UUID;
function db(status:string,pending=false):DbClient{return {query:async<T extends object>(sql:string,params?:unknown[])=>{assert.match(sql,/p.tenant_id=\$1 AND p.id=\$2/);assert.deepEqual(params,[tenant,project]);return {rows:[{status,id:pending?'preparation':null}] as unknown as T[]};}};}
test('archived projects refuse ordinary work, cancellation and reassignment before replay',async()=>{
 for(const path of ['start','delay','complete','pc-approve','pc-reject','assign','survey-cancel','requester-cancel','field-inability/validate'])await assert.rejects(()=>assertRecommissioningMutation(db('ARCHIVED'),tenant,project,'/api/tickets/11111111-1111-4111-8111-111111111111/'+path),{name:'ConflictError',code:'PROJECT_ARCHIVED'});
});
test('active work remains available and preparation retains only its already-approved resolution paths',async()=>{
 await assertRecommissioningMutation(db('ACTIVE'),tenant,project);
 for(const path of ['assign','requester-cancel','field-cancel','survey-cancel','survey-cancel/approve'])await assertRecommissioningMutation(db('SETUP',true),tenant,project,'/api/tickets/11111111-1111-4111-8111-111111111111/'+path);
 await assert.rejects(()=>assertRecommissioningMutation(db('SETUP',true),tenant,project,'/api/tickets/11111111-1111-4111-8111-111111111111/delay'),{name:'ConflictError',code:'PROJECT_RECOMMISSIONING'});
});

const ticket='11111111-1111-4111-8111-111111111111';
function cancelling():DbClient{return {query:async<T extends object>(sql:string,params?:unknown[])=>{assert.match(sql,/c.tenant_id=p.tenant_id AND c.project_id=p.id/);assert.deepEqual(params,[tenant,project]);return {rows:[{status:'SETUP',id:null,cancellation_id:'cancellation',reviewed_evidence:{work:[{id:ticket}]}}] as unknown as T[]};}};}
test('preparation cancellation permits only witnessed completion and cleanup paths',async()=>{
 for(const path of ['requester-cancel','field-cancel','survey-cancel','survey-cancel/approve','complete','pc-approve','field-inability/validate','draft'])await assertRecommissioningMutation(cancelling(),tenant,project,`/api/tickets/${ticket}/${path}`);
 for(const path of ['assign','start','restart','delay','pc-reject','approve','delegate','return','field-inability','field-inability/reject','submit','resubmit'])await assert.rejects(()=>assertRecommissioningMutation(cancelling(),tenant,project,`/api/tickets/${ticket}/${path}`),{code:'PROJECT_PREPARATION_CANCELLING'});
 await assert.rejects(()=>assertRecommissioningMutation(cancelling(),tenant,project),{code:'PROJECT_PREPARATION_CANCELLING'});
 await assert.rejects(()=>assertRecommissioningMutation(cancelling(),tenant,project,'/api/tickets/22222222-2222-4222-8222-222222222222/complete'),{code:'PROJECT_PREPARATION_CANCELLING'});
});
