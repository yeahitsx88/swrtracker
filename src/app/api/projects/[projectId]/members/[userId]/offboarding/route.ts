import {observeProjectRoute} from '@/lib/observe-project-route';
import type { NextRequest } from 'next/server';
import type { UUID } from '@/shared/types';
import { handleOffboarding } from '@/app/api/accounts/[userId]/offboarding/handler';
export const dynamic='force-dynamic';
type Context={params:Promise<{userId:string;projectId:string}>};
async function observedGET(req:NextRequest,ctx:Context){const p=await ctx.params;return handleOffboarding(req,{kind:'PROJECT_ACCESS',projectId:p.projectId as UUID},p.userId);}
async function observedPOST(req:NextRequest,ctx:Context){const p=await ctx.params;return handleOffboarding(req,{kind:'PROJECT_ACCESS',projectId:p.projectId as UUID},p.userId);}

export const GET=observeProjectRoute(observedGET);
export const POST=observeProjectRoute(observedPOST);
