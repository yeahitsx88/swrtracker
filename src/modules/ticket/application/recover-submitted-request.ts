import type {AuthContext} from '@/lib/auth';
import type {DbClient,UUID} from '@/shared/types';
import {ConflictError,NotFoundError,ValidationError} from '@/shared/errors';
import {executeSubmittedRecoveryTransition} from '@/modules/workflow/application/kernel';
import {assertSubmittedRecoveryTransition} from '@/modules/workflow/domain/submitted-recovery';
import type {SubmittedRecoveryInput} from '@/lib/contracts/submitted-recovery';
import type {ITicketRepository,TicketStatusPatch} from './ports';
import type {Ticket} from '../domain/types';
import {authorizeRecoveryActor,recoveryAuthorityEvidence,recoveryVisibility} from './submitted-recovery-access';
import {enqueueRequesterNotification} from './amelia-notifications';
import {resolveRejectionProposal} from './rejection-proposal';

/** Current scoped authority/resource locks precede the caller's ledger lookup. */
export async function authorizeSubmittedRecovery(db:DbClient,repo:ITicketRepository,auth:AuthContext,projectId:UUID,ticketId:UUID):Promise<{ticket:Ticket;authority:Record<string,unknown>}>{
 const actor=await authorizeRecoveryActor(db,auth,projectId,true);
 const row=(await db.query(`SELECT t.id FROM tickets t WHERE t.tenant_id=$1 AND t.project_id=$2 AND t.id=$4 AND t.draft_deleted_at IS NULL AND (${recoveryVisibility(actor)}) FOR UPDATE OF t`,[auth.tenantId,projectId,auth.userId,ticketId])).rows[0];
 if(!row)throw new NotFoundError('Request not found in your current recovery scope.');
 const ticket=await repo.findByIdInternal(db,auth.tenantId,ticketId);
 if(!ticket||ticket.projectId!==projectId)throw new NotFoundError('Request not found');
 return {ticket,authority:await recoveryAuthorityEvidence(db,auth,projectId,actor,ticket)};
}

export async function recoverSubmittedRequest(db:DbClient,repo:ITicketRepository,auth:AuthContext,context:{ticket:Ticket;authority:Record<string,unknown>},input:SubmittedRecoveryInput):Promise<{recovered:true;ticketId:UUID;status:'RETURNED_FOR_CORRECTION';rowVersion:number}>{
 const {ticket,authority}=context,reason=input.reason.trim();
 if(input.confirmed!==true||reason.length<10||reason.length>1000)throw new ValidationError('Explicit confirmation and a recovery reason of 10–1000 characters are required.');
 if(ticket.rowVersion!==input.expectedVersion||ticket.status!==input.expectedStatus)throw new ConflictError('The reviewed request changed. Reload recovery requests and confirm a fresh review.','WORKFLOW_STALE_STATE');
 assertSubmittedRecoveryTransition(ticket,'RETURNED_FOR_CORRECTION');
 const owner=(await db.query(`SELECT u.id FROM users u JOIN companies c ON c.id=u.company_id AND c.tenant_id=u.tenant_id JOIN project_memberships pm ON pm.user_id=u.id AND pm.project_id=$2 WHERE u.tenant_id=$1 AND u.id=$3 AND u.deactivated_at IS NULL AND pm.access_disabled_at IS NULL AND pm.role='REQUESTER' FOR SHARE OF u,c,pm`,[auth.tenantId,ticket.projectId,ticket.requesterId])).rows[0];
 if(!owner)throw new ConflictError('Restore the original requester’s eligible project access before recovery.');
 const cycleNumber=(ticket.returnCycle??0)+1;
 const patch:Omit<TicketStatusPatch,'status'>={returnCycle:cycleNumber,assignedPartyChiefId:null,assignedInstrumentManId:null,surveyLeadId:null,assignedAt:null,approvedAt:null,startedAt:null,pendingPcOutcome:null,pendingPcReason:null,fieldValidationReviewerId:null,surveyCancelRequestedBy:null,surveyCancelRequestedRole:null,surveyCancelReason:null,surveyCancelRequestedAt:null,completedAt:null,closedAt:null,rejectionReason:null};
 const evidence={cycleNumber,origin:'SUBMITTED_RECOVERY',reason,confirmed:true,sourceStatus:ticket.status,sourceVersion:ticket.rowVersion,requesterId:ticket.requesterId,authority,previousStaffing:{chiefId:ticket.assignedPartyChiefId,instrumentManId:ticket.assignedInstrumentManId,surveyLeadId:ticket.surveyLeadId},sameRecord:true,freshReviewRequired:true};
 await executeSubmittedRecoveryTransition(db,{tenantId:auth.tenantId,ticketId:ticket.id,actorId:auth.userId,patch,eventPayload:evidence,readTicket:async()=>ticket,patchTicket:(next,expected)=>repo.patchTicket(db,auth.tenantId,ticket.id,next as TicketStatusPatch,{expectedStatus:expected.status,expectedRowVersion:expected.rowVersion}),buildResult:current=>({...current,...patch,status:'RETURNED_FOR_CORRECTION',rowVersion:(current.rowVersion??0)+1})});
 await db.query("INSERT INTO ticket_return_cycles(tenant_id,ticket_id,cycle_number,origin,reason,returned_by) VALUES($1,$2,$3,'SUBMITTED_RECOVERY',$4,$5)",[auth.tenantId,ticket.id,cycleNumber,reason,auth.userId]);
 await db.query("UPDATE ticket_assignment_history SET ended_at=now(),end_reason='SUBMITTED_RECOVERY' WHERE tenant_id=$1 AND ticket_id=$2 AND ended_at IS NULL",[auth.tenantId,ticket.id]);
 await db.query("UPDATE survey_work_delegations SET ended_at=now(),end_reason='SUBMITTED_RECOVERY' WHERE tenant_id=$1 AND ticket_id=$2 AND ended_at IS NULL",[auth.tenantId,ticket.id]);
 await resolveRejectionProposal(db,{tenantId:auth.tenantId,ticketId:ticket.id,actorId:auth.userId},'SUPERSEDED');
 await enqueueRequesterNotification(db,{tenantId:auth.tenantId,ticketId:ticket.id,requesterId:ticket.requesterId,eventType:'RETURNED_FOR_CORRECTION',payload:evidence,idempotencyKey:`${ticket.id}:return:${cycleNumber}`});
 return {recovered:true,ticketId:ticket.id,status:'RETURNED_FOR_CORRECTION',rowVersion:(ticket.rowVersion??0)+1};
}
