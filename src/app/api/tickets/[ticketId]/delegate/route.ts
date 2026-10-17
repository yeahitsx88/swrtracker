import {NextResponse,type NextRequest} from 'next/server';
import {observeProjectRoute} from '@/lib/observe-project-route';
import {getTicketRouteContext,withTicketMutation} from '@/lib/ticket-route-helpers';
import {errorResponse} from '@/lib/api-error';
import {requireIdempotencyKey} from '@/lib/idempotency';
import {executeAuthorizedTicketMutation} from '@/lib/ticket-mutation-idempotency';
import {requireResourceUuid} from '@/lib/resource-uuid';
import {delegateWork,delegationTeams} from '@/modules/ticket/application/delegate-work';
import {TicketRepository} from '@/modules/ticket/infrastructure/ticket.repository';
import {pool} from '@/lib/db';
import {ValidationError} from '@/shared/errors';
import type {UUID} from '@/shared/types';
export const dynamic='force-dynamic';
async function get(req:NextRequest,{params}:{params:Promise<{ticketId:string}>}){
 try{const {ticketId}=await params,ctx=await getTicketRouteContext(req,ticketId);
  const current=await pool.query(`SELECT d.team_id AS "teamId",st.name AS "teamName",u.name AS "leadName"
    FROM survey_work_delegations d JOIN survey_teams st ON st.tenant_id=d.tenant_id AND st.project_id=d.project_id AND st.id=d.team_id
    JOIN users u ON u.tenant_id=st.tenant_id AND u.id=st.lead_user_id
    WHERE d.tenant_id=$1 AND d.ticket_id=$2 AND d.ended_at IS NULL`,[ctx.tenantId,ctx.ticketId]);
  return NextResponse.json({current:current.rows[0]??null,teams:ctx.actorRole==='SURVEY_MANAGER'?await delegationTeams(pool,ctx.tenantId,ctx.ticketId):[]});
 }catch(error){return errorResponse(error);}
}
async function post(req:NextRequest,{params}:{params:Promise<{ticketId:string}>}){
 try{const {ticketId}=await params,ctx=await getTicketRouteContext(req,ticketId),key=requireIdempotencyKey(req);
  const body:unknown=await req.json();if(!body||typeof body!=='object'||typeof (body as {teamId?:unknown}).teamId!=='string')throw new ValidationError('Choose a team.');
  const teamId=(body as {teamId:string}).teamId;requireResourceUuid(teamId,'teamId');
  const result=await withTicketMutation(req,ctx,(db,current)=>executeAuthorizedTicketMutation(db,
   {tenantId:current.tenantId,actorId:current.actorId,endpoint:`POST:/api/tickets/${ticketId}/delegate`,idempotencyKey:key},
   {ticketId,teamId},async()=>({status:200,body:await delegateWork(new TicketRepository(),db,current,teamId as UUID)})));
  return NextResponse.json(result.body,{status:result.status});
 }catch(error){return errorResponse(error);}
}
export const GET=observeProjectRoute(get);
export const POST=observeProjectRoute(post);
