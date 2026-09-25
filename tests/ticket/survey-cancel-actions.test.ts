import assert from 'node:assert/strict';import test from 'node:test';
import {getSurveyCancelActions} from '@/modules/ticket/application/survey-cancel-actions';
import type {ITicketRepository,VisibilityScope} from '@/modules/ticket/application/ports';import type {Ticket} from '@/modules/ticket/domain/types';import type {DbClient,UUID} from '@/shared/types';
const id=(n:number)=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}` as UUID;
const db:DbClient={async query(){throw new Error('No SQL');}};
const repo={findActiveProjectCrewBuild:async()=> 'FULL'} as unknown as ITicketRepository;
const ticket={tenantId:id(1),projectId:id(2),companyId:id(3),assignedPartyChiefId:id(4),surveySuperintendentId:id(5),status:'IN_PROGRESS',cancelInitiatedAt:null,draftDeletedAt:null} as Ticket;
const chief:VisibilityScope={actorId:id(4),actorRole:'PARTY_CHIEF',companyId:id(3),companyType:'GC'};
const superintendent={...chief,actorId:id(5),actorRole:'SURVEY_SUPERINTENDENT' as const};const manager={...chief,actorId:id(6),actorRole:'SURVEY_MANAGER' as const};
const none={canInitiate:false,canApprove:false,immediate:false,pending:false};
test('survey cancellation capabilities enforce initiator and approver chain',async()=>{
  for(const a of [chief,superintendent])assert.deepEqual(await getSurveyCancelActions(repo,db,ticket,a),{...none,canInitiate:true});
  assert.deepEqual(await getSurveyCancelActions(repo,db,ticket,manager),{...none,canInitiate:true,immediate:true});
  const pending={...ticket,cancelInitiatedAt:new Date(),cancelInitiatedBy:chief.actorId,cancelInitiatorRole:'PARTY_CHIEF',cancelReason:'Scope change'};
  assert.equal((await getSurveyCancelActions(repo,db,pending,chief)).canApprove,false);
  for(const a of [superintendent,manager])assert.equal((await getSurveyCancelActions(repo,db,pending,a)).canApprove,true);
  const elevated={...pending,cancelInitiatedBy:superintendent.actorId,cancelInitiatorRole:'SURVEY_SUPERINTENDENT'};
  assert.equal((await getSurveyCancelActions(repo,db,elevated,superintendent)).canApprove,false);
  assert.equal((await getSurveyCancelActions(repo,db,elevated,manager)).canApprove,true);
  assert.equal((await getSurveyCancelActions(repo,db,{...pending,cancelInitiatedBy:manager.actorId},manager)).canApprove,false);
  for(const status of ['DRAFT','COMPLETED','FIELD_CANCELED','REQUESTER_CANCELED','SURVEY_CANCELED'] as const)assert.deepEqual(await getSurveyCancelActions(repo,db,{...pending,status},manager),none);
});
test('survey cancellation capabilities deny wrong actors, isolated companies and archived projects',async()=>{
  for(const a of [{...chief,actorId:id(9)},{...chief,actorRole:'REQUESTER' as const},{...chief,actorRole:'INSTRUMENT_MAN' as const},{...manager,companyType:'SUBCONTRACTOR' as const,companyId:id(9)}])assert.deepEqual(await getSurveyCancelActions(repo,db,ticket,a),none);
  assert.deepEqual(await getSurveyCancelActions({...repo,findActiveProjectCrewBuild:async()=>null},db,ticket,manager),none);
  await assert.rejects(getSurveyCancelActions({...repo,findActiveProjectCrewBuild:async()=>{throw new Error('offline');}},db,ticket,manager),/offline/);
});
