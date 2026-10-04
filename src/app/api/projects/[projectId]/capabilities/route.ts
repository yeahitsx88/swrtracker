import {observeProjectRoute} from '@/lib/observe-project-route';
import {NextResponse,type NextRequest} from 'next/server';
import {requireActiveAuth} from '@/lib/auth';
import {withTransaction} from '@/lib/with-transaction';
import {resolveProjectCapabilities} from '@/lib/project-capabilities';
import type {UUID} from '@/shared/types';
import {requireResourceUuid} from '@/lib/resource-uuid';
import {errorResponse} from '@/lib/api-error';
export const dynamic='force-dynamic';
async function observedGET(req:NextRequest,ctx:{params:Promise<{projectId:string}>}){
 try{const auth=await requireActiveAuth(req),projectId=(await ctx.params).projectId as UUID;requireResourceUuid(projectId,'projectId');
 const capabilities=await withTransaction(db=>resolveProjectCapabilities(db,auth,projectId),{req,auth,mode:'SHARED',authorize:async()=>{}});
 return NextResponse.json({capabilities},{headers:{'Cache-Control':'private, no-store'}});
 }catch(error){return errorResponse(error);}
}

export const GET=observeProjectRoute(observedGET);
