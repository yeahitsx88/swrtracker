import test from 'node:test';
import assert from 'node:assert/strict';
import {assertProjectSetupMutable} from '@/app/api/projects/[projectId]/aor/shared';
import type {DbClient,UUID} from '@/shared/types';
const tenant='00000000-0000-4000-8000-000000000001' as UUID,project='00000000-0000-4000-8000-000000000002' as UUID;
function fixture(status:string,cancelling:boolean){const calls:string[]=[];const db={query:async(sql:string,params:unknown[])=>{calls.push(sql);assert.deepEqual(params,sql.includes('project_preparation_cancellations')?[tenant,project]:[project,tenant]);return{rows:sql.includes('project_preparation_cancellations')?(cancelling?[{id:'recorded-cancellation'}]:[]):[{id:project,tenant_id:tenant,name:'Retained project',status,crew_build:'FULL',created_at:new Date(),activated_at:null,archived_at:null}]};}} as unknown as DbClient;return{db,calls};}
test('recorded preparation cancellation blocks all shared legacy setup writes',async()=>{const{db}=fixture('SETUP',true);await assert.rejects(assertProjectSetupMutable(db,tenant,project),{code:'PROJECT_PREPARATION_CANCELLING'});});
test('ordinary Setup and reopening Setup retain setup repair eligibility without granting authority',async()=>{const{db,calls}=fixture('SETUP',false);await assert.doesNotReject(assertProjectSetupMutable(db,tenant,project));assert(calls.some(sql=>sql.includes('project_preparation_cancellations')));});
test('Active and Archived remain unavailable for shared legacy setup',async()=>{for(const status of ['ACTIVE','ARCHIVED']){const{db}=fixture(status,false);await assert.rejects(assertProjectSetupMutable(db,tenant,project));}});
