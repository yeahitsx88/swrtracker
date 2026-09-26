import assert from 'node:assert/strict';
import test from 'node:test';
import { getHelpBoard } from '@/modules/ticket/application/help-board';
import type { HelpFlag, HelpFlagRepositoryPort } from '@/modules/ticket/application/help-flags';
import type { DbClient, UUID } from '@/shared/types';
import { ForbiddenError, ConflictError } from '@/shared/errors';
const id='00000000-0000-0000-0000-000000000001' as UUID;
const other='00000000-0000-0000-0000-000000000002' as UUID;
const db:DbClient={async query(){throw new Error('Unexpected query');}};
const context={tenantId:id,projectId:id,actorId:id,actorRole:'PARTY_CHIEF' as const};
const flag:HelpFlag={id,tenantId:id,projectId:id,raisedBy:other,level:1,status:'ACTIVE',reason:'Support',escalatedFrom:null,affectedTicketIds:[id]};
const repo={activeProject:async()=>true,listVisible:async()=>[flag],activeFlagForActor:async()=>null,
  crewChief:async()=>id,snapshot:async()=>[id],findEscalation:async()=>null} as unknown as HelpFlagRepositoryPort;
test('help board permits raising and escalation only for the eligible crew with active workload',async()=>{
  const board=await getHelpBoard(repo,db,context);
  assert.equal(board.raiseLevel,2);assert.equal(board.flags[0]?.canEscalate,true);assert.equal(board.flags[0]?.canClear,false);
  assert.equal((await getHelpBoard({...repo,crewChief:async()=>other},db,context)).flags[0]?.canEscalate,false);
  assert.equal((await getHelpBoard({...repo,findEscalation:async()=>flag},db,context)).flags[0]?.canEscalate,false);
  const existing=await getHelpBoard({...repo,activeFlagForActor:async()=>flag},db,context);
  assert.equal(existing.raiseLevel,null);assert.equal(existing.flags[0]?.canEscalate,false);
  const empty=await getHelpBoard({...repo,snapshot:async()=>[]},db,context);
  assert.equal(empty.raiseLevel,null);assert.equal(empty.flags[0]?.canEscalate,false);
});
test('IM can raise Level 1 and clear own flag while supervisors only read',async()=>{
  const own={...repo,listVisible:async()=>[{...flag,raisedBy:id}]};
  const im=await getHelpBoard(own,db,{...context,actorRole:'INSTRUMENT_MAN'});
  assert.equal(im.raiseLevel,1);assert.equal(im.flags[0]?.canClear,true);assert.equal(im.flags[0]?.canEscalate,false);
  assert.equal((await getHelpBoard({...own,crewChief:async()=>null},db,{...context,actorRole:'INSTRUMENT_MAN'})).raiseLevel,null);
  for(const actorRole of ['SURVEY_MANAGER','SURVEY_SUPERINTENDENT'] as const){
    const board=await getHelpBoard(repo,db,{...context,actorRole});
    assert.equal(board.raiseLevel,null);assert.equal(board.flags[0]?.canEscalate,false);
  }
});
test('help board preserves repository visibility and rejects unrelated roles and inactive projects',async()=>{
  let reads=0;
  const scoped={...repo,listVisible:async(_db:DbClient,t:UUID,p:UUID,a:UUID,role:string)=>{
    reads++;assert.deepEqual([t,p,a,role],[id,id,id,'PARTY_CHIEF']);return [];}};
  await assert.rejects(getHelpBoard(scoped,db,{...context,actorRole:'REQUESTER'}),ForbiddenError);assert.equal(reads,0);
  assert.deepEqual((await getHelpBoard(scoped,db,context)).flags,[]);assert.equal(reads,1);
  await assert.rejects(getHelpBoard({...repo,activeProject:async()=>false},db,context),ConflictError);
  await assert.rejects(getHelpBoard({...repo,listVisible:async()=>{throw new Error('offline');}},db,context),/offline/);
});
