'use client';

import {useEffect,useRef,useState,useSyncExternalStore,type ReactNode} from 'react';
import {apiRequest} from '@/lib/apiClient';
import {ApiClientError,getErrorMessage} from '@/lib/errors';
import {CommandOwner,FrozenCommand} from '@/lib/frozen-command';
import {useUnsavedProgress} from '@/lib/use-unsaved-progress';
import type {AdminOnboardingCommand} from '@/modules/tenancy/application/admin-onboarding';
import type {AdminEmployee} from '@/modules/tenancy/infrastructure/admin-onboarding.repository';
import type {UUID} from '@/shared/types';
import {type MemberInvitationRole} from '@/modules/tenancy/domain/member-invitation';
import {roleLabel,headingLabel} from '@/lib/display-labels';
import {Button,Card,ErrorBanner,Input,SuccessBanner} from '@/components/ui';
import {Field} from '@/components/forms';
import {AdministrationRecords,AdministrationSection} from './administration-records';
import {AdministrationDialog} from './administration-dialog';
import {CompanyRegistration,type RegisteredCompany} from './company-registration';
import './project-admin-onboarding.css';
import {OperationalRolePicker} from './operational-role-picker';
import {HomeOrganization} from './home-organization';

type Purpose='PROJECT_ADMIN'|'EMPLOYEE';
interface Invitation {
 id:string;email:string;companyName:string;status:string;expiresAt:string;
 purpose:Purpose;role:string;registrationPath:string|null;employee:AdminEmployee|null;
}
interface Directory {
 employees:AdminEmployee[];total:number;companies:RegisteredCompany[];tenantCompanies:RegisteredCompany[];canManageHomeOrganization:boolean;
 invitations:Invitation[];administrators:Array<{userId:string;name:string;companyName:string}>;
}
interface Review {command:AdminOnboardingCommand;title:string;detail:string}
type Screen='choose'|'company'|'email'|'role'|'employee'|'review'|'result';

