import test from 'node:test';
import assert from 'node:assert/strict';
import {validateCustomRole} from '../../src/modules/tenancy/domain/custom-role';
for(const name of ['Tenant Admin','Central IT','Requester','Viewer','PROJECT_ADMIN','survey-manager','Survey Superintendent','Party Chief','Instrument Man','CAD Technician','CAD Lead','Department Manager','Department Lead','Area Viewer','Subcontracts Coordinator','Billing Viewer']){
 test(`custom role rejects reserved system name ${name}`,()=>assert.throws(()=>validateCustomRole({name,baseRole:'REQUESTER'}),{type:'ValidationError'}));
}
test('custom role normalizes human name and inherits only approved template',()=>{
 assert.deepEqual(validateCustomRole({name:'  Construction   Manager  ',baseRole:'VIEWER'}),{name:'Construction Manager',baseRole:'VIEWER'});
 assert.deepEqual(validateCustomRole({name:'Ｐｒｏｊｅｃｔ Coordinator',baseRole:'REQUESTER'}),{name:'Project Coordinator',baseRole:'REQUESTER'});
 for(const baseRole of ['PROJECT_ADMIN','SURVEY_MANAGER','ADMIN',null,[],{}])assert.throws(()=>validateCustomRole({name:'Coordinator',baseRole}),{type:'ValidationError'});
});
test('custom role requires bounded nonempty safe name',()=>{for(const name of ['', '   ', 'x'.repeat(81),null,42,'Bad\u0000Name'])assert.throws(()=>validateCustomRole({name,baseRole:'REQUESTER'}),{type:'ValidationError'});});
