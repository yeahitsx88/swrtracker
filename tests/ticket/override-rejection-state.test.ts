import assert from 'node:assert/strict';
import test from 'node:test';
import { ConflictError } from '@/shared/errors';
import { overrideRejection } from '@/modules/ticket/application/override-rejection';
import type { ITicketRepository } from '@/modules/ticket/application/ports';
import type { Ticket } from '@/modules/ticket/domain/types';
import type { DbClient, UUID } from '@/shared/types';

test('rejection override refuses submitted and all other non-rejected states before writes', async () => {
  const id='00000000-0000-0000-0000-000000000001' as UUID;
  let writes=0;
  const db:DbClient={async query(){writes++;return {rows:[]};}};
  for(const status of ['DRAFT','SUBMITTED','APPROVED','CREATED','ASSIGNED','IN_PROGRESS',
    'PENDING_PC_APPROVAL','DELAYED','COMPLETED','FIELD_CANCELED','REQUESTER_CANCELED','SURVEY_CANCELED'] as const) {
    const ticket={id,tenantId:id,projectId:id,status,workflowVariant:'STANDARD_APPROVAL',
      requesterId:'00000000-0000-0000-0000-000000000002',surveyLeadId:null,surveyManagerId:null} as Ticket;
    const repo={findByIdInternal:async()=>ticket,findActiveProjectCrewBuild:async()=> 'FULL',
      patchTicket:async()=>{writes++;}} as unknown as ITicketRepository;
    await assert.rejects(overrideRejection(repo,db,{tenantId:id,ticketId:id,actorId:id,
      actorRole:'SURVEY_MANAGER',reason:'Corrected scope'}),ConflictError,status);
  }
  assert.equal(writes,0,'invalid override must never update a ticket or emit an override event');
});
