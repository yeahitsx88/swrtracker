import assert from 'node:assert/strict';
import test from 'node:test';
import {parseSuperintendentAreaReadQuery as parse} from '@/modules/tenancy/application/read-superintendent-areas';
import {ValidationError} from '@/shared/errors';
const id=(n:number)=>`99010000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('superintendent Area query normalizes IDs and retains bounded mode selection',async()=>{
 assert.deepEqual(parse(new URLSearchParams(`mode=superintendent-areas&superintendentId=${id(11).toUpperCase()}`)),{mode:'superintendent-areas',superintendentId:id(11),query:{search:'',limit:25,offset:0}});
 for(const mode of ['superintendent-area-replacements','superintendent-area-reporting'])assert.deepEqual(parse(new URLSearchParams({mode,superintendentId:id(11),linkId:id(40),limit:'10',offset:'50',search:' Jason '})),{mode,superintendentId:id(11),linkId:id(40),query:{search:'Jason',limit:10,offset:50}});
});
test('superintendent Area query refuses unknown duplicate malformed and unbounded filters',async()=>{
 const base=`mode=superintendent-areas&superintendentId=${id(11)}`;
 for(const extra of ['&mode=superintendent-areas','&superintendentId='+id(12),'&linkId='+id(40),'&actorRole=SURVEY_MANAGER','&limit=11','&offset=-1','&offset=9007199254740992','&search='+encodeURIComponent('x'.repeat(201)),'&search=%00','&search=%0A'])assert.throws(()=>parse(new URLSearchParams(base+extra)),ValidationError);
 for(const value of ['mode=superintendent-areas','mode=superintendent-area-reporting&superintendentId='+id(11),base.replace(id(11),'wrong'),base.replace('superintendent-areas','unknown')])assert.throws(()=>parse(new URLSearchParams(value)),ValidationError);
});
