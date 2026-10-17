import {ForbiddenError, NotFoundError} from '@/shared/errors';
import type {DbClient, UUID} from '@/shared/types';
import type {ProjectRole} from '@/modules/identity/domain/types';
import {getProjectRole} from './get-project-role';
import {resolveVisibility} from './resolve-visibility';
import {buildVisibilityClause} from './ticket-visibility-clause';
import {requireSurveyReviewAuthority} from './survey-review-authority';
import {assertActiveReviewProject} from '@/modules/ticket/application/rejection-proposal';
import {assertAssignmentScope} from '@/modules/ticket/application/assignment-scope';
import {executeIdempotentHttpMutation, type IdempotencyScope, type IdempotentHttpResult} from './idempotency';

interface AuthorityTicket {
 project_id: UUID; aor_node_id: UUID | null; requester_id: UUID;
 assigned_party_chief_id: UUID | null; assigned_instrument_man_id: UUID | null;
 field_validation_reviewer_id: UUID | null;
}

/** The caller holds the lifecycle barrier and has freshly checked session and visibility.
 * Lock assignments before checking current action authority, including cached responses.
 * Historical workflow status and candidate assignees belong to the mutation callback.
 */
export async function executeAuthorizedTicketMutation<T>(
 db: DbClient, scope: IdempotencyScope, payload: unknown,
 mutation: () => Promise<{status: number; body: T}>,
): Promise<IdempotentHttpResult<T>> {
 const match=/^POST:\/api\/tickets\/([a-f0-9-]{36})\/(.+)$/i.exec(scope.endpoint);
 if(!match)throw new Error('Unsupported ticket mutation endpoint');
 const ticketId=match[1] as UUID,action=match[2];
 const {rows}=await db.query<AuthorityTicket>(
  `SELECT project_id,aor_node_id,requester_id,assigned_party_chief_id,
          assigned_instrument_man_id,field_validation_reviewer_id
   FROM tickets WHERE tenant_id=$1 AND id=$2 FOR UPDATE`,[scope.tenantId,ticketId]);
 const ticket=rows[0];if(!ticket)throw new NotFoundError('Ticket not found');
 const role=await getProjectRole(db,scope.tenantId,ticket.project_id,scope.actorId);
 const visibility=await resolveVisibility(db,scope.tenantId,ticket.project_id,scope.actorId,role);
 const clause=buildVisibilityClause(visibility,4);
 const visible=await db.query(
  `SELECT t.id FROM tickets t WHERE t.tenant_id=$1 AND t.project_id=$2 AND t.id=$3 ${clause.sql}`,
  [scope.tenantId,ticket.project_id,ticketId,...clause.params]);
 if(!visible.rows[0])throw new NotFoundError('Ticket not found');
 if(['approve','reject','rejection-proposal','delegate'].includes(action??''))await assertActiveReviewProject(db,scope.tenantId,ticket.project_id);
 const allowed=(roles:readonly ProjectRole[],relationship=true)=>{
  if(!roles.includes(role)||!relationship)throw new ForbiddenError('Current authority for this ticket action is required');
 };
 switch(action){
  case 'delegate':allowed(['SURVEY_MANAGER']);break;
  case 'rejection-proposal':
   allowed(['PARTY_CHIEF']);
   await requireSurveyReviewAuthority(db,{tenantId:scope.tenantId,projectId:ticket.project_id,aorNodeId:ticket.aor_node_id},{actorId:scope.actorId,actorRole:role});break;
  case 'reject':
   allowed(['SURVEY_MANAGER','SURVEY_SUPERINTENDENT']);
   await requireSurveyReviewAuthority(db,{tenantId:scope.tenantId,projectId:ticket.project_id,aorNodeId:ticket.aor_node_id},{actorId:scope.actorId,actorRole:role});break;
  case 'approve': case 'return':
   await requireSurveyReviewAuthority(db,{tenantId:scope.tenantId,projectId:ticket.project_id,aorNodeId:ticket.aor_node_id},{actorId:scope.actorId,actorRole:role});break;
  case 'assign':
   if(role==='PARTY_CHIEF')allowed(['PARTY_CHIEF'],ticket.assigned_party_chief_id===scope.actorId);
   else allowed(['SURVEY_MANAGER','SURVEY_SUPERINTENDENT']);
   await assertAssignmentScope(db,{tenantId:scope.tenantId,projectId:ticket.project_id,aorNodeId:ticket.aor_node_id,id:ticketId},
     {actorId:scope.actorId,actorRole:role},{partyChiefId:ticket.assigned_party_chief_id,instrumentManId:ticket.assigned_instrument_man_id,
       previousChiefId:ticket.assigned_party_chief_id,previousInstrumentId:ticket.assigned_instrument_man_id});break;
  case 'start': case 'complete': case 'delay': case 'field-inability':
   allowed(['INSTRUMENT_MAN'],ticket.assigned_instrument_man_id===scope.actorId);break;
  case 'pc-approve': case 'pc-reject':
   allowed(['PARTY_CHIEF','SURVEY_MANAGER','SURVEY_SUPERINTENDENT'],role!=='PARTY_CHIEF'||ticket.assigned_party_chief_id===scope.actorId);break;
  case 'restart-delay':allowed(['PARTY_CHIEF','SURVEY_MANAGER','SURVEY_SUPERINTENDENT'],role!=='PARTY_CHIEF'||ticket.assigned_party_chief_id===scope.actorId);break;
  case 'priority': case 'need-by':allowed(['SURVEY_MANAGER']);break;
  case 'requester-cancel': case 'follow-up':
   allowed(['REQUESTER'],ticket.requester_id===scope.actorId);break;
  case 'survey-cancel/approve':allowed(['SURVEY_MANAGER']);break;
  case 'survey-cancel':
   allowed(['PARTY_CHIEF','INSTRUMENT_MAN','SURVEY_MANAGER'],(role!=='INSTRUMENT_MAN'||ticket.assigned_instrument_man_id===scope.actorId)&&(role!=='PARTY_CHIEF'||ticket.assigned_party_chief_id===scope.actorId));break;
  case 'field-cancel':
   allowed(['PARTY_CHIEF','INSTRUMENT_MAN','SURVEY_MANAGER','SURVEY_SUPERINTENDENT'],role!=='INSTRUMENT_MAN'||ticket.assigned_instrument_man_id===scope.actorId);break;
  case 'field-inability/validate': case 'field-inability/reject':{
   allowed(['PARTY_CHIEF','SURVEY_MANAGER','SURVEY_SUPERINTENDENT']);
   if(ticket.field_validation_reviewer_id){
    allowed([role],ticket.field_validation_reviewer_id===scope.actorId);
   }else{
    // Success clears the captured duty. Only the exact actor's completed
    // command may use that historical authority; fresh commands must retain
    // the live duty. Read a completion marker, never a response, at this gate.
    // The ledger below still verifies the request hash before returning it.
    const evidence=await db.query<{completed:boolean}>(
     `SELECT (response_status BETWEEN 200 AND 299) AS completed
      FROM api_idempotency WHERE tenant_id=$1 AND actor_id=$2
        AND endpoint=$3 AND idempotency_key=$4`,
     [scope.tenantId,scope.actorId,scope.endpoint,scope.idempotencyKey]);
    allowed([role],evidence.rows[0]?.completed===true);
   }
   break;
  }
  default:throw new Error('Uncategorized ticket mutation action: '+action);
 }
 return executeIdempotentHttpMutation(db,scope,payload,mutation);
}