export function ProjectAdminOnboarding({projectId,owner,disabled,onDone,accessContent,variant='admin'}:{
 projectId:string;owner:CommandOwner;disabled:boolean;onDone:()=>void;variant?:'admin'|'member';accessContent?:ReactNode;
}) {
 const memberMode=variant==='member',endpoint=`/api/projects/${projectId}/admin-onboarding`,token=memberMode?'member-invitation':'project-admin-onboarding';
 useSyncExternalStore(owner.subscribe,owner.snapshot,owner.snapshot);
 const gate=useRef(new FrozenCommand<Review>()).current,generation=useRef(0);
 const [data,setData]=useState<Directory>(),[open,setOpen]=useState(false),[screen,setScreen]=useState<Screen>('choose');
 const [purpose,setPurpose]=useState<Purpose>('PROJECT_ADMIN'),[mode,setMode]=useState<'invite'|'existing'>('invite');
 const [memberRole,setMemberRole]=useState<MemberInvitationRole>('REQUESTER');
 const [companyKind,setCompanyKind]=useState<'tenant'|'existing'>('tenant'),[company,setCompany]=useState<RegisteredCompany>();
 const [designatingHome,setDesignatingHome]=useState(false);
 const [creatingCompany,setCreatingCompany]=useState(false),[search,setSearch]=useState(''),[companySearch,setCompanySearch]=useState(''),[offset,setOffset]=useState(0);
 const [email,setEmail]=useState(''),[loading,setLoading]=useState(true),[error,setError]=useState<string>(),[success,setSuccess]=useState<string>();
 const [review,setReview]=useState<Review>(),[consent,setConsent]=useState(false),[revision,setRevision]=useState(0),[,render]=useState(0);
 const [renewal,setRenewal]=useState(false),[resultInviteId,setResultInviteId]=useState<string>();
 const blocked=disabled||owner.blocked(token),locked=blocked||gate.locked||creatingCompany||designatingHome;
 const resultInvite=data?.invitations.find(i=>i.id===resultInviteId);
 const ready=data?.invitations.filter(i=>i.status==='Accepted'&&i.employee&&!i.employee.canAdminister)??[];
 useUnsavedProgress(gate.locked);

 useEffect(()=>{
  const epoch=++generation.current;setLoading(true);
  const timer=setTimeout(()=>void apiRequest<Directory>(`${endpoint}?${new URLSearchParams({search,companySearch,offset:String(offset)})}`)
   .then(value=>{if(epoch===generation.current){setData(value);setError(undefined);}})
   .catch(cause=>{if(epoch===generation.current)setError(getErrorMessage(cause,'Unable to load Project Admin setup. Refresh to try again.'));})
   .finally(()=>{if(epoch===generation.current)setLoading(false);}),200);
  return()=>{clearTimeout(timer);generation.current++;};
 },[endpoint,search,companySearch,offset,revision]);

 useEffect(()=>{if(screen==='company'&&companyKind==='tenant'&&!gate.locked&&!designatingHome)setCompany(data?.tenantCompanies[0]);},[data,screen,companyKind,designatingHome,gate]);

 function start() {
  if(locked||!owner.claim(token))return;
  setOpen(true);setScreen(memberMode?'company':'choose');setMode('invite');setPurpose(memberMode?'EMPLOYEE':'PROJECT_ADMIN');setCompanyKind('tenant');
  setMemberRole('REQUESTER');setCompany(memberMode&&data?.tenantCompanies.length===1?data.tenantCompanies[0]:undefined);setEmail('');setCompanySearch('');setSearch('');setOffset(0);
  setReview(undefined);setConsent(false);setError(undefined);setSuccess(undefined);setRenewal(false);setResultInviteId(undefined);
 }
 function close(){
  if(blocked||creatingCompany||designatingHome||!gate.reload())return;
  owner.release(token);setOpen(false);setReview(undefined);setConsent(false);setError(undefined);setRevision(n=>n+1);
 }
 function reload(){
  if(blocked||creatingCompany||designatingHome||!gate.reload())return;
  setReview(undefined);setConsent(false);setScreen(memberMode?'company':'choose');setCompany(undefined);setResultInviteId(undefined);setError(undefined);setRevision(n=>n+1);render(n=>n+1);
 }
 function propose(value:Review) {
  if(locked||loading||!owner.claim(token))return;
  setReview(value);setConsent(false);setSuccess(undefined);setError(undefined);setOpen(true);setScreen('review');
 }
 function assign(person:AdminEmployee) {
  setMode('existing');setPurpose('PROJECT_ADMIN');
  propose({command:{action:'GRANT',userId:person.userId,companyId:person.companyId,expectedRole:person.role,confirmed:true},
   title:`Assign ${person.name} as Project Admin`,
   detail:`${person.email} · ${person.companyName}. ${person.role?'Their operational role is preserved.':'Requester membership and company association will be added.'} They will administer this project. Other projects are unchanged.`});
 }
 function reviewInvite(){
  if(!company||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))return;
  propose({command:{action:'INVITE',companyId:company.id as UUID,email:email.trim().toLowerCase(),purpose,...(companyKind==='tenant'?{expectedHomeCompanyId:company.id as UUID}:{}),...(memberMode?{role:memberRole}:{}),confirmed:true},
   title:purpose==='PROJECT_ADMIN'?'Review Project Admin Invitation':'Review Project Member Invitation',
   detail:`${email.trim()} · ${company.name}. The employee must accept the link and create their profile. ${memberMode?`Acceptance grants ${roleLabel(memberRole)} membership on this project.`:'Acceptance adds Requester membership. Return here to assign Project Admin after acceptance.'} This invitation does not grant administration. The link expires in seven days.`});
 }
 async function submit() {
  if(!review||!consent||blocked||creatingCompany||designatingHome||!owner.claim(token))return;
  const frozen=gate.begin(review,crypto.randomUUID());if(!frozen)return;render(n=>n+1);setError(undefined);
  try {
   const result=await apiRequest<{action:string;signInRenewal?:boolean;inviteId?:string}>(endpoint,{method:'POST',body:frozen.body.command,headers:{'Idempotency-Key':frozen.key}});
   gate.success();setScreen('result');setReview(undefined);setConsent(false);setResultInviteId(result.inviteId);
   setSuccess(result.action==='INVITE'?'Invitation ready. Share the link, then check acceptance here.':result.action==='CANCEL_INVITE'?'Invitation canceled. Its link can no longer be accepted.':'Project Admin assigned. They can sign in and open this project’s administration.');
   setRenewal(!!result.signInRenewal);
   if(result.signInRenewal)setSuccess('Project Admin assigned to your account. Sign in again to continue.');
   else {setRevision(n=>n+1);onDone();}
  } catch(cause){gate.fail(cause instanceof ApiClientError?cause.status:undefined);setError(getErrorMessage(cause,'The outcome is uncertain. Retry this same action.'));}
  finally {render(n=>n+1);}
 }
 async function copyLink(path:string){
  try{await navigator.clipboard.writeText(new URL(path,window.location.origin).href);setSuccess('Invitation link copied. Share it with the intended employee.');}
  catch{setError('Unable to copy the link. Select and copy the invitation link below.');}
 }
 function chooseTenant(){setCompanyKind('tenant');setCompany(data?.tenantCompanies.length===1?data.tenantCompanies[0]:undefined);}
 function returnCompany(created?:RegisteredCompany){
  setCreatingCompany(false);
  if(created){setCompanyKind('existing');setCompany(created);setCompanySearch('');setRevision(n=>n+1);}
 }
 const total=mode==='invite'?5:4;
 const current=memberMode?screen==='company'?1:screen==='email'?2:screen==='role'?3:screen==='review'?4:5:screen==='choose'?1:screen==='company'||screen==='employee'?2:screen==='email'?3:screen==='review'?total-1:total;
 const labels:Record<Screen,string>={choose:'Choose how to start',company:'Employee company',email:'Employee email',role:'Operational role',employee:'Select employee',review:'Review',result:resultInviteId?'Invitation status':'Complete'};
 const emailValid=/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
 const companyChoices=companyKind==='tenant'?data?.tenantCompanies??[]:data?.companies??[];
 const visibleCompanies=company&&!companyChoices.some(c=>c.id===company.id)?[company,...companyChoices]:companyChoices;
 const canDismiss=!blocked&&!creatingCompany&&!designatingHome&&!gate.pending&&(!gate.command||gate.stale);

 const content=<>
  <div className="stack">
   {!open&&error&&<ErrorBanner message={error}/>}
   {!open&&success&&<SuccessBanner message={success}/>}
   {!memberMode&&!!data?.administrators.length&&<p role="status"><strong>Project Admin assigned:</strong> {data.administrators.map(p=>`${p.name} (${p.companyName})`).join(', ')}.</p>}
   {!memberMode&&!loading&&!data?.administrators.length&&<p>No Project Admin is assigned yet.{ready.length?' An accepted invitation is ready for assignment.':''}</p>}
   <div className="row"><Button disabled={locked||open} onClick={start}>{memberMode?'Invite a new project member':data?.administrators.length?'Set up another Project Admin':'Set up Project Admin'}</Button><Button variant="secondary" disabled={locked||open||loading} onClick={()=>setRevision(n=>n+1)}>Check invitation status</Button></div>
   <AdministrationSection title={memberMode?'Project Member Invitations':'Invitations and Next Steps'} open={!memberMode} help="Shows this invitation type within the latest 50 setup invitations. Filtering, selection and export apply to these loaded records. Accepted Project Admin candidates can be assigned from their invitation.">
    <AdministrationRecords label={memberMode?'project member invitations':'Project Admin setup invitations'} rows={data?.invitations.filter(i=>i.purpose===(memberMode?'EMPLOYEE':'PROJECT_ADMIN'))??[]} id={i=>i.id} disabled={locked||open||loading}
     columns={[{key:'email',label:'Employee',text:i=>i.employee?`${i.employee.name} · ${i.email}`:i.email},{key:'company',label:'Company',text:i=>i.companyName},
      {key:'purpose',label:memberMode?'Invited role':'Purpose',text:i=>memberMode?roleLabel(i.role):'Project Admin'},
      {key:'status',label:'Next step',text:i=>memberMode?i.status==='Accepted'?i.employee?'Member active':'Profile unavailable · review access':i.status==='Pending'?'Awaiting profile acceptance':i.status:i.employee?.canAdminister?'Project Admin assigned':i.status==='Accepted'?i.employee?'Ready to assign Project Admin':'Profile unavailable · review access':i.status==='Pending'?'Awaiting profile acceptance':i.status},
      {key:'expiry',label:'Link expires',text:i=>new Date(i.expiresAt).toLocaleString()}]}
     actions={i=>!memberMode&&i.employee&&!i.employee.canAdminister?<Button disabled={locked||open||loading} onClick={()=>assign(i.employee!)}>Assign Project Admin</Button>:i.registrationPath?<>
      <Button variant="secondary" disabled={locked||open} onClick={()=>void copyLink(i.registrationPath!)}>Copy invitation link</Button>
      <Button variant="secondary" disabled={locked||open||loading} onClick={()=>{if(!owner.claim(token))return;setResultInviteId(i.id);setPurpose(i.purpose);setMode('invite');setScreen('result');setSuccess(undefined);setError(undefined);setOpen(true);}}>Continue invitation</Button>
      <Button variant="secondary" disabled={locked||open||loading} onClick={()=>propose({command:{action:'CANCEL_INVITE',inviteId:i.id as UUID,confirmed:true},title:`Cancel invitation for ${i.email}`,detail:'The pending link will stop working. Existing accounts and project memberships are preserved.'})}>Cancel invitation</Button>
     </>:null}/>
   </AdministrationSection>
   {!memberMode&&accessContent}
  </div>
  {open&&<AdministrationDialog title={screen==='review'?review?.title??'Review assignment':screen==='result'?resultInviteId?'Invitation and Acceptance':'Project Admin Setup Completed':memberMode?'Invite a Project Member':'Set Up Project Admin'}
   step={{current,total,label:headingLabel(labels[screen])}} size={screen==='employee'?'wide':'standard'} onClose={close} closeDisabled={!canDismiss}
   footer={screen==='result'?<Button disabled={!canDismiss} onClick={close}>Close</Button>:screen==='review'?<>
    <Button variant="secondary" disabled={!canDismiss} onClick={gate.stale?reload:close}>{gate.stale?'Reload setup':'Cancel'}</Button>
    <div className="row"><Button variant="secondary" disabled={locked} onClick={()=>{setReview(undefined);setConsent(false);setScreen(memberMode?'role':mode==='invite'?'email':'employee');}}>Back</Button>
    <Button disabled={!consent||blocked||creatingCompany||designatingHome||gate.pending||gate.stale} onClick={()=>void submit()}>{gate.pending?'Submitting…':gate.command?'Retry same action':review?.command.action==='INVITE'?'Create invitation':review?.command.action==='GRANT'?'Assign Project Admin':'Cancel invitation'}</Button></div>
   </>:<><Button variant="secondary" disabled={locked} onClick={close}>Cancel</Button><div className="row">
    {screen!=='choose'&&!(memberMode&&screen==='company')&&<Button variant="secondary" disabled={locked} onClick={()=>setScreen(screen==='role'?'email':screen==='email'?'company':'choose')}>Back</Button>}
    {screen==='company'&&<Button disabled={locked||loading||!company} onClick={()=>setScreen('email')}>Next</Button>}
    {screen==='email'&&<Button disabled={locked||loading||!emailValid||!company} onClick={memberMode?()=>setScreen('role'):reviewInvite}>{memberMode?'Next':'Review invitation'}</Button>}
    {screen==='role'&&<Button disabled={locked||loading||!emailValid||!company} onClick={reviewInvite}>Review invitation</Button>}
   </div></>}>
   {error&&<ErrorBanner message={error}/>} {loading&&<p role="status">Refreshing setup status…</p>}
   {screen==='choose'&&<>
    <p>Choose who will administer this project. If they are new, invite them first; assign Project Admin when their profile is ready.</p>
    <div className="admin-setup-options">
     <div><h3>Invite Your Future Project Admin</h3><p>Choose their company and email. Track acceptance here, then assign them.</p><Button disabled={locked||loading} onClick={()=>{setPurpose('PROJECT_ADMIN');setMode('invite');chooseTenant();setScreen('company');}}>Invite a Project Admin candidate</Button></div>
     <div><h3>Use an Existing Employee</h3><p>Select a person whose tenant profile already exists and review the assignment.</p><Button variant="secondary" disabled={locked||loading} onClick={()=>{setMode('existing');setPurpose('PROJECT_ADMIN');setScreen('employee');}}>Choose an existing employee</Button></div>
    </div>
   </>}
   {screen==='company'&&<>
    <p>Which company does this employee work for?</p>
    <fieldset className="admin-company-choice"><legend>Employee company source</legend>
     <label className="checkbox-row"><input type="radio" name="admin-company-source" checked={companyKind==='tenant'} disabled={locked} onChange={chooseTenant}/><span>Tenant company</span></label>
     <label className="checkbox-row"><input type="radio" name="admin-company-source" checked={companyKind==='existing'} disabled={locked} onChange={()=>{setCompanyKind('existing');setCompany(undefined);}}/><span>Previously created company</span></label>
    </fieldset>
    {companyKind==='tenant'?<p className="muted">The tenant’s designated home organization. Tenant IT manages this tenant-wide choice.</p>:<Field label="Search previously created companies"><Input value={companySearch} maxLength={100} disabled={locked} onChange={e=>{setCompanySearch(e.target.value);setCompany(undefined);}}/></Field>}
    <Field label="Employee company"><select className="select" value={company?.id??''} disabled={locked||loading||companyKind==='tenant'} onChange={e=>setCompany(visibleCompanies.find(c=>c.id===e.target.value))}>
     <option value="">Choose a company</option>{visibleCompanies.map(c=><option key={c.id} value={c.id}>{c.name} · {c.type==='GC'?'General contractor':'Owner representative'}</option>)}
    </select></Field>
    {!loading&&!visibleCompanies.length&&<p>No eligible company found. Tenant IT can designate a home organization; alternatively, choose or create another company.</p>}
    {companyKind==='tenant'&&data?.canManageHomeOrganization&&<Button variant="secondary" disabled={locked||loading} onClick={()=>setDesignatingHome(true)}>{data.tenantCompanies.length?'Change Home Organization':'Set Home Organization'}</Button>}
    {companyKind==='existing'&&<div><Button variant="secondary" disabled={locked||loading} onClick={()=>setCreatingCompany(true)}>Create new company</Button><p className="muted">Return here with the new company selected. Your invitation details are kept.</p></div>}
    {companyKind==='existing'&&<p className="muted">Up to 100 matching internal companies. Narrow your search to find another company.</p>}
   </>}
   {screen==='email'&&<>
    <p><strong>Company:</strong> {company?.name}</p>
    <Field label="Employee email"><Input type="email" value={email} maxLength={254} disabled={locked} onChange={e=>setEmail(e.target.value)}/></Field>
    <p>The employee will use their invitation link to create a profile and password.{!memberMode?' You will assign Project Admin after acceptance.':''}</p>
    <p className="muted">Local demo delivery: copy and share the link. No email is sent by this demo.</p>
   </>}
   {screen==='role'&&<OperationalRolePicker label="Operational Role on This Project" value={memberRole} disabled={locked} onChange={setMemberRole}/>}
   {screen==='employee'&&<>
    <Field label="Search employee name or email"><Input value={search} maxLength={100} disabled={locked} onChange={e=>{setSearch(e.target.value);setOffset(0);}}/></Field>
    <p className="muted">Choose an active general contractor or owner representative employee. Tenant IT can search across the tenant; Project Admins use this project's companies.</p>
    {!loading&&data?.employees.length===0&&<><p>No eligible employees found. Disabled accounts and project access require a separate review.</p><Button variant="secondary" disabled={locked} onClick={()=>{setMode('invite');chooseTenant();setScreen('company');}}>Invite a new candidate</Button></>}
    <AdministrationRecords picker label="eligible employees on this page" rows={data?.employees??[]} id={p=>p.userId} disabled={locked||loading}
     columns={[{key:'name',label:'Name',text:p=>p.name},{key:'email',label:'Email',text:p=>p.email},{key:'company',label:'Company',text:p=>p.companyName},{key:'role',label:'Project role',text:p=>p.role?roleLabel(p.role):'No membership'}]}
     actions={p=>p.canAdminister?<span>Already Project Admin</span>:<Button variant="secondary" disabled={locked||loading} onClick={()=>assign(p)}>Select employee</Button>}/>
    <div className="row"><Button variant="secondary" disabled={locked||loading||offset===0} onClick={()=>setOffset(n=>Math.max(0,n-25))}>Previous employee page</Button><span role="status">{data?.employees.length?offset+1:0}–{offset+(data?.employees.length??0)} of {data?.total??0}</span><Button variant="secondary" disabled={locked||loading||(data?.employees.length??0)<25||offset+25>=(data?.total??0)} onClick={()=>setOffset(n=>n+25)}>Next employee page</Button></div>
   </>}
   {screen==='review'&&<>
    <p>{review?.detail}</p>
    <label className="checkbox-row"><input type="checkbox" checked={consent} disabled={locked} onChange={e=>setConsent(e.target.checked)}/><span>I confirm this {review?.command.action==='GRANT'?'Project Admin assignment':'invitation action'} for this project.</span></label>
    {gate.stale&&<p role="alert">State changed. Reload setup and review the current employee or invitation again.</p>}
   </>}
   {screen==='result'&&<>
    {success&&<SuccessBanner message={success}/>}
    {renewal&&<a className="app-link" href="/login">Sign in again</a>}
    {resultInviteId&&(resultInvite?<>
     <dl className="administration-dialog-summary"><div><dt>Employee</dt><dd>{resultInvite.email}</dd></div><div><dt>Company</dt><dd>{resultInvite.companyName}</dd></div>{memberMode&&<div><dt>Invited role</dt><dd>{roleLabel(resultInvite.role)}</dd></div>}<div><dt>Progress</dt><dd>{!memberMode&&resultInvite.employee?.canAdminister?'Project Admin assigned':resultInvite.status==='Accepted'?'Profile accepted':resultInvite.status==='Pending'?'Awaiting profile acceptance':resultInvite.status}</dd></div></dl>
     {resultInvite.registrationPath&&<><Field label="Employee invitation link"><Input readOnly value={new URL(resultInvite.registrationPath,window.location.origin).href} onFocus={e=>e.currentTarget.select()}/></Field><Button variant="secondary" disabled={locked} onClick={()=>void copyLink(resultInvite.registrationPath!)}>Copy invitation link</Button><p className="muted">No email was sent. Share this link with {resultInvite.email}. For this walkthrough, open it in a separate browser session.</p></>}
     {memberMode&&resultInvite.employee?<SuccessBanner message={`${resultInvite.employee.name} is a project member. Current role: ${roleLabel(resultInvite.employee.role??resultInvite.role)}.`}/>:!memberMode&&resultInvite.employee&&!resultInvite.employee.canAdminister?<><p>The employee has created their profile. Review their assignment to finish setup.</p><Button disabled={locked||loading} onClick={()=>assign(resultInvite.employee!)}>Assign Project Admin</Button></>:resultInvite.status==='Pending'?<><p>After they accept, check their profile here.</p><Button variant="secondary" disabled={locked||loading} onClick={()=>{setRevision(n=>n+1);onDone();}}>Check acceptance and continue</Button></>:resultInvite.status==='Accepted'&&!resultInvite.employee?<p role="alert">This profile is not eligible for assignment. Review current account and project access before continuing.</p>:null}
    </>:<><p role="status">{loading?'Loading invitation status…':'Invitation status could not be loaded.'}</p><Button variant="secondary" disabled={locked||loading} onClick={()=>setRevision(n=>n+1)}>Reload invitation status</Button></>)}
   </>}
   {designatingHome&&<HomeOrganization owner={owner} disabled={blocked} onDone={onDone} continuation={{token,onReturn:created=>{setDesignatingHome(false);if(created){setCompanyKind('tenant');setCompany(created);setData(current=>current?{...current,tenantCompanies:[created]}:current);setRevision(n=>n+1);}}}}/>}
   {creatingCompany&&<CompanyRegistration projectId={projectId} owner={owner} disabled={blocked} onDone={onDone} continuation={{token,onReturn:returnCompany}}/>}
  </AdministrationDialog>}
 </>;
 return memberMode?<div className="stack">{content}</div>:<Card title="Project Admin Setup" help={<><p>Invite a person, wait for their profile, then assign them to administer this project.</p><ol><li>Choose company and invite.</li><li>Employee accepts and creates their profile.</li><li>Review and assign Project Admin.</li></ol></>}>{content}</Card>;
}
