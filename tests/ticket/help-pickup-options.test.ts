import assert from 'node:assert/strict';
import test from 'node:test';
import { getHelpPickupOptions } from '@/modules/ticket/application/help-pickup-options';
import type { HelpFlagRepositoryPort, VisibleHelpFlag } from '@/modules/ticket/application/help-flags';
import type { DbClient, UUID } from '@/shared/types';
import { ForbiddenError, NotFoundError, ValidationError } from '@/shared/errors';
const id='00000000-0000-0000-0000-000000000001' as UUID,other='00000000-0000-0000-0000-000000000002' as UUID;
const flag:VisibleHelpFlag={id,tenantId:id,projectId:id,raisedBy:other,raisedByName:'Other chief',level:2,status:'ACTIVE',reason:null,escalatedFrom:null,affectedTicketIds:[id]};
const flags={activeProject:async()=>true,listVisible:async()=>[flag]} as unknown as HelpFlagRepositoryPort;
const db:DbClient={async query(){throw new Error('Unexpected query');}};
const context={tenantId:id,projectId:id,actorId:id,actorRole:'PARTY_CHIEF' as const,flagId:id,kind:'tickets' as const,search:' FSS ',limit:1,offset:0};
test('pickup options authorize visible other-chief Level 2 flag before candidate queries',async()=>{
  let reads=0;
  const tickets={list:async(_db:DbClient,f:VisibleHelpFlag,a:UUID,search:string,limit:number)=>{
    reads++;assert.equal(f,flag);assert.equal(a,id);assert.equal(search,'FSS');assert.equal(limit,2);return [{id,name:'FSS-1'},{id:other,name:'FSS-2'}];}};
  const crew={list:async()=>{throw new Error('Unexpected crew query');}};
  await assert.rejects(getHelpPickupOptions(flags,tickets,crew,db,{...context,actorRole:'INSTRUMENT_MAN'}),ForbiddenError);
  for(const row of [{...flag,level:1 as const},{...flag,raisedBy:id}])
    await assert.rejects(getHelpPickupOptions({...flags,listVisible:async()=>[row]},tickets,crew,db,context),NotFoundError);
  await assert.rejects(getHelpPickupOptions({...flags,listVisible:async()=>[]},tickets,crew,db,context),NotFoundError);
  assert.equal(reads,0);
  assert.deepEqual(await getHelpPickupOptions(flags,tickets,crew,db,context),{candidates:[{id,name:'FSS-1'}],hasMore:true});
  for(const bad of [{limit:0},{limit:101},{offset:-1},{offset:0.5},{search:'x'.repeat(201)}])
    await assert.rejects(getHelpPickupOptions(flags,tickets,crew,db,{...context,...bad}),ValidationError);
});
test('pickup crew query is limited to active Instrument Men in the claiming chief roster',async()=>{
  const tickets={list:async()=>{throw new Error('Unexpected ticket query');}};
  const crew={list:async(_db:DbClient,params:unknown)=>{
    assert.deepEqual(params,{tenantId:id,projectId:id,role:'INSTRUMENT_MAN',aorNodeId:null,crewChiefId:id,search:'FSS',limit:2,offset:0});return [];}};
  assert.deepEqual(await getHelpPickupOptions(flags,tickets,crew,db,{...context,kind:'crew'}),{candidates:[],hasMore:false});
});
