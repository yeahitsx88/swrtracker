import assert from 'node:assert/strict';
import test from 'node:test';
import { getAssignmentCapability } from '@/modules/ticket/application/assignment-options';
import type { ITicketRepository, VisibilityScope } from '@/modules/ticket/application/ports';
import type { Ticket } from '@/modules/ticket/domain/types';
import type { DbClient, UUID } from '@/shared/types';
const id='00000000-0000-0000-0000-000000000001' as UUID;
const db:DbClient={async query(){throw new Error('No SQL');}};
const ticket={tenantId:id,projectId:id,aorNodeId:id,status:'APPROVED',workflowVariant:'STANDARD_APPROVAL'} as Ticket;
const actor={actorId:id,actorRole:'SURVEY_MANAGER',companyId:id,companyType:'GC'} as VisibilityScope;
const repo={findActiveProjectCrewBuild:async()=> 'FULL',isAorNodeInSurveyRoleScope:async()=>true} as unknown as ITicketRepository;
test('assignment capability hides expected denials and propagates infrastructure failures',async()=>{
  for(const build of ['FULL','MEDIUM','SLIM'] as const) assert.deepEqual(await getAssignmentCapability({...repo,findActiveProjectCrewBuild:async()=>build},db,ticket,actor),{crewBuild:build});
  assert.equal(await getAssignmentCapability(repo,db,ticket,{...actor,actorRole:'REQUESTER'}),null);
  assert.equal(await getAssignmentCapability(repo,db,{...ticket,status:'ASSIGNED'},actor),null);
  assert.equal(await getAssignmentCapability({...repo,findActiveProjectCrewBuild:async()=>null},db,ticket,actor),null);
  assert.equal(await getAssignmentCapability({...repo,isAorNodeInSurveyRoleScope:async()=>false},db,ticket,{...actor,actorRole:'SURVEY_SUPERINTENDENT'}),null);
  await assert.rejects(getAssignmentCapability({...repo,findActiveProjectCrewBuild:async()=>{throw new Error('offline');}},db,ticket,actor),/offline/);
});
