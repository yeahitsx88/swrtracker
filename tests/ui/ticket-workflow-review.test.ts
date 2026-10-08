import test from 'node:test';
import assert from 'node:assert/strict';
import {executeTicketWorkflow,ticketWorkflowReview,type TicketWorkflowAction,type TicketWorkflowIntent} from '../../src/lib/ticket-workflow-review';
import {FrozenCommand} from '../../src/lib/frozen-command';

const routes:Record<TicketWorkflowAction,string>={'requester-cancel':'requester-cancel','follow-up':'follow-up',start:'start',complete:'complete',delay:'delay',inability:'field-inability',stop:'survey-cancel','approve-stop':'survey-cancel/approve',restart:'restart-delay','validate-inability':'field-inability/validate','reject-inability':'field-inability/reject','approve-legacy':'pc-approve','reject-legacy':'pc-reject',approve:'approve',return:'return',cancel:'survey-cancel','need-by':'need-by',high:'priority',normal:'priority'};
test('workflow callers retain exact idempotency keys and existing endpoint payloads for every reviewed action',async()=>{
 const original=globalThis.fetch;
 try {
  for(const [action,path] of Object.entries(routes)){
   let captured:RequestInit|undefined;
   globalThis.fetch=async(url,options)=>{assert.equal(url,'/api/tickets/ticket-1/'+path);captured=options;return new Response(JSON.stringify({ticket:{id:'ticket-1'}}),{status:200});};
   await executeTicketWorkflow({ticketId:'ticket-1',action:action as TicketWorkflowAction,reason:'Area not ready',requestedDate:'2026-11-12'},'original-key');
   assert.equal((captured?.headers as Record<string,string>)['Idempotency-Key'],'original-key');assert.equal(captured?.method,'POST');
   const body=captured?.body?JSON.parse(String(captured.body)):null;
   if(['delay','inability','stop','validate-inability','reject-inability','reject-legacy','return','cancel'].includes(action))assert.deepEqual(body,{reason:'Area not ready'});
   else if(action==='need-by')assert.deepEqual(body,{requestedDate:'2026-11-12',reason:'Area not ready'});
   else if(action==='high'||action==='normal')assert.deepEqual(body,{priority:action==='high'?'HIGH':'NORMAL',reason:'Area not ready'});
   else assert.equal(body,null);
  }
 } finally {globalThis.fetch=original;}
});
test('a lost response retries the original reviewed input/key, blocks duplicates and requires deliberate reload on conflict',async()=>{
 const gate=new FrozenCommand<TicketWorkflowIntent>(),original=globalThis.fetch,calls:RequestInit[]=[];
 try{
  globalThis.fetch=async(_url,options)=>{calls.push(options!);if(calls.length===1)throw new TypeError('lost response');return new Response(JSON.stringify({ticket:{}}));};
  const first=gate.begin({ticketId:'ticket-1',action:'delay',reason:'Original reason',requestedDate:''},'same-key')!;
  assert.equal(gate.begin({...first.body,reason:'Different reason'},'new-key'),null);
  await assert.rejects(()=>executeTicketWorkflow(first.body,first.key));gate.fail();assert.equal(gate.reload(),false);
  const retry=gate.begin({...first.body,reason:'Different reason'},'new-key')!;
  await executeTicketWorkflow(retry.body,retry.key);assert.equal(calls[0]?.body,calls[1]?.body);assert.deepEqual(calls[0]?.headers,calls[1]?.headers);
  gate.fail(409);assert.equal(gate.begin(first.body,'another-key'),null);assert.equal(gate.reload(),true);
 }finally{globalThis.fetch=original;}
});
test('action explanations separate direct completion, correctable returns, stop-work requests and retained legacy reports',()=>{
 const ticket={pendingPcOutcome:null};
 assert.match(ticketWorkflowReview('complete',ticket).next,/no Party Chief approval/);
 assert.match(ticketWorkflowReview('stop',ticket).consequence,/does not immediately cancel/);
 assert.match(ticketWorkflowReview('approve-stop',ticket).consequence,/recorded reason/);
 assert.equal(ticketWorkflowReview('approve-stop',ticket).reason,false);
 assert.match(ticketWorkflowReview('validate-inability',ticket).next,/same reference/);
 assert.match(ticketWorkflowReview('approve-legacy',{pendingPcOutcome:'FIELD_CANCELED'}).title,/Cancellation/);
 assert.equal(ticketWorkflowReview('need-by',ticket).date,true);
 assert.match(ticketWorkflowReview('need-by',ticket).next,/priority remains unchanged/);
 assert.match(ticketWorkflowReview('high',ticket).next,/Need-By date remains unchanged/);
});
