import assert from 'node:assert/strict';import test from 'node:test';
import {getFieldActions} from '@/modules/ticket/application/field-actions';
import type {ITicketRepository,VisibilityScope} from '@/modules/ticket/application/ports';
import type {Ticket} from '@/modules/ticket/domain/types';import type {DbClient,UUID} from '@/shared/types';
const id=(n:number)=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}` as UUID;
const ticket={tenantId:id(1),projectId:id(2),companyId:id(3),assignedPartyChiefId:id(4),assignedInstrumentManId:id(5),surveySuperintendentId:id(6),status:'ASSIGNED',pendingFieldStatus:null,draftDeletedAt:null} as Ticket;
const actor:VisibilityScope={actorId:id(4),actorRole:'PARTY_CHIEF',companyId:id(3),companyType:'GC'};
const db:DbClient={async query(){throw new Error('No direct SQL');}};
const repo={findActiveProjectCrewBuild:async()=> 'FULL'} as unknown as ITicketRepository;
const none={canStart:false,canReport:false,canRequestFieldCancel:false,canResolve:false,canRestart:false,canCompleteDirectly:false};
test('field capabilities match assigned crew and approval chain at each workflow stage',async()=>{
  const im={...actor,actorId:id(5),actorRole:'INSTRUMENT_MAN' as const};
  const supt={...actor,actorId:id(6),actorRole:'SURVEY_SUPERINTENDENT' as const};
  const manager={...actor,actorId:id(7),actorRole:'SURVEY_MANAGER' as const};
  for(const variant of ['STANDARD_APPROVAL','DIRECT_ASSIGNMENT'] as const){
    const t={...ticket,workflowVariant:variant};
    for(const a of [actor,im,manager]) assert.deepEqual(await getFieldActions(repo,db,t,a),{...none,canStart:true});
    assert.deepEqual(await getFieldActions(repo,db,t,supt),none);
    assert.deepEqual(await getFieldActions(repo,db,{...t,status:'IN_PROGRESS'},im),{...none,canReport:true,canRequestFieldCancel:true});
    assert.deepEqual(await getFieldActions(repo,db,{...t,status:'IN_PROGRESS'},actor),none);
    assert.deepEqual(await getFieldActions(repo,db,{...t,status:'IN_PROGRESS',assignedInstrumentManId:null},actor),{...none,canCompleteDirectly:true});
    for(const a of [actor,supt,manager]){
      assert.deepEqual(await getFieldActions(repo,db,{...t,status:'PENDING_PC_APPROVAL',pendingFieldStatus:'FIELD_CANCELED'},a),{...none,canResolve:true});
      assert.deepEqual(await getFieldActions(repo,db,{...t,status:'DELAYED'},a),{...none,canRestart:true});
    }
    assert.deepEqual(await getFieldActions(repo,db,{...t,status:'DELAYED'},im),{...none,canRequestFieldCancel:true});
    for(const status of ['COMPLETED','REQUESTER_CANCELED','FIELD_CANCELED','SURVEY_CANCELED','DRAFT','REJECTED'] as const)
      assert.deepEqual(await getFieldActions(repo,db,{...t,status},manager),none);
    assert.deepEqual(await getFieldActions(repo,db,{...t,assignedPartyChiefId:null},im),{...none,canStart:true});
  }
});
test('field capability denies peers, wrong roles, isolated companies and archived projects',async()=>{
  for(const a of [{...actor,actorId:id(9)},{...actor,actorRole:'REQUESTER' as const},{...actor,actorRole:'TENANT_ADMIN' as const},{...actor,companyType:'SUBCONTRACTOR' as const,companyId:id(9)}]) assert.deepEqual(await getFieldActions(repo,db,ticket,a),none);
  assert.deepEqual(await getFieldActions({...repo,findActiveProjectCrewBuild:async()=>null},db,ticket,actor),none);
  await assert.rejects(getFieldActions({...repo,findActiveProjectCrewBuild:async()=>{throw new Error('offline');}},db,ticket,actor),/offline/);
});
