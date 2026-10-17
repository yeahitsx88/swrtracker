import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePreparationCancellation,cancelProjectPreparation,authorizePreparationCancellationCommand,type PreparationCancellationRepository,type PreparationCancellationPreview} from '../../src/modules/tenancy/application/cancel-project-preparation';
import type {AuthContext} from '../../src/lib/auth';
import type {DbClient,UUID} from '../../src/shared/types';
const auth={tenantId:'tenant' as UUID,userId:'central' as UUID,sessionVersion:1} as AuthContext;
const snapshot='a'.repeat(64),project='project' as UUID;
const command={action:'START' as const,snapshot,reason:'Preparation is no longer needed',confirmed:true as const};
function fixture(role='TENANT_ADMIN'){
 const calls:string[]=[];
 const db:DbClient={query:async<T extends object>(sql:string,params?:unknown[])=>{
  let rows:object[]=[];
  if(sql.includes('COALESCE(session_version')){assert.deepEqual(params,[auth.tenantId,auth.userId]);rows=[{session_version:1,deactivated_at:null}];}
  else if(sql.includes('FROM tenant_memberships')){assert.deepEqual(params,[auth.tenantId,auth.userId]);rows=[{role}];}
  else assert.fail(sql);
  return {rows:rows as T[]};
 }};
 const preview:PreparationCancellationPreview={snapshot,status:'SETUP',recommissioningId:null,cancellationId:null,startedAt:null,reason:null,startedSnapshot:null,completedSnapshot:null,work:[],invitations:[],blockers:[]};
 const repo:PreparationCancellationRepository={preview:async(_db,current,id)=>{assert.equal(current,auth);assert.equal(id,project);return preview;},start:async()=>{calls.push('start');return {cancellationId:'cancel'};},finish:async()=>{calls.push('finish');return {cancellationId:'cancel'};}};
 return {db,repo,preview,calls};
}
test('cancellation requires current evidence, reason, explicit consent and the exact contract',()=>{
 assert.deepEqual(parsePreparationCancellation(command),command);
 for(const bad of [{...command,confirmed:false},{...command,reason:'short'},{...command,snapshot:'old'},{...command,action:'OPEN'},{...command,extra:true},null])assert.throws(()=>parsePreparationCancellation(bad),{name:'ValidationError'});
});
test('only current Central authority can start cancellation; stale phase and evidence never write',async()=>{
 const denied=fixture('VIEWER');await assert.rejects(()=>cancelProjectPreparation(denied.repo,denied.db,auth,project,command),{name:'ForbiddenError'});assert.deepEqual(denied.calls,[]);
 const f=fixture();await cancelProjectPreparation(f.repo,f.db,auth,project,command);assert.deepEqual(f.calls,['start']);
 f.calls.length=0;f.preview.snapshot='b'.repeat(64);await assert.rejects(()=>cancelProjectPreparation(f.repo,f.db,auth,project,command),{code:'STALE_PREPARATION_CANCELLATION'});
 f.preview.snapshot=snapshot;f.preview.status='ACTIVE';await assert.rejects(()=>cancelProjectPreparation(f.repo,f.db,auth,project,command),{name:'ConflictError'});assert.deepEqual(f.calls,[]);
});
test('finish requires started cancellation and resolved obligations',async()=>{
 const f=fixture(),finish={...command,action:'FINISH' as const};
 await assert.rejects(()=>cancelProjectPreparation(f.repo,f.db,auth,project,finish),{name:'ConflictError'});
 f.preview.cancellationId='cancel';f.preview.blockers=['Unfinished requests remain'];await assert.rejects(()=>cancelProjectPreparation(f.repo,f.db,auth,project,finish),{code:'PREPARATION_CANCELLATION_BLOCKED'});assert.deepEqual(f.calls,[]);
 f.preview.blockers=[];await cancelProjectPreparation(f.repo,f.db,auth,project,finish);assert.deepEqual(f.calls,['finish']);
});
test('pre-replay checks preserve unchanged start retry and matching terminal finish only',async()=>{
 const f=fixture();f.preview.cancellationId='cancel';f.preview.startedSnapshot=snapshot;f.preview.snapshot='b'.repeat(64);
 await authorizePreparationCancellationCommand(f.repo,f.db,auth,project,command);
 await assert.rejects(()=>authorizePreparationCancellationCommand(f.repo,f.db,auth,project,{...command,snapshot:f.preview.snapshot}),{code:'STALE_PREPARATION_CANCELLATION'});
 f.preview.status='ARCHIVED';f.preview.cancellationId=null;f.preview.completedSnapshot=snapshot;
 await authorizePreparationCancellationCommand(f.repo,f.db,auth,project,{...command,action:'FINISH'});
 await assert.rejects(()=>authorizePreparationCancellationCommand(f.repo,f.db,auth,project,command),{code:'STALE_PREPARATION_CANCELLATION'});
 await assert.rejects(()=>authorizePreparationCancellationCommand(f.repo,f.db,auth,project,{...command,action:'FINISH',snapshot:'b'.repeat(64)}),{code:'STALE_PREPARATION_CANCELLATION'});
 assert.deepEqual(f.calls,[]);
});
