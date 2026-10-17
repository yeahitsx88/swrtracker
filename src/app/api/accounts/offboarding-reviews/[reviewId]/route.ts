import {NextResponse,type NextRequest} from 'next/server';
import {requireActiveAuth} from '@/lib/auth';
import {withTransaction} from '@/lib/with-transaction';
import {requireIdempotencyKey,executeIdempotentHttpMutation} from '@/lib/idempotency';
import {requireResourceUuid} from '@/lib/resource-uuid';
import {errorResponse} from '@/lib/api-error';
import {ValidationError} from '@/shared/errors';
import {authorizeOffboardingReview,readOffboardingReview,resolveOffboardingReview} from '@/modules/identity/application/account-offboarding-review';
import type {ReviewResolution} from '@/lib/contracts/account-offboarding';
import type {UUID} from '@/shared/types';
export const dynamic='force-dynamic';
type Context={params:Promise<{reviewId:string}>};
export async function GET(req:NextRequest,ctx:Context){try{
  const auth=await requireActiveAuth(req),{reviewId}=await ctx.params;requireResourceUuid(reviewId,'reviewId');
  const result=await withTransaction(db=>readOffboardingReview(db,auth,reviewId as UUID),{req,auth,mode:'SHARED',authorize:authorizeOffboardingReview});
  return NextResponse.json(result);
}catch(error){return errorResponse(error);}}
export async function POST(req:NextRequest,ctx:Context){try{
  const auth=await requireActiveAuth(req),{reviewId}=await ctx.params;requireResourceUuid(reviewId,'reviewId');
  const body=await req.json() as Record<string,unknown>,key=requireIdempotencyKey(req);
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(field=>!['reviewId','disposition','reason','tenantEventId','snapshot','confirmed'].includes(field))||
    body.reviewId!==reviewId||body.confirmed!==true||typeof body.reason!=='string'||typeof body.snapshot!=='string'||!/^[a-f0-9]{64}$/.test(body.snapshot)||
    !['NO_FURTHER_ACTION','TENANT_ACCOUNT_DISABLED'].includes(String(body.disposition))||!(body.tenantEventId===null||typeof body.tenantEventId==='string'))throw new ValidationError('Explicit current review confirmation is required');
  if(typeof body.tenantEventId==='string')requireResourceUuid(body.tenantEventId,'tenantEventId');
  const command:ReviewResolution={reviewId:reviewId as UUID,disposition:body.disposition as ReviewResolution['disposition'],reason:body.reason.trim(),
    tenantEventId:body.tenantEventId as UUID|null,snapshot:body.snapshot,idempotencyKey:key};
  if(command.reason.length<10||command.reason.length>1000)throw new ValidationError('A reason of 10–1000 characters is required');
  const result=await withTransaction(db=>executeIdempotentHttpMutation(db,{tenantId:auth.tenantId,actorId:auth.userId,
    endpoint:`POST /api/accounts/offboarding-reviews/${reviewId}`,idempotencyKey:key},body,async()=>{await resolveOffboardingReview(db,auth,command);return{status:200,body:{resolved:true}};}),
    {req,auth,mode:'EXCLUSIVE',authorize:authorizeOffboardingReview});
  return NextResponse.json(result.body,{status:result.status});
}catch(error){return errorResponse(error);}}
