import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readReviewDecision} from '../../src/modules/ticket/application/rejection-proposal';
import type {DbClient,UUID} from '../../src/shared/types';
import type {ProjectRole} from '../../src/modules/identity/domain/types';
const id=(value:string)=>value as UUID;
const actor=(role:ProjectRole)=>({tenantId:id('tenant'),ticketId:id('ticket'),actorId:id('actor'),actorRole:role});
function fixture(options:{status?:string;project?:string;team?:boolean;grant?:boolean;proposal?:boolean;missing?:boolean;failure?:Error;role?:ProjectRole}={}){
  const calls:{sql:string;params:unknown[]}[]=[];
  const db:DbClient={async query<T extends object>(sql:string,params:unknown[]=[]){
    calls.push({sql,params});let rows:object[]=[];
    if(sql.includes('p.status AS project_status'))rows=options.missing?[]:[{project_id:'project',aor_node_id:'area',status:options.status??'SUBMITTED',project_status:options.project??'ACTIVE'}];
    else if(sql.includes('FROM survey_rejection_proposals'))rows=options.proposal?[{id:'proposal',reason:'Reviewed reason',proposedBy:'chief',createdAt:'2026-10-08'}]:[];
    else if(sql.includes('FROM project_memberships pm'))rows=[{role:options.role??'SURVEY_MANAGER'}];
    else if(sql.includes('CROSS JOIN LATERAL')){if(options.failure)throw options.failure;rows=options.team?[{team_id:'team',area_id:'area',row_version:1}]:[];}
    else if(sql.includes('WITH RECURSIVE ancestors'))rows=options.grant?[{id:'grant',aor_node_id:'area',granted_by:'admin',granted_at:new Date()}]:[];
    else throw new Error('Unexpected query');
    return {rows:rows as T[]};
  }};return {db,calls};
}
test('read-visible Superintendent without current team/grant has no decision permission',async()=>{
 const f=fixture();const result=await readReviewDecision(f.db,actor('SURVEY_SUPERINTENDENT'));
 assert.equal(result.decision.available,false);assert.match(result.decision.reason!,/does not cover its Area/);
 assert.deepEqual(f.calls[0]!.params,['tenant','ticket']);assert.deepEqual(f.calls.at(-1)!.params,['tenant','project','area','actor']);
 assert.ok(f.calls.every(c=>!(/INSERT|UPDATE|DELETE/.test(c.sql))));
});
for(const options of [{team:true},{grant:true}])test('existing team or explicit Area grant permits Superintendent review '+JSON.stringify(options),async()=>{
 assert.equal((await readReviewDecision(fixture(options).db,actor('SURVEY_SUPERINTENDENT'))).decision.available,true);
});
test('Manager decision uses current actual role, not the supplied historical role',async()=>{
 assert.equal((await readReviewDecision(fixture().db,actor('SURVEY_MANAGER'))).decision.available,true);
 assert.equal((await readReviewDecision(fixture({role:'REQUESTER'}).db,actor('SURVEY_MANAGER'))).decision.available,false);
});
test('Chief needs current responsible team and pending proposal remains leadership-only',async()=>{
 assert.equal((await readReviewDecision(fixture().db,actor('PARTY_CHIEF'))).decision.available,false);
 assert.equal((await readReviewDecision(fixture({team:true}).db,actor('PARTY_CHIEF'))).decision.available,true);
 const result=await readReviewDecision(fixture({team:true,proposal:true}).db,actor('PARTY_CHIEF'));
 assert.equal(result.decision.available,false);assert.equal(result.proposal?.id,'proposal');assert.match(result.decision.reason!,/pending rejection/);
});
test('read-only project and stale request never offer a decision',async()=>{
 for(const options of [{project:'ARCHIVED'},{project:'SETUP'},{status:'APPROVED'}]){
 const f=fixture(options);assert.equal((await readReviewDecision(f.db,actor('SURVEY_SUPERINTENDENT'))).decision.available,false);assert.equal(f.calls.length,2);
 }
});
test('unsupported operational role does not gain review authority',async()=>{
 assert.equal((await readReviewDecision(fixture().db,actor('REQUESTER'))).decision.available,false);
});
test('missing scoped ticket and unexpected authority errors propagate',async()=>{
 await assert.rejects(readReviewDecision(fixture({missing:true}).db,actor('PARTY_CHIEF')),/Request not found/);
 const failure=new Error('Database unavailable');await assert.rejects(readReviewDecision(fixture({failure}).db,actor('PARTY_CHIEF')),e=>e===failure);
});
