import {observeProjectRoute} from '@/lib/observe-project-route';
import type {NextRequest} from 'next/server';
import {handleGetSuperintendentCoverage,handlePostSuperintendentCoverage} from './handler';

export const dynamic='force-dynamic';

async function observedGET(req:NextRequest,ctx:{params:Promise<{projectId:string}>}){return handleGetSuperintendentCoverage(req,ctx);}
async function observedPOST(req:NextRequest,ctx:{params:Promise<{projectId:string}>}){return handlePostSuperintendentCoverage(req,ctx);}

export const GET=observeProjectRoute(observedGET);
export const POST=observeProjectRoute(observedPOST);
