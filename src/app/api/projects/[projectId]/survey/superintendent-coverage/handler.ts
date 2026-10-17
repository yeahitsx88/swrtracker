import {NextResponse,type NextRequest} from 'next/server';
import {requireActiveAuth} from '@/lib/auth';
import {acquireTenantLifecycleLock,assertMutationIdentity} from '@/lib/tenant-lifecycle-lock';
import {withTransaction} from '@/lib/with-transaction';
import {errorResponse} from '@/lib/api-error';
import {executeIdempotentHttpMutation,requireIdempotencyKey} from '@/lib/idempotency';
import {UnauthorizedError,ValidationError} from '@/shared/errors';
import type {DbClient,UUID} from '@/shared/types';
import {protectedUuid} from '@/modules/tenancy/application/read-protected-obligations';
import {authorizeSuperintendentAreaGrant,grantSuperintendentArea,parseGrantSuperintendentArea,parseSuperintendentId,type SuperintendentCoverageRepository} from '@/modules/tenancy/application/grant-superintendent-area';
import {SuperintendentCoveragePgRepository} from '@/modules/tenancy/infrastructure/superintendent-coverage.repository';

export interface SuperintendentCoverageDeps{
 requireAuth:typeof requireActiveAuth;
 withTransaction:<T>(fn:(db:DbClient)=>Promise<T>)=>Promise<T>;
 repo:SuperintendentCoverageRepository;
 executeIdempotent:typeof executeIdempotentHttpMutation;
}
const defaults:SuperintendentCoverageDeps={requireAuth:requireActiveAuth,withTransaction,executeIdempotent:executeIdempotentHttpMutation,repo:new SuperintendentCoveragePgRepository()};
const privateResponse=(response:NextResponse)=>{response.headers.set('Cache-Control','private, no-store');return response;};
type Context={params:Promise<{projectId:string}>};

function projectFrom(value:string):UUID{
 if(!protectedUuid.test(value))throw new ValidationError('Project must be a valid ID');
 return value.toLowerCase() as UUID;
}

export async function handleGetSuperintendentCoverage(req:NextRequest,{params}:Context,deps:SuperintendentCoverageDeps=defaults){
 try{
  const auth=await deps.requireAuth(req),projectId=projectFrom((await params).projectId);
  for(const key of req.nextUrl.searchParams.keys())if(key!=='superintendentId')throw new ValidationError('Only superintendentId is supported');
  const superintendentId=parseSuperintendentId(req.nextUrl.searchParams.get('superintendentId'));
  const result=await deps.withTransaction(async db=>{
   await acquireTenantLifecycleLock(db,auth.tenantId,'SHARED');
   assertMutationIdentity(await deps.requireAuth(req,db),auth);
   return deps.repo.review(db,auth,projectId,superintendentId);
  });
  return privateResponse(NextResponse.json(result));
 }catch(error){return privateResponse(errorResponse(error));}
}

export async function handlePostSuperintendentCoverage(req:NextRequest,{params}:Context,deps:SuperintendentCoverageDeps=defaults){
 try{
  const auth=await deps.requireAuth(req),projectId=projectFrom((await params).projectId);
  let body:unknown;try{body=await req.json();}catch{throw new ValidationError('A valid JSON body is required');}
  const input=parseGrantSuperintendentArea(body),idempotencyKey=requireIdempotencyKey(req);
  const result=await deps.withTransaction(async db=>{
   await acquireTenantLifecycleLock(db,auth.tenantId,'EXCLUSIVE');
   assertMutationIdentity(await deps.requireAuth(req,db),auth);
   const context=await authorizeSuperintendentAreaGrant(deps.repo,db,auth,projectId,input);
   const current=await deps.requireAuth(req,db);
   if(current.userId!==context.authority.actorId||current.tenantId!==context.authority.tenantId||current.sessionVersion!==context.authority.actorSessionVersion||(current.expiresAt&&current.expiresAt.getTime()<=Date.now()))throw new UnauthorizedError('Current active session is required','AUTH_SESSION_REVOKED');
   return deps.executeIdempotent(db,{tenantId:auth.tenantId,actorId:auth.userId,endpoint:`POST:/api/projects/${projectId}/survey/superintendent-coverage`,idempotencyKey},input,async()=>({status:201,body:await grantSuperintendentArea(deps.repo,db,context,input)}));
  });
  return privateResponse(NextResponse.json(result.body,{status:result.status}));
 }catch(error){return privateResponse(errorResponse(error));}
}
