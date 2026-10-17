import {NextResponse,type NextRequest} from 'next/server';
import {requireActiveAuth} from '@/lib/auth';
import {errorResponse} from '@/lib/api-error';
import {withTransaction} from '@/lib/with-transaction';
import {coordinateAuthenticatedMutation} from '@/lib/tenant-lifecycle-lock';
import {requireResourceUuid} from '@/lib/resource-uuid';
import {observeProjectRoute} from '@/lib/observe-project-route';
import {ValidationError} from '@/shared/errors';
import {readSubmittedRecovery} from '@/modules/ticket/application/read-submitted-recovery';
import type {UUID} from '@/shared/types';
export const dynamic='force-dynamic';
export const GET=observeProjectRoute(async(req:NextRequest,{params}:{params:Promise<{projectId:string}>})=>{
 try{
  const auth=await requireActiveAuth(req),{projectId}=await params;requireResourceUuid(projectId,'projectId');
  const limit=Number(req.nextUrl.searchParams.get('limit')??20),offset=Number(req.nextUrl.searchParams.get('offset')??0);
  if(!Number.isSafeInteger(limit)||limit<1||limit>100||!Number.isSafeInteger(offset)||offset<0)throw new ValidationError('Use a page size of 1–100 and nonnegative offset.');
  const page=await withTransaction(async db=>{await coordinateAuthenticatedMutation(db,req,auth,'SHARED',requireActiveAuth);return readSubmittedRecovery(db,auth,projectId as UUID,limit,offset);});
  return NextResponse.json(page);
 }catch(error){return errorResponse(error);}
});
