import {test} from 'node:test';
import assert from 'node:assert/strict';
import {FrozenCommand,CommandOwner} from '../../src/lib/frozen-command';
test('uncertain action retains exact body/key, prevents duplicates and blocks replacement',()=>{
 const gate=new FrozenCommand<{scope:string;reason:string}>(),body={scope:'PROJECT_ACCESS',reason:'Original'};
 const first=gate.begin(body,'first');assert.ok(first);body.reason='Changed';assert.equal(first.body.reason,'Original');
 assert.equal(gate.begin(body,'second'),null);gate.fail(500);assert.equal(gate.reload(),false);
 assert.deepEqual(gate.begin({scope:'TENANT_ACCOUNT',reason:'Widened'},'third'),first);
 gate.success();assert.equal(gate.locked,false);
});
test('every 409 stays latched until deliberate reload',()=>{
 const gate=new FrozenCommand<string>();gate.begin('intent','key');gate.fail(409);
 assert.equal(gate.begin('replacement','new'),null);assert.equal(gate.stale,true);
 assert.equal(gate.reload(),true);assert.equal(gate.stale,false);assert.ok(gate.begin('fresh','fresh'));
});

test('shared command owner excludes mounted siblings and cannot be released by a sibling',()=>{
 const owner=new CommandOwner();let changes=0;const unsubscribe=owner.subscribe(()=>changes++);
 assert.equal(owner.claim('local'),true);assert.equal(owner.claim('review'),false);
 owner.release('review');assert.equal(owner.blocked('review'),true);assert.equal(owner.claim('local'),true);
 owner.release('local');assert.equal(owner.claim('review'),true);assert.equal(changes,4);unsubscribe();
});
