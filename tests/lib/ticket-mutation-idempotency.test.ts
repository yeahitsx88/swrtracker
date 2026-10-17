import test from 'node:test';
import assert from 'node:assert/strict';
import {executeAuthorizedTicketMutation} from '@/lib/ticket-mutation-idempotency';
import {ConflictError,ForbiddenError,NotFoundError} from '@/shared/errors';
import type {DbClient, UUID} from '@/shared/types';
import type {ProjectRole} from '@/modules/identity/domain/types';

const actor='11111111-1111-4111-8111-111111111111' as UUID;
const ticket='AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA' as UUID;
function fixture(role:ProjectRole){
 const state={role,projectStatus:'ACTIVE',ledgerReads:0,ledgerWrites:0,marker:false,grant:true,visible:true,
  row:{project_id:'project' as UUID,aor_node_id:'area' as UUID,requester_id:actor,
   assigned_party_chief_id:actor as UUID|null,assigned_instrument_man_id:actor as UUID|null,
   field_validation_reviewer_id:actor as UUID|null}};
 const db:DbClient={query:async<T extends object>(sql:string)=>{
  let rows:object[]=[];
  if(sql.includes('SELECT project_id,aor_node_id,requester_id')){assert.match(sql,/FOR UPDATE/);rows=[state.row];}
  else if(sql.includes('SELECT role'))rows=[{role:state.role}];
  else if(sql.includes('SELECT status FROM projects'))rows=[{status:state.projectStatus}];
  else if(sql.includes('SELECT t.id FROM tickets t'))rows=state.visible?[{id:ticket}]:[];
  else if(sql.includes('FROM users u JOIN companies'))rows=[{company_id:'company',type:'GC'}];
  else if(sql.includes('SELECT party_chief_id FROM crew_rosters'))rows=[];
  else if(sql.includes('SELECT id FROM crew_rosters'))rows=[{id:'crew'}];
  else if(sql.includes('aor_assignments'))rows=[{aor_node_id:'area'}];
  else if(sql.includes('WITH RECURSIVE ancestors'))rows=state.grant?[{id:'grant',aor_node_id:'area',granted_by:actor,granted_at:new Date()}]:[];
  else if(sql.includes('AS completed')){state.ledgerReads++;rows=[{completed:state.marker}];}
  else if(sql.includes('INSERT INTO api_idempotency')){state.ledgerWrites++;rows=[{idempotency_key:'key'}];}
  else if(sql.includes('UPDATE api_idempotency'))state.ledgerWrites++;
  else throw new Error('Unexpected SQL: '+sql);
  return{rows:rows as T[]};
 }};
 const run=(action:string)=>executeAuthorizedTicketMutation(db,{tenantId:'tenant' as UUID,actorId:actor,endpoint:'POST:/api/tickets/'+ticket+'/'+action,idempotencyKey:'key'},{ticketId:ticket},async()=>({status:200,body:{ok:true}}));
 return{state,run};
}
test('closed projects refuse review actions before recorded replay',async()=>{
 for(const action of ['approve','reject','rejection-proposal']){
  const f=fixture(action==='rejection-proposal'?'PARTY_CHIEF':'SURVEY_MANAGER');f.state.projectStatus='ARCHIVED';
  await assert.rejects(f.run(action),ConflictError);assert.equal(f.state.ledgerReads,0);assert.equal(f.state.ledgerWrites,0);
 }
});
test('post-lock visibility loss rejects role-only Chief replay before ledger',async()=>{
 const f=fixture('PARTY_CHIEF');f.state.visible=false;
 for(const action of ['restart-delay','survey-cancel','field-cancel'])await assert.rejects(f.run(action),NotFoundError);
 assert.equal(f.state.ledgerWrites,0);
});
const cases:readonly [string,ProjectRole][]=[['pc-approve','PARTY_CHIEF'],['pc-reject','PARTY_CHIEF'],['approve','SURVEY_MANAGER'],['return','SURVEY_MANAGER'],['assign','PARTY_CHIEF'],['start','INSTRUMENT_MAN'],['complete','INSTRUMENT_MAN'],['delay','INSTRUMENT_MAN'],['field-inability','INSTRUMENT_MAN'],['restart-delay','PARTY_CHIEF'],['priority','SURVEY_MANAGER'],['need-by','SURVEY_MANAGER'],['requester-cancel','REQUESTER'],['follow-up','REQUESTER'],['survey-cancel','INSTRUMENT_MAN'],['survey-cancel/approve','SURVEY_MANAGER'],['field-cancel','INSTRUMENT_MAN'],['field-inability/validate','PARTY_CHIEF'],['field-inability/reject','PARTY_CHIEF']];
for(const[action,role]of cases){
 test(action+' checks current action authority before ledger (uppercase ticket UUID)',async()=>{
  const f=fixture(role);assert.equal((await f.run(action)).status,200);assert.equal(f.state.ledgerWrites,2);
 });
 test(action+' denies renewed Viewer before ledger',async()=>{
  const f=fixture('VIEWER');await assert.rejects(f.run(action),ForbiddenError);assert.equal(f.state.ledgerWrites,0);assert.equal(f.state.ledgerReads,0);
 });
}
for(const action of ['pc-approve','pc-reject','assign','start','complete','delay','field-inability','survey-cancel','field-cancel','requester-cancel','follow-up','field-inability/validate','field-inability/reject']){
 test(action+' rejects lost current relationship',async()=>{
  const role=cases.find(row=>row[0]===action)![1],f=fixture(role);
  f.state.row={...f.state.row,requester_id:'other' as UUID,assigned_party_chief_id:'other' as UUID,assigned_instrument_man_id:'other' as UUID,field_validation_reviewer_id:'other' as UUID};
  await assert.rejects(f.run(action),ForbiddenError);assert.equal(f.state.ledgerWrites,0);
 });
}
test('Superintendent cannot replay a former Manager survey-cancel',async()=>{
 const f=fixture('SURVEY_SUPERINTENDENT');await assert.rejects(f.run('survey-cancel'),ForbiddenError);assert.equal(f.state.ledgerWrites,0);
});
test('delegated review grant revocation denies approval and return',async()=>{
 const f=fixture('SURVEY_SUPERINTENDENT');f.state.grant=false;
 for(const action of ['approve','return'])await assert.rejects(f.run(action),ForbiddenError);
 assert.equal(f.state.ledgerWrites,0);
});
for(const action of ['field-inability/validate','field-inability/reject']){
 test(action+' allows cleared duty only with own completed command and current role',async()=>{
  const f=fixture('PARTY_CHIEF');f.state.row.field_validation_reviewer_id=null;
  await assert.rejects(f.run(action),ForbiddenError);assert.equal(f.state.ledgerWrites,0);
  f.state.marker=true;assert.equal((await f.run(action)).status,200);
  f.state.row.field_validation_reviewer_id='replacement' as UUID;
  await assert.rejects(f.run(action),ForbiddenError);
  f.state.row.field_validation_reviewer_id=null;f.state.role='VIEWER';
  await assert.rejects(f.run(action),ForbiddenError);
 });
}


test('stop-work approval keeps Manager-only current authority when the pending flag has already cleared', async () => {
  for (const role of ['PARTY_CHIEF', 'INSTRUMENT_MAN', 'SURVEY_SUPERINTENDENT', 'REQUESTER', 'VIEWER'] as const) {
    const f = fixture(role);
    await assert.rejects(f.run('survey-cancel/approve'), ForbiddenError);
    assert.equal(f.state.ledgerReads, 0);
    assert.equal(f.state.ledgerWrites, 0);
  }
  const current = fixture('SURVEY_MANAGER');
  current.state.row.assigned_party_chief_id = null;
  current.state.row.assigned_instrument_man_id = null;
  assert.equal((await current.run('survey-cancel/approve')).status, 200);
  const hidden = fixture('SURVEY_MANAGER');
  hidden.state.visible = false;
  await assert.rejects(hidden.run('survey-cancel/approve'), NotFoundError);
  assert.equal(hidden.state.ledgerWrites, 0);
});
