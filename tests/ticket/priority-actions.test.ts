import assert from 'node:assert/strict';import test from 'node:test';
import {getPriorityActions} from '@/modules/ticket/application/priority-actions';import type {ITicketRepository,VisibilityScope} from '@/modules/ticket/application/ports';import type {Ticket} from '@/modules/ticket/domain/types';import type {DbClient,UUID} from '@/shared/types';
const id='00000000-0000-0000-0000-000000000001' as UUID;const db:DbClient={async query(){throw new Error('No SQL');}};
const repo={findActiveProjectCrewBuild:async()=> 'MEDIUM'} as unknown as ITicketRepository;
const ticket={tenantId:id,projectId:id,companyId:id,status:'SUBMITTED',priority:'NORMAL'} as Ticket;
const actor:VisibilityScope={actorId:id,actorRole:'SURVEY_MANAGER',companyId:id,companyType:'GC'};
test('priority capabilities expose only valid lower targets and authorized active-project controls',async()=>{
  const levels=['NORMAL','MEDIUM','MED_HIGH','HIGH'] as const;
  for(const [index,priority] of levels.entries()) assert.deepEqual(await getPriorityActions(repo,db,{...ticket,priority},actor),{canElevate:priority!=='HIGH',lowerChoices:levels.slice(0,index)});
  for(const status of ['DRAFT','COMPLETED','FIELD_CANCELED','SURVEY_CANCELED','REQUESTER_CANCELED'] as const)assert.deepEqual(await getPriorityActions(repo,db,{...ticket,status},actor),{canElevate:false,lowerChoices:[]});
  assert.deepEqual(await getPriorityActions(repo,db,{...ticket,status:'REJECTED',priority:'MEDIUM'},actor),{canElevate:true,lowerChoices:[]});
  for(const actorRole of ['REQUESTER','PARTY_CHIEF','SURVEY_SUPERINTENDENT','TENANT_ADMIN'] as const) assert.deepEqual(await getPriorityActions(repo,db,ticket,{...actor,actorRole}),{canElevate:false,lowerChoices:[]});
  assert.deepEqual(await getPriorityActions(repo,db,ticket,{...actor,companyType:'SUBCONTRACTOR',companyId:'00000000-0000-0000-0000-000000000002' as UUID}),{canElevate:false,lowerChoices:[]});
  assert.deepEqual(await getPriorityActions({...repo,findActiveProjectCrewBuild:async()=>null},db,ticket,actor),{canElevate:false,lowerChoices:[]});
  await assert.rejects(getPriorityActions({...repo,findActiveProjectCrewBuild:async()=>{throw new Error('offline');}},db,ticket,actor),/offline/);
});
