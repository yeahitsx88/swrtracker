import test from 'node:test';
import assert from 'node:assert/strict';
import {parseInvitationCancellation,requireInvitationCancellationAuthority,cancelProjectInvitation,type InvitationCancellationRepository,type InvitationCancellationPreview} from '../../src/modules/identity/application/cancel-project-invitation';
import {assertRecommissioningMutation} from '../../src/lib/recommissioning-gate';
import type {AuthContext} from '../../src/lib/auth';
import type {DbClient,UUID} from '../../src/shared/types';
const auth={tenantId:'tenant' as UUID,userId:'central' as UUID,sessionVersion:1} as AuthContext,project='project' as UUID,invite='11111111-1111-4111-8111-111111111111' as UUID;
const command={snapshot:'a'.repeat(64),reason:'This registration link is no longer required',confirmed:true as const};
test('invitation cancellation requires a reviewed snapshot, reason and deliberate consent',()=>{
 assert.deepEqual(parseInvitationCancellation(command),command);
 for(const bad of [null,[],{...command,confirmed:false},{...command,reason:'short'},{...command,reason:'bad\nreason included'},{...command,snapshot:'stale'},{...command,token:'bearer'}])assert.throws(()=>parseInvitationCancellation(bad),{name:'ValidationError'});
});
function capabilityDb(central=true,company='GC',exists=true):DbClient{return {query:async<T extends object>(sql:string)=>({rows:(sql.includes('COALESCE(session_version')?[{session_version:1,deactivated_at:null}]:[{project_exists:exists,role:'PROJECT_ADMIN',access_disabled_at:null,company_type:company,central_it:central,project_admin:true}]) as T[]})};}
test('independent Project Admin grant and subcontractor admin metadata never confer cancellation authority',async()=>{
 await requireInvitationCancellationAuthority(capabilityDb(),auth,project);
 for(const db of [capabilityDb(false),capabilityDb(true,'SUBCONTRACTOR')])await assert.rejects(()=>requireInvitationCancellationAuthority(db,auth,project),{name:'ForbiddenError'});
 await assert.rejects(()=>requireInvitationCancellationAuthority(capabilityDb(true,'GC',false),auth,project),{name:'NotFoundError'});
});
test('stale and accepted/cancelled/expired invitations do not reach the effect',async()=>{
 const p:InvitationCancellationPreview={id:invite,email:'owned@example.test',role:'REQUESTER',companyName:'Owned company',expiresAt:'2099-01-01',acceptedAt:null,canceledAt:null,projectStatus:'SETUP',canCancel:true,snapshot:command.snapshot};
 let effects=0;const repo:InvitationCancellationRepository={preview:async()=>p,cancel:async()=>{effects++;return {inviteId:invite,canceledAt:'now'};}};
 p.snapshot='b'.repeat(64);await assert.rejects(()=>cancelProjectInvitation(repo,capabilityDb(),auth,project,invite,command),{code:'STALE_INVITATION'});
 p.snapshot=command.snapshot;p.canCancel=false;await assert.rejects(()=>cancelProjectInvitation(repo,capabilityDb(),auth,project,invite,command),{code:'INVITATION_NOT_PENDING'});assert.equal(effects,0);
 p.canCancel=true;assert.deepEqual(await cancelProjectInvitation(repo,capabilityDb(),auth,project,invite,command),{inviteId:invite,canceledAt:'now'});assert.equal(effects,1);
});
test('preparation cancellation permits only invitations in its recorded witness, ordinary creation remains refused',async()=>{
 const db:DbClient={query:async<T extends object>()=>({rows:[{status:'SETUP',id:null,cancellation_id:'cancel',reviewed_evidence:{invitations:[{id:invite}],work:[]}}] as T[]})};
 await assertRecommissioningMutation(db,auth.tenantId,project,`/api/projects/${project}/invites/${invite}/cancel`);
 for(const path of [`/api/projects/${project}/invites`,`/api/projects/${project}/invites/22222222-2222-4222-8222-222222222222/cancel`,`/api/tickets/${invite}/complete`])await assert.rejects(()=>assertRecommissioningMutation(db,auth.tenantId,project,path),{code:'PROJECT_PREPARATION_CANCELLING'});
});
