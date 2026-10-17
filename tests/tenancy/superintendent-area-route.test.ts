import assert from 'node:assert/strict';
import test from 'node:test';
import {NextRequest,NextResponse} from 'next/server';
import {dispatchGetSurveyStaffing} from '@/app/api/projects/[projectId]/survey/staffing/dispatch';
const id=(n:number)=>`99010000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const ctx={params:Promise.resolve({projectId:id(3)})};
test('staffing dispatcher selects new exact modes and retains incumbent Chief response contract',async()=>{
 const deps={getChief:async()=>NextResponse.json({staffing:{partyChief:{id:id(13)}}}),getAreas:async(req:NextRequest)=>NextResponse.json({mode:req.nextUrl.searchParams.get('mode')})};
 for(const mode of ['superintendent-areas','superintendent-area-replacements','superintendent-area-reporting']){
  const res=await dispatchGetSurveyStaffing(new NextRequest(`http://localhost/api?mode=${mode}`),ctx,deps);
  assert.deepEqual(await res.json(),{mode});assert.equal(res.headers.get('cache-control'),'private, no-store');
 }
 for(const query of ['', '?mode=snapshot','?mode=unknown']){
  const res=await dispatchGetSurveyStaffing(new NextRequest('http://localhost/api'+query),ctx,deps);
  assert.deepEqual(await res.json(),{staffing:{partyChief:{id:id(13)}}});assert.equal(res.status,200);
 }
});

test('staffing PATCH dispatcher preserves body stream and action-specific routing including malformed legacy validation',async()=>{
 const module=await import('@/app/api/projects/[projectId]/survey/staffing/dispatch');
 assert.equal(typeof module.dispatchPatchSurveyStaffing,'function','New action-specific PATCH dispatch is not implemented');
 const deps={patchChief:async(req:NextRequest)=>{try{return NextResponse.json({legacy:await req.json()});}catch{return NextResponse.json({error:'invalid JSON'},{status:400});}},patchArea:async(req:NextRequest)=>NextResponse.json({area:await req.json()})};
 const request=(body:string)=>new NextRequest('http://localhost/api',{method:'PATCH',body});
 const body={action:'unlink-superintendent-area',linkId:id(40)};
 const area=await module.dispatchPatchSurveyStaffing(request(JSON.stringify(body)),ctx,deps);assert.deepEqual(await area.json(),{area:body});assert.equal(area.headers.get('cache-control'),'private, no-store');
 const legacy=await module.dispatchPatchSurveyStaffing(request('{"action":"unlink","kind":"area"}'),ctx,deps);assert.deepEqual(await legacy.json(),{legacy:{action:'unlink',kind:'area'}});
 const malformed=await module.dispatchPatchSurveyStaffing(request('{'),ctx,deps);assert.equal(malformed.status,400);assert.equal(malformed.headers.get('cache-control'),'private, no-store');
});
