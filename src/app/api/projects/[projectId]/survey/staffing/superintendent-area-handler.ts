import {NextResponse,type NextRequest} from 'next/server';
import {requireActiveAuth} from '@/lib/auth';
import {acquireTenantLifecycleLock,assertMutationIdentity} from '@/lib/tenant-lifecycle-lock';
import {withTransaction} from '@/lib/with-transaction';
import {errorResponse} from '@/lib/api-error';
import {executeIdempotentHttpMutation,requireIdempotencyKey} from '@/lib/idempotency';
import {authorizeSuperintendentAreaUnlink,parseSuperintendentAreaUnlink,unlinkSuperintendentArea} from '@/modules/tenancy/application/unlink-superintendent-area';
import {UnauthorizedError,ValidationError} from '@/shared/errors';
import type {DbClient,UUID} from '@/shared/types';
import type {SuperintendentAreaRepository} from '@/modules/tenancy/application/superintendent-area.types';
import {readSuperintendentAreas,parseSuperintendentAreaReadQuery} from '@/modules/tenancy/application/read-superintendent-areas';
import {protectedUuid} from '@/modules/tenancy/application/read-protected-obligations';
import {SuperintendentAreasPgRepository} from '@/modules/tenancy/infrastructure/superintendent-areas.repository';
export interface SuperintendentAreaDeps{
 requireAuth:typeof requireActiveAuth;
 withTransaction:<T>(fn:(db:DbClient)=>Promise<T>)=>Promise<T>;
 repo:SuperintendentAreaRepository;
 executeIdempotent:typeof executeIdempotentHttpMutation;
}
const defaults:SuperintendentAreaDeps={requireAuth:requireActiveAuth,withTransaction,executeIdempotent:executeIdempotentHttpMutation,repo:new SuperintendentAreasPgRepository()};
const privateResponse=(response:NextResponse)=>{response.headers.set('Cache-Control','private, no-store');return response;};
type Context={params:Promise<{projectId:string}>};
export async function handleGetSuperintendentAreas(req:NextRequest,{params}:Context,deps:SuperintendentAreaDeps=defaults){
 try{
  const auth=await deps.requireAuth(req),{projectId}=await params;
  if(!protectedUuid.test(projectId))throw new ValidationError('Project must be a valid ID');
  const input=parseSuperintendentAreaReadQuery(req.nextUrl.searchParams);
  const result=await deps.withTransaction(db=>readSuperintendentAreas(deps.repo,db,auth,projectId.toLowerCase() as UUID,input));
  return privateResponse(NextResponse.json(result));
 }catch(error){return privateResponse(errorResponse(error));}
}

export async function handlePatchSuperintendentArea(req:NextRequest,{params}:Context,deps:SuperintendentAreaDeps=defaults){
 try{
  const auth=await deps.requireAuth(req),{projectId}=await params;
  if(!protectedUuid.test(projectId))throw new ValidationError('Project must be a valid ID');
  let body:unknown;try{body=await req.json();}catch{throw new ValidationError('A valid JSON body is required');}
  const input=parseSuperintendentAreaUnlink(body),idempotencyKey=requireIdempotencyKey(req),canonicalProject=projectId.toLowerCase() as UUID;
  const result=await deps.withTransaction(async db=>{
   await acquireTenantLifecycleLock(db,auth.tenantId,'EXCLUSIVE');
   assertMutationIdentity(await deps.requireAuth(req,db),auth);
   const context=await authorizeSuperintendentAreaUnlink(deps.repo,db,auth,canonicalProject,input);
   const current=await deps.requireAuth(req,db);
   if(current.userId!==context.authority.actorId||current.tenantId!==context.authority.tenantId||current.sessionVersion!==context.authority.actorSessionVersion||(current.expiresAt&&current.expiresAt.getTime()<=Date.now()))throw new UnauthorizedError('Current active session is required','AUTH_SESSION_REVOKED');
   return deps.executeIdempotent(db,{tenantId:auth.tenantId,actorId:auth.userId,endpoint:`PATCH:/api/projects/${canonicalProject}/survey/staffing:unlink-superintendent-area`,idempotencyKey},input,async()=>({status:200,body:await unlinkSuperintendentArea(deps.repo,db,context,input)}));
  });
  return privateResponse(NextResponse.json(result.body,{status:result.status}));
 }catch(error){return privateResponse(errorResponse(error));}
}
