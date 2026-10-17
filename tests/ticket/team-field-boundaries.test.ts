import {test} from 'node:test';
import assert from 'node:assert/strict';
import {approvePcStatus} from '../../src/modules/ticket/application/approve-pc-status';
import {rejectPcStatus} from '../../src/modules/ticket/application/reject-pc-status';
import {requestSurveyCancel} from '../../src/modules/ticket/application/request-survey-cancel';
import {requestFieldCancel} from '../../src/modules/ticket/application/request-field-cancel';
import {restartDelayedTicket} from '../../src/modules/ticket/application/restart-delayed-ticket';
import type {ITicketRepository} from '../../src/modules/ticket/application/ports';
import type {Ticket} from '../../src/modules/ticket/domain/types';
import type {DbClient,UUID} from '../../src/shared/types';

test('Team request visibility does not give a Chief another crew’s field controls',async()=>{
  const db:DbClient={query:async()=>{throw new Error('Must not write audit or notifications');}};
  const params={tenantId:'tenant' as UUID,ticketId:'ticket' as UUID,actorId:'chief' as UUID,actorRole:'PARTY_CHIEF' as const,reason:'Test'};
  for(const assignedPartyChiefId of [null,'other-chief']){
    const ticket={assignedPartyChiefId,status:'PENDING_PC_APPROVAL',pendingPcOutcome:'COMPLETED'} as Ticket;
    const repo={findByIdInternal:async()=>ticket,patchTicket:async()=>{throw new Error('Must not patch another crew’s request');}} as unknown as ITicketRepository;
    for(const invoke of [()=>approvePcStatus(repo,db,params),()=>rejectPcStatus(repo,db,params),()=>requestSurveyCancel(repo,db,params),()=>requestFieldCancel(repo,db,params),()=>restartDelayedTicket(repo,db,params)]){
      await assert.rejects(invoke(),{name:'ForbiddenError'});
    }
  }
});
