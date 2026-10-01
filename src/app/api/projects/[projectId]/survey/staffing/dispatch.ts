import type {NextRequest} from 'next/server';
import {errorResponse} from '@/lib/api-error';
import {handleGetSurveyStaffing,handlePatchSurveyStaffing} from './handler';
import {handleGetSuperintendentAreas,handlePatchSuperintendentArea} from './superintendent-area-handler';
type Context={params:Promise<{projectId:string}>};
type Handler=(req:NextRequest,ctx:Context)=>Promise<Response>;
export interface SurveyStaffingDispatchDeps{getChief:Handler;getAreas:Handler;patchChief:Handler;patchArea:Handler}
const defaults:SurveyStaffingDispatchDeps={getChief:handleGetSurveyStaffing,getAreas:handleGetSuperintendentAreas,patchChief:handlePatchSurveyStaffing,patchArea:handlePatchSuperintendentArea};
export async function dispatchGetSurveyStaffing(req:NextRequest,ctx:Context,deps:Partial<SurveyStaffingDispatchDeps>={}){
 const handlers={...defaults,...deps},mode=req.nextUrl.searchParams.get('mode');
 const response=await(['superintendent-areas','superintendent-area-replacements','superintendent-area-reporting'].includes(mode??'')?handlers.getAreas:handlers.getChief)(req,ctx);
 response.headers.set('Cache-Control','private, no-store');return response;
}

export async function dispatchPatchSurveyStaffing(req:NextRequest,ctx:Context,deps:Partial<SurveyStaffingDispatchDeps>={}){
 let response:Response;
 try{
  let body:unknown;
  try{body=await req.clone().json();}catch(error){if(!(error instanceof SyntaxError))throw error;}
  const handlers={...defaults,...deps};
  const isArea=!!body&&typeof body==='object'&&!Array.isArray(body)&&(body as {action?:unknown}).action==='unlink-superintendent-area';
  response=await(isArea?handlers.patchArea:handlers.patchChief)(req,ctx);
 }catch(error){response=errorResponse(error);}
 response.headers.set('Cache-Control','private, no-store');return response;
}
