import {ConflictError,ForbiddenError,NotFoundError,ValidationError} from '@/shared/errors';
import type {DbClient,UUID} from '@/shared/types';
import type {ProjectRole} from '@/modules/identity/domain/types';
import {requireSurveyReviewAuthority} from '@/lib/survey-review-authority';
import {surveyTeamCoverageQuery} from '@/lib/survey-team-coverage';

interface Actor {tenantId:UUID;ticketId:UUID;actorId:UUID;actorRole:ProjectRole}
export interface RejectionProposal {id:UUID;reason:string;proposedBy:UUID;createdAt:string}

/** Caller holds the authenticated ticket mutation transaction and ticket lock. */
export async function proposeRejection(db:DbClient,actor:Actor,reason:string):Promise<RejectionProposal>{
  if(actor.actorRole!=='PARTY_CHIEF')throw new ForbiddenError('Only a Party Chief proposes a rejection for leadership review.');
  if(!reason.trim()||reason.trim().length>2000)throw new ValidationError('Write a rejection reason of 1 to 2000 characters.');
  const {rows}=await db.query<{project_id:UUID;aor_node_id:UUID|null;status:string;row_version:number}>(
    'SELECT project_id,aor_node_id,status,row_version FROM tickets WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[actor.tenantId,actor.ticketId]);
  const ticket=rows[0];if(!ticket)throw new NotFoundError('Request not found');
  await assertActiveReviewProject(db,actor.tenantId,ticket.project_id);
  const authority=await requireSurveyReviewAuthority(db,{tenantId:actor.tenantId,projectId:ticket.project_id,aorNodeId:ticket.aor_node_id},actor);
  if(ticket.status!=='SUBMITTED')throw new ConflictError('This request is no longer awaiting review. Reload requests.');
  const pending=await readRejectionProposal(db,actor.tenantId,actor.ticketId);
  if(pending)throw new ConflictError('A rejection proposal already awaits leadership review. Reload requests.');
  const inserted=await db.query<RejectionProposal>(`INSERT INTO survey_rejection_proposals
    (tenant_id,project_id,ticket_id,proposed_by,reason,ticket_version) VALUES($1,$2,$3,$4,$5,$6)
    RETURNING id,reason,proposed_by AS "proposedBy",created_at AS "createdAt"`,
    [actor.tenantId,ticket.project_id,actor.ticketId,actor.actorId,reason.trim(),ticket.row_version]);
  const proposal=inserted.rows[0]!;
  await db.query(`INSERT INTO ticket_events(tenant_id,ticket_id,actor_id,event_type,payload)
    VALUES($1,$2,$3,'ticket.rejection_proposed',$4)`,[actor.tenantId,actor.ticketId,actor.actorId,JSON.stringify({proposalId:proposal.id,reason:proposal.reason,reviewAuthority:authority})]);
  await db.query(`INSERT INTO survey_notifications(tenant_id,project_id,ticket_id,recipient_id,actor_id,event_key,title,message)
    SELECT t.tenant_id,t.project_id,t.id,recipient.id,$3,$4,'Review a proposed rejection',
      COALESCE(t.ticket_number,'Survey request') || ': a Party Chief has proposed rejection. Open Review Requests to decide.'
    FROM tickets t JOIN project_memberships pm ON pm.project_id=t.project_id
    JOIN users recipient ON recipient.id=pm.user_id AND recipient.tenant_id=t.tenant_id
    JOIN companies c ON c.id=recipient.company_id AND c.tenant_id=recipient.tenant_id
    WHERE t.tenant_id=$1 AND t.id=$2 AND pm.access_disabled_at IS NULL AND recipient.deactivated_at IS NULL
      AND c.type<>'SUBCONTRACTOR' AND (pm.role='SURVEY_MANAGER' OR
      (pm.role='SURVEY_SUPERINTENDENT' AND EXISTS(${surveyTeamCoverageQuery('recipient.id','SURVEY_SUPERINTENDENT')})))
    ON CONFLICT(tenant_id,recipient_id,event_key) DO NOTHING`,[actor.tenantId,actor.ticketId,actor.actorId,`rejection-proposal:${proposal.id}`]);
  return proposal;
}

/** Lifecycle barrier precedes this check; a closed project cannot review or replay decisions. */
export async function assertActiveReviewProject(db:DbClient,tenantId:UUID,projectId:UUID):Promise<void>{
  const {rows}=await db.query<{status:string}>('SELECT status FROM projects WHERE tenant_id=$1 AND id=$2 FOR SHARE',[tenantId,projectId]);
  if(rows[0]?.status!=='ACTIVE')throw new ConflictError('This project is not active. Request review is unavailable.');
}

/** Route must first verify current ticket visibility. */
export async function readRejectionProposal(db:DbClient,tenantId:UUID,ticketId:UUID):Promise<RejectionProposal|null>{
  const {rows}=await db.query<RejectionProposal>(`SELECT id,reason,proposed_by AS "proposedBy",created_at AS "createdAt"
    FROM survey_rejection_proposals WHERE tenant_id=$1 AND ticket_id=$2 AND resolved_at IS NULL`,[tenantId,ticketId]);
  return rows[0]??null;
}

export interface ReviewDecisionRead {proposal:RejectionProposal|null;decision:{available:boolean;reason:string|null}}

/** Read-only advice after current ticket visibility; mutations independently recheck authority. */
export async function readReviewDecision(db:DbClient,actor:Actor):Promise<ReviewDecisionRead>{
  const {rows}=await db.query<{project_id:UUID;aor_node_id:UUID|null;status:string;project_status:string}>(
    `SELECT t.project_id,t.aor_node_id,t.status,p.status AS project_status FROM tickets t
      JOIN projects p ON p.id=t.project_id AND p.tenant_id=t.tenant_id
      WHERE t.tenant_id=$1 AND t.id=$2`,[actor.tenantId,actor.ticketId]);
  const ticket=rows[0];if(!ticket)throw new NotFoundError('Request not found');
  const proposal=await readRejectionProposal(db,actor.tenantId,actor.ticketId);
  const unavailable=(reason:string):ReviewDecisionRead=>({proposal,decision:{available:false,reason}});
  if(ticket.project_status!=='ACTIVE')return unavailable('This project is read-only for request review.');
  if(ticket.status!=='SUBMITTED')return unavailable('This request is no longer awaiting review. Close this dialog and refresh requests.');
  try{await requireSurveyReviewAuthority(db,{tenantId:actor.tenantId,projectId:ticket.project_id,aorNodeId:ticket.aor_node_id},actor);}
  catch(error){if(error instanceof ForbiddenError)return unavailable('You can view this request, but your current review authority does not cover its Area.');throw error;}
  if(actor.actorRole==='PARTY_CHIEF'&&proposal)return unavailable('A Superintendent or Survey Manager must decide the pending rejection proposal.');
  return {proposal,decision:{available:true,reason:null}};
}

/** Only leadership may override a pending Chief proposal by approving the request. */
export async function assertProposalDecision(db:DbClient,actor:Actor):Promise<void>{
  if(actor.actorRole==='PARTY_CHIEF'&&await readRejectionProposal(db,actor.tenantId,actor.ticketId))
    throw new ConflictError('A rejection proposal awaits a Superintendent or Survey Manager decision.');
}

/** Called after a successful leadership transition, in the same transaction. */
export async function resolveRejectionProposal(db:DbClient,actor:Omit<Actor,'actorRole'> & {actorRole?:ProjectRole},outcome:'CONFIRMED'|'DECLINED'|'SUPERSEDED'):Promise<void>{
  const {rows}=await db.query<{id:UUID;proposedBy:UUID}>(`UPDATE survey_rejection_proposals SET resolved_at=now(),resolved_by=$3,outcome=$4
    WHERE tenant_id=$1 AND ticket_id=$2 AND resolved_at IS NULL RETURNING id,proposed_by AS "proposedBy"`,[actor.tenantId,actor.ticketId,actor.actorId,outcome]);
  for(const proposal of rows){await db.query(`INSERT INTO ticket_events(tenant_id,ticket_id,actor_id,event_type,payload)
    VALUES($1,$2,$3,'ticket.rejection_proposal_resolved',$4)`,[actor.tenantId,actor.ticketId,actor.actorId,JSON.stringify({proposalId:proposal.id,outcome})]);
    const message=outcome==='CONFIRMED'?'Your rejection proposal was accepted. The request has been rejected.':
      outcome==='DECLINED'?'Your rejection proposal was declined. The request has been approved.':
      'The request changed before a decision was made. Your rejection proposal no longer needs a decision.';
    await db.query(`INSERT INTO survey_notifications(tenant_id,project_id,ticket_id,recipient_id,actor_id,event_key,title,message)
      SELECT t.tenant_id,t.project_id,t.id,u.id,$3,$4,'Rejection proposal update',COALESCE(t.ticket_number,'Survey request') || ': ' || $5
      FROM tickets t JOIN project_memberships pm ON pm.project_id=t.project_id AND pm.user_id=$6
      JOIN users u ON u.id=pm.user_id AND u.tenant_id=t.tenant_id
      JOIN companies c ON c.id=u.company_id AND c.tenant_id=u.tenant_id
      WHERE t.tenant_id=$1 AND t.id=$2 AND pm.role='PARTY_CHIEF' AND pm.access_disabled_at IS NULL
        AND u.deactivated_at IS NULL AND c.type<>'SUBCONTRACTOR'
      ON CONFLICT(tenant_id,recipient_id,event_key) DO NOTHING`,
      [actor.tenantId,actor.ticketId,actor.actorId,`rejection-outcome:${proposal.id}`,message,proposal.proposedBy]);
  }
}
