import test from 'node:test';
import assert from 'node:assert/strict';
import {assertValidTransition,type TicketStatus,type WorkflowVariant} from '../../src/modules/workflow/domain/transitions';
const statuses:TicketStatus[]=['DRAFT','SUBMITTED','APPROVED','REJECTED','ASSIGNED','IN_PROGRESS','PENDING_FIELD_VALIDATION','RETURNED_FOR_CORRECTION','PENDING_PC_APPROVAL','DELAYED','COMPLETED','REQUESTER_CANCELED','FIELD_CANCELED','SURVEY_CANCELED'];
const terminal=new Set<TicketStatus>(['COMPLETED','REQUESTER_CANCELED','FIELD_CANCELED','SURVEY_CANCELED']);
function exits(variant:WorkflowVariant,from:TicketStatus){return statuses.filter(to=>{try{assertValidTransition(variant,from,to);return true;}catch{return false;}});}
test('every reachable waiting state has an exit and a cancel or return path',()=>{
 for(const variant of ['STANDARD_APPROVAL','DIRECT_ASSIGNMENT'] as const){
  const waiting:TicketStatus[]=[variant==='STANDARD_APPROVAL'?'DRAFT':'ASSIGNED'];
  const seen=new Set<TicketStatus>();
  while(waiting.length){
   const status=waiting.shift()!;if(seen.has(status))continue;seen.add(status);
   const next=exits(variant,status);
   if(terminal.has(status))assert.deepEqual(next,[],variant+':'+status);
   else{
    assert.ok(next.length,variant+':'+status+' must remain actionable');
    assert.ok(next.some(to=>terminal.has(to)||to==='RETURNED_FOR_CORRECTION'),variant+':'+status+' needs a safe refusal/cancel path');
   }
   waiting.push(...next.filter(to=>!seen.has(to)));
  }
 }
});
test('returned direct assignment resubmits through fresh approval before field assignment',()=>{
 const cycle:TicketStatus[]=['ASSIGNED','RETURNED_FOR_CORRECTION','SUBMITTED','APPROVED','ASSIGNED'];
 for(let i=1;i<cycle.length;i++)assert.doesNotThrow(()=>assertValidTransition('DIRECT_ASSIGNMENT',cycle[i-1]!,cycle[i]!));
 assert.throws(()=>assertValidTransition('DIRECT_ASSIGNMENT','SUBMITTED','ASSIGNED'));
});