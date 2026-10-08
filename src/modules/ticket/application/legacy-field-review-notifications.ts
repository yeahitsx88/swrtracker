import type {DbClient,UUID} from '@/shared/types';
import type {ProjectRole} from '@/modules/identity/domain/types';
import type {Ticket} from '../domain/types';
import {enqueueRequesterNotification} from './amelia-notifications';

/** Existing retained review consequences; caller owns state/audit/notices/ledger transaction. */
export async function notifyLegacyFieldReview(db:DbClient,params:{ticket:Ticket;actorId:UUID;actorRole:ProjectRole;finalStatus:'COMPLETED'|'DELAYED'|'FIELD_CANCELED'|'IN_PROGRESS';reason:string|null}):Promise<void>{
 const {ticket,actorId,actorRole,finalStatus,reason}=params;
 const key=`${ticket.id}:legacy-review:${ticket.rowVersion??0}`;
 const payload={finalStatus,requestedStatus:ticket.pendingPcOutcome,reason,actorRole};
 if(finalStatus!=='IN_PROGRESS')await enqueueRequesterNotification(db,{tenantId:ticket.tenantId,ticketId:ticket.id,requesterId:ticket.requesterId,eventType:finalStatus,payload,idempotencyKey:key+':requester'});
 if(finalStatus==='IN_PROGRESS'&&ticket.assignedInstrumentManId)await fieldNotice(ticket.assignedInstrumentManId,'INSTRUMENT_MAN','ticket.pc_approval_rejected','Field report rejected','Your retained field report was rejected; work resumes in progress.',key+':instrument-man');
 if(actorRole!=='PARTY_CHIEF'&&ticket.assignedPartyChiefId)await fieldNotice(ticket.assignedPartyChiefId,'PARTY_CHIEF','ticket.pc_approval_overridden','Field report reviewed by leadership',finalStatus==='IN_PROGRESS'?'Survey leadership rejected the retained report and resumed work.':'Survey leadership confirmed the retained field report outcome.',key+':party-chief');
 async function fieldNotice(recipientId:UUID,role:'PARTY_CHIEF'|'INSTRUMENT_MAN',eventType:string,title:string,message:string,noticeKey:string){
  await db.query(`WITH recipient AS (
   SELECT u.id FROM users u JOIN companies c ON c.id=u.company_id AND c.tenant_id=u.tenant_id
   JOIN project_memberships pm ON pm.user_id=u.id AND pm.project_id=$2
   WHERE u.tenant_id=$1 AND u.id=$4 AND u.deactivated_at IS NULL AND pm.access_disabled_at IS NULL
    AND pm.role=$5 AND c.type<>'SUBCONTRACTOR'
  ), notices AS (
   INSERT INTO survey_notifications(tenant_id,project_id,ticket_id,recipient_id,actor_id,event_key,title,message)
   SELECT $1,t.project_id,t.id,r.id,$6,$7,$8,COALESCE(t.ticket_number,'Survey request') || ' · ' || $9 FROM tickets t CROSS JOIN recipient r
   WHERE t.tenant_id=$1 AND t.project_id=$2 AND t.id=$3
   ON CONFLICT(tenant_id,recipient_id,event_key) DO NOTHING RETURNING recipient_id
  ) INSERT INTO notification_outbox(tenant_id,ticket_id,recipient_user_id,event_type,payload,idempotency_key)
   SELECT $1,$3,n.recipient_id,$10,$11,$7 FROM notices n
   ON CONFLICT(tenant_id,idempotency_key) DO NOTHING`,[ticket.tenantId,ticket.projectId,ticket.id,recipientId,role,actorId,noticeKey,title,message,eventType,JSON.stringify(payload)]);
 }
}
