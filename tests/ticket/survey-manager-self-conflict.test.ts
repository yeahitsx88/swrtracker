import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { ForbiddenError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';
import type { Ticket } from '@/modules/ticket/domain/types';
import type { ITicketRepository } from '@/modules/ticket/application/ports';
import { approveTicket } from '@/modules/ticket/application/approve-ticket';
import { rejectTicket } from '@/modules/ticket/application/reject-ticket';
import { overrideRejection } from '@/modules/ticket/application/override-rejection';

const id = () => randomUUID() as UUID;
const tenantId=id(), projectId=id(), ticketId=id(), actorId=id();

const actions = [
  { name:'approve', status:'SUBMITTED',
    run:(repo:ITicketRepository,db:DbClient) => approveTicket(repo,db,
      {tenantId,ticketId,actorId,actorRole:'SURVEY_MANAGER'}) },
  { name:'reject', status:'SUBMITTED',
    run:(repo:ITicketRepository,db:DbClient) => rejectTicket(repo,db,
      {tenantId,ticketId,actorId,actorRole:'SURVEY_MANAGER',
        rejectionReason:'Incomplete plan'}) },
  { name:'override', status:'REJECTED',
    run:(repo:ITicketRepository,db:DbClient) => overrideRejection(repo,db,
      {tenantId,ticketId,actorId,actorRole:'SURVEY_MANAGER',
        reason:'Review corrected'}) },
] as const;

for (const action of actions) {
  test(`${action.name} blocks recorded Survey Manager and requester self-conflicts`, async () => {
    for (const field of ['surveyManagerId','requesterId','surveyLeadId'] as const) {
      let mutated=false;
      const ticket={id:ticketId,tenantId,projectId,status:action.status,
        requesterId:id(),surveyLeadId:null,surveyManagerId:null,
        [field]:actorId} as unknown as Ticket;
      const repo={
        findByIdInternal:async()=>ticket,
        findActiveProjectCrewBuild:async()=> 'MEDIUM',
        patchTicket:async()=>{mutated=true;},
      } as unknown as ITicketRepository;
      const db:DbClient={async query(){mutated=true;return {rows:[]};}};
      await assert.rejects(action.run(repo,db),ForbiddenError);
      assert.equal(mutated,false,`${field} conflict must precede all writes`);
    }
  });

  test(`${action.name} permits a different Survey Manager`, async () => {
    const events:string[]=[];
    const ticket={id:ticketId,tenantId,projectId,status:action.status,
      workflowVariant:'STANDARD_APPROVAL',requesterId:id(),
      surveyLeadId:id(),surveyManagerId:id()} as Ticket;
    const repo={
      findByIdInternal:async()=>ticket,
      findActiveProjectCrewBuild:async()=> 'MEDIUM',
      patchTicket:async()=>{events.push('patch');},
    } as unknown as ITicketRepository;
    const db:DbClient={async query(sql:string){
      if(sql.includes('INSERT INTO ticket_events'))events.push('audit');
      return {rows:[]};
    }};
    await action.run(repo,db);
    assert.deepEqual(events,['patch','audit']);
  });
}
