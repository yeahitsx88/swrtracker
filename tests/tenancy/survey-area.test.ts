import assert from 'node:assert/strict';
import {test} from 'node:test';
import {parseNewSurveyArea} from '../../src/modules/tenancy/application/create-survey-area';

test('Survey Area input normalizes names and codes',()=>{
  assert.deepEqual(parseNewSurveyArea({name:' Area C ',code:' area-c '}),{name:'Area C',code:'AREA-C'});
});
test('Survey Area input rejects missing, oversized and unsafe display values',()=>{
  for(const value of [null,{}, {name:' ',code:'A'}, {name:'x'.repeat(101),code:'A'}, {name:'Area\nC',code:'A'}, {name:'Area',code:'A B'}, {name:'Area',code:'A'.repeat(21)}]) {
    assert.throws(()=>parseNewSurveyArea(value));
  }
});
