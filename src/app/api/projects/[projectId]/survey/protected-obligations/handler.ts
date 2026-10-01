import {NextResponse,type NextRequest} from 'next/server';
import {requireActiveAuth} from '@/lib/auth';
import {withTransaction} from '@/lib/with-transaction';
import {errorResponse} from '@/lib/api-error';
import {executeIdempotentHttpMutation,requireIdempotencyKey} from '@/lib/idempotency';
import {authorizeReviewerResolution,parseReviewerResolution,resolveSurveyReviewer} from '@/modules/tenancy/application/resolve-survey-reviewer';
import {ValidationError} from '@/shared/errors';
import type {DbClient,UUID} from '@/shared/types';
import type {ProtectedObligationsRepository} from '@/modules/tenancy/application/protected-obligations.types';
import {readProtectedObligations,parseProtectedReadQuery,protectedUuid} from '@/modules/tenancy/application/read-protected-obligations';
import {ProtectedObligationsPgRepository} from '@/modules/tenancy/infrastructure/protected-obligations.repository';
export interface ProtectedObligationsDeps{
 requireAuth:typeof requireActiveAuth;
 withTransaction:<T>(fn:(db:DbClient)=>Promise<T>)=>Promise<T>;
 repo:ProtectedObligationsRepository;
 executeIdempotent:typeof executeIdempotentHttpMutation;
}
const defaults:ProtectedObligationsDeps={requireAuth:requireActiveAuth,withTransaction,repo:new ProtectedObligationsPgRepository(),executeIdempotent:executeIdempotentHttpMutation};
const privateResponse=(response:NextResponse)=>{response.headers.set('Cache-Control','private, no-store');return response;};
type Context={params:Promise<{projectId:string}>};
export async function handleGetProtectedObligations(req:NextRequest,{params}:Context,deps:ProtectedObligationsDeps=defaults){
 try{
  const auth=await deps.requireAuth(req),{projectId}=await params;
  if(!protectedUuid.test(projectId))throw new ValidationError('Project must be a valid ID');
  const input=parseProtectedReadQuery(req.nextUrl.searchParams);
  const result=await deps.withTransaction(db=>readProtectedObligations(deps.repo,db,auth,projectId.toLowerCase() as UUID,input));
  return privateResponse(NextResponse.json(result));
 }catch(error){return privateResponse(errorResponse(error));}
}

export async function handlePostProtectedObligations(req:NextRequest,{params}:Context,deps:ProtectedObligationsDeps=defaults){
 try{
  const auth=await deps.requireAuth(req),{projectId}=await params;
  if(!protectedUuid.test(projectId))throw new ValidationError('Project must be a valid ID');
  let value:unknown;try{value=await req.json();}catch{throw new ValidationError('A valid JSON body is required');}
  const input=parseReviewerResolution(value),idempotencyKey=requireIdempotencyKey(req);
  const result=await deps.withTransaction(async db=>{
   const context=await authorizeReviewerResolution(deps.repo,db,auth,projectId.toLowerCase() as UUID,input);
   await deps.requireAuth(req,db);
   return deps.executeIdempotent(db,{tenantId:auth.tenantId,actorId:auth.userId,endpoint:`POST:/api/projects/${projectId.toLowerCase()}/survey/protected-obligations`,idempotencyKey},input,
    async()=>({status:200,body:await resolveSurveyReviewer(deps.repo,db,context,input)}));
  });
  return privateResponse(NextResponse.json(result.body,{status:result.status}));
 }catch(error){return privateResponse(errorResponse(error));}
}
