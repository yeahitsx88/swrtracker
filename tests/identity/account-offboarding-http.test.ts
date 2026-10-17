import test from 'node:test';
import assert from 'node:assert/strict';
import { parseOffboardingCommand } from '@/app/api/accounts/[userId]/offboarding/handler';
import type { UUID } from '@/shared/types';
const subject='10000000-0000-4000-8000-000000000001' as UUID;
const project='10000000-0000-4000-8000-000000000002' as UUID;
const body={subjectUserId:subject,scope:{kind:'PROJECT_ACCESS' as const,projectId:project},reason:'  Departure confirmed  ',snapshot:'a'.repeat(64),confirmed:true};
test('project scope cannot be widened or supplied by a different endpoint',()=>{
  assert.throws(()=>parseOffboardingCommand({...body,scope:{kind:'TENANT_ACCOUNT'}},body.scope,subject,'key'),{type:'ValidationError'});
  assert.throws(()=>parseOffboardingCommand({...body,subjectUserId:project},body.scope,subject,'key'),{type:'ValidationError'});
  assert.throws(()=>parseOffboardingCommand({...body,scope:{...body.scope,tenantId:project}},body.scope,subject,'key'),{type:'ValidationError'});
});
test('extra actions and body retry keys are refused; valid reasons are normalized once',()=>{
  for(const extra of [{reactivate:true},{delete:true},{idempotencyKey:'other'}])assert.throws(()=>parseOffboardingCommand({...body,...extra},body.scope,subject,'key'),{type:'ValidationError'});
  assert.equal(parseOffboardingCommand(body,body.scope,subject,'key').reason,'Departure confirmed');
  assert.throws(()=>parseOffboardingCommand({...body,confirmed:false},body.scope,subject,'key'),{type:'ValidationError'});
});
