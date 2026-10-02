import { NextResponse, type NextRequest } from 'next/server';
import { requireActiveAuth } from '@/lib/auth';
import { getProjectRole } from '@/lib/get-project-role';
import {acquireTenantLifecycleLock,assertMutationIdentity} from '@/lib/tenant-lifecycle-lock';
import { withTransaction } from '@/lib/with-transaction';
import { errorResponse } from '@/lib/api-error';
import { executeIdempotentHttpMutation, requireIdempotencyKey } from '@/lib/idempotency';
import { assertWorkforceViewer, authorizeWorkforceMove, moveWorkforceMember, readWorkforceMember } from '@/modules/tenancy/application/survey-workforce';
import { SurveyWorkforcePgRepository } from '@/modules/tenancy/infrastructure/survey-workforce.repository';
import { parseTeamPage } from '../teams/handler';
import { NotFoundError, ValidationError } from '@/shared/errors';
import type { UUID } from '@/shared/types';
const repo=new SurveyWorkforcePgRepository();
export const dynamic='force-dynamic';
const uuid=(value:unknown):UUID=>{if(typeof value!=='string'||!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value))throw new ValidationError('Invalid person or project ID');return value.toLowerCase() as UUID;};
type Context={params:Promise<{projectId:string}>};
async function run<T>(req:NextRequest,context:Context,fn:(db:import('@/shared/types').DbClient,actor:import('@/modules/tenancy/application/survey-teams').TeamActor)=>Promise<T>){
 const auth=await requireActiveAuth(req);const projectId=uuid((await context.params).projectId);
 return withTransaction(async db=>{
 if(req.method!=='GET'){
   await acquireTenantLifecycleLock(db,auth.tenantId,'EXCLUSIVE');
   assertMutationIdentity(await requireActiveAuth(req,db),auth);
 }
 const actor={tenantId:auth.tenantId,projectId,actorId:auth.userId,sessionVersion:auth.sessionVersion,actorRole:await getProjectRole(db,auth.tenantId,projectId,auth.userId,auth.sessionVersion)};assertWorkforceViewer(actor);return fn(db,actor);});
}
export async function GET(req:NextRequest,context:Context){
 try{
 const mode=req.nextUrl.searchParams.get('mode')??'personnel';if(!['personnel','context','person'].includes(mode))throw new ValidationError('Unknown workforce view');
 const query=parseTeamPage(req);
 const result=await run(req,context,async(db,actor)=>{
 if(mode==='context'){const project=await repo.context(db,actor);if(!project)throw new NotFoundError('Project not found');return {project,role:actor.actorRole,snapshotToken:await repo.snapshot(db,actor.tenantId,actor.projectId)};}
 if(mode==='person')return {person:await readWorkforceMember(repo,db,actor,uuid(req.nextUrl.searchParams.get('personId')))};
 return repo.personnel(db,actor,query);
 });return NextResponse.json(result,{headers:{'Cache-Control':'private, no-store'}});
 }catch(error){return errorResponse(error);}
}
export async function POST(req:NextRequest,context:Context){
 try{
 const body=await req.json();const input={instrumentManId:uuid(body?.instrumentManId),partyChiefId:uuid(body?.partyChiefId),expectedSnapshot:body?.expectedSnapshot};
 if(typeof input.expectedSnapshot!=='string'||!/^[a-f0-9]{32}$/.test(input.expectedSnapshot))throw new ValidationError('Current staffing snapshot is required');
 const idempotencyKey=requireIdempotencyKey(req);
 const result=await run(req,context,async(db,actor)=>{
 await authorizeWorkforceMove(repo,db,actor,input);
 return executeIdempotentHttpMutation(db,{tenantId:actor.tenantId,actorId:actor.actorId,endpoint:`POST:/api/projects/${actor.projectId}/survey/workforce`,idempotencyKey},input,async()=>({status:200,body:await moveWorkforceMember(repo,db,actor,input)}));
 });return NextResponse.json(result.body,{status:result.status});
 }catch(error){return errorResponse(error);}
}
