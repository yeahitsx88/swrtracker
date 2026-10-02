import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
// Generated with the retained bcrypt5.1.1 implementation; synthetic password only.
const legacy='$2b$12$fD6h9r05SKs2DchiGeTdruWbvWyNVU7G6o749yPlSuVrE.jgSdbya';
test('bcrypt accepts retained 2b and 2a hashes and rejects a different password',async()=>{
 for(const hash of [legacy,legacy.replace('$2b$','$2a$')]){
  assert.equal(await bcrypt.compare('phase5-compatibility-fixture',hash),true);
  assert.equal(await bcrypt.compare('incorrect-fixture-password',hash),false);
 }
 const hash=await bcrypt.hash('new-phase5-fixture',12);
 assert.equal(bcrypt.getRounds(hash),12);
 assert.equal(await bcrypt.compare('new-phase5-fixture',hash),true);
});