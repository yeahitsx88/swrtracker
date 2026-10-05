import {NextResponse,type NextRequest} from 'next/server';
import {observeProjectRoute} from '@/lib/observe-project-route';
import {errorResponse} from '@/lib/api-error';
import {getTicketRouteContext,withTicketMutation} from '@/lib/ticket-route-helpers';
import {requireIdempotencyKey} from '@/lib/idempotency';
import {executeAuthorizedTicketMutation} from '@/lib/ticket-mutation-idempotency';
import {proposeRejection,readRejectionProposal} from '@/modules/ticket/application/rejection-proposal';
import {ValidationError} from '@/shared/errors';
import {pool} from '@/lib/db';
export const dynamic='force-dynamic';
async function get(req:NextRequest,{params}:{params:Promise<{ticketId:string}>}){
  try{const {ticketId}=await params;const ctx=await getTicketRouteContext(req,ticketId);
    return NextResponse.json({proposal:await readRejectionProposal(pool,ctx.tenantId,ctx.ticketId)});
  }catch(error){return errorResponse(error);}
}
async function post(req:NextRequest,{params}:{params:Promise<{ticketId:string}>}){
  try{const {ticketId}=await params;const ctx=await getTicketRouteContext(req,ticketId),key=requireIdempotencyKey(req);
    const body:unknown=await req.json();
    if(!body||typeof body!=='object'||typeof (body as {reason?:unknown}).reason!=='string')throw new ValidationError('Write a reason for the proposed rejection.');
    const reason=(body as {reason:string}).reason;
    const result=await withTicketMutation(req,ctx,(db,current)=>executeAuthorizedTicketMutation(db,
      {tenantId:current.tenantId,actorId:current.actorId,endpoint:`POST:/api/tickets/${ticketId}/rejection-proposal`,idempotencyKey:key},
      {ticketId,reason},async()=>({status:201,body:{proposal:await proposeRejection(db,current,reason)}})));
    return NextResponse.json(result.body,{status:result.status});
  }catch(error){return errorResponse(error);}
}
export const GET=observeProjectRoute(get);
export const POST=observeProjectRoute(post);
