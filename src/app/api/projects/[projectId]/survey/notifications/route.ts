import {NextResponse,type NextRequest} from 'next/server';
import {requireActiveAuth} from '@/lib/auth';
import {getProjectRole} from '@/lib/get-project-role';
import {pool} from '@/lib/db';
import {errorResponse} from '@/lib/api-error';
import {ValidationError} from '@/shared/errors';
import {readSurveyInbox} from '@/modules/notification/application/survey-inbox';
import type {UUID} from '@/shared/types';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest,{params}:{params:Promise<{projectId:string}>}){
 try{
  const auth=await requireActiveAuth(req);const {projectId}=await params;
  if(!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(projectId))throw new ValidationError('Choose a valid project.');
  const raw=req.nextUrl.searchParams.get('offset')??'0';
  if(!/^\d+$/.test(raw))throw new ValidationError('Choose a valid notifications page.');
  const actorRole=await getProjectRole(pool,auth.tenantId,projectId as UUID,auth.userId,auth.sessionVersion);
  const result=await readSurveyInbox(pool,{tenantId:auth.tenantId,projectId:projectId as UUID,actorId:auth.userId,sessionVersion:auth.sessionVersion,actorRole},Number(raw));
  return NextResponse.json(result,{headers:{'Cache-Control':'private, no-store'}});
 }catch(error){return errorResponse(error);}
}
