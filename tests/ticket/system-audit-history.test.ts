import test from 'node:test';
import assert from 'node:assert/strict';
import {appendAuditEvent} from '../../src/modules/audit/infrastructure/audit.repository';
import {listTicketHistory} from '../../src/modules/ticket/infrastructure/ticket-history.repository';
import type {DbClient,UUID} from '../../src/shared/types';
const tenantId='tenant' as UUID,ticketId='ticket' as UUID;
test('explicit system audit has no employee actor; human audit retains its actor',async()=>{
 const calls:unknown[][]=[];const db={query:async(_sql:string,args:unknown[])=>{calls.push(args);return {rows:[]};}} as DbClient;
 await appendAuditEvent(db,{tenantId,ticketId,actorId:null,actorKind:'SYSTEM',eventType:'approver.timeout_unlocked',payload:{hoursElapsed:24}});
 await appendAuditEvent(db,{tenantId,ticketId,actorId:'human' as UUID,eventType:'ticket.created',payload:{}});
 assert.equal(calls[0]?.[3],null);assert.equal(calls[0]?.[6],'SYSTEM');assert.equal(calls[1]?.[3],'human');assert.equal(calls[1]?.[6],'USER');
 assert.deepEqual(calls.map(row=>row.slice(1,3)),[[ticketId,tenantId],[ticketId,tenantId]]);
});
test('history labels only explicit system identity and never renames a missing human',async()=>{
 const db={query:async(sql:string,args:unknown[])=>{assert.deepEqual(args,[tenantId,ticketId]);assert.match(sql,/te.actor_kind/);return {rows:[
 {id:'system',source:'TICKET_EVENT',type:'approver.timeout_unlocked',occurred_at:'2026-10-07',actor_id:null,actor_name:null,actor_kind:'SYSTEM',details:{hoursElapsed:24}},
 {id:'human',source:'TICKET_EVENT',type:'ticket.created',occurred_at:'2026-10-07',actor_id:'human',actor_name:null,actor_kind:'USER',details:{}},
 {id:'unknown',source:'TICKET_EVENT',type:'ticket.created',occurred_at:'2026-10-07',actor_id:null,actor_name:null,actor_kind:null,details:{}}
 ]};}} as DbClient;
 const history=await listTicketHistory(db,tenantId,ticketId);assert.deepEqual(history[0]?.actor,{id:null,name:'SWRTracker System',kind:'SYSTEM'});assert.deepEqual(history[1]?.actor,{id:'human',name:'Unknown user'});assert.equal(history[2]?.actor,null);
});
