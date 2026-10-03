import test from 'node:test';
import assert from 'node:assert/strict';
import type {UUID,DbClient} from '@/shared/types';
import type {AuthContext} from '@/lib/auth';
import {ValidationError,ConflictError} from '@/shared/errors';
import {parseManagerAppointment,managerSelection,appointSurveyManager,type ManagerPreview,type ManagerAppointmentRepository} from '@/modules/tenancy/application/appoint-survey-manager';
import {SurveyManagerPgRepository} from '@/modules/tenancy/infrastructure/survey-manager.repository';
const id=(n:number)=>`99010000-0000-4000-8000-${String(n).padStart(12,'0')}` as UUID;
const body={outgoingUserId:id(1),incomingUserId:id(2),coverageUserId:id(3),snapshot:'a'.repeat(64),reason:'Permanent promotion after departure',confirmed:true};
function fixture(){const preview:ManagerPreview={snapshot:body.snapshot,outgoing:{userId:id(1),name:'Sam'},incoming:{userId:id(2),name:'Taylor'},coverage:{userId:id(3),name:'Morgan'},areaIds:[id(4)],reportingLinkIds:[id(5)],blockers:[]};let writes=0;
 const repo:ManagerAppointmentRepository={preview:async()=>preview,appoint:async()=>{writes++;return {eventId:id(6),incomingUserId:id(2),coverageUserId:id(3)};}};
 return {preview,repo,writes:()=>writes};}
test('manager appointment binds three different selected identities and explicit confirmation',()=>{
 assert.deepEqual(parseManagerAppointment(body),body);
 for(const change of [{confirmed:false},{reason:''},{reason:'bad\nreason'},{snapshot:'x'.repeat(64)},{incomingUserId:id(1)},{coverageUserId:'bad'},{role:'TENANT_ADMIN'}])assert.throws(()=>parseManagerAppointment({...body,...change}),ValidationError);
 assert.throws(()=>managerSelection({}),ValidationError);assert.throws(()=>parseManagerAppointment(null),ValidationError);
});
test('fresh unblocked appointment delegates one atomic effect with retained selections',async()=>{const f=fixture();const result=await appointSurveyManager(f.repo,{} as DbClient,{} as AuthContext,id(10),parseManagerAppointment(body));assert.equal(result.incomingUserId,id(2));assert.equal(f.writes(),1);});
test('stale manager preview does not transfer coverage or change roles',async()=>{const f=fixture();f.preview.snapshot='b'.repeat(64);await assert.rejects(appointSurveyManager(f.repo,{} as DbClient,{} as AuthContext,id(10),parseManagerAppointment(body)),ConflictError);assert.equal(f.writes(),0);});
test('protected role obligations block appointment without effects',async()=>{const f=fixture();f.preview.blockers=['Resolve responsibility duties'];await assert.rejects(appointSurveyManager(f.repo,{} as DbClient,{} as AuthContext,id(10),parseManagerAppointment(body)),ConflictError);assert.equal(f.writes(),0);});
test('preview checksum binds state and selections, excluding command reason and confirmation',async()=>{
 const db={query:async(sql:string)=>{
  if(sql.startsWith('SELECT status'))return {rows:[{status:'ACTIVE',crew_build:'FULL'}]};
  if(sql.startsWith('SELECT u.id'))return {rows:[{user_id:id(1),name:'Sam',role:'SURVEY_MANAGER'},{user_id:id(2),name:'Taylor',role:'SURVEY_SUPERINTENDENT'},{user_id:id(3),name:'Morgan',role:'SURVEY_SUPERINTENDENT'}]};
  if(sql.startsWith('WITH'))return {rows:[{token:'a'.repeat(32)}]};
  return {rows:[]};
 }} as unknown as DbClient,repo=new SurveyManagerPgRepository(),auth={tenantId:id(20)} as AuthContext;
 const read=await repo.preview(db,auth,id(10),managerSelection(body)),command=await repo.preview(db,auth,id(10),parseManagerAppointment(body));
 assert.equal(read.snapshot,command.snapshot);
});
