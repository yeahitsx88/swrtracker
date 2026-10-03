'use client';
import {useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {apiRequest} from '@/lib/apiClient';
import {ApiClientError,getErrorMessage} from '@/lib/errors';
import {CommandOwner,FrozenCommand} from '@/lib/frozen-command';
import {useUnsavedProgress} from '@/lib/use-unsaved-progress';
import type {AdminOnboardingCommand} from '@/modules/tenancy/application/admin-onboarding';
import type {AdminEmployee} from '@/modules/tenancy/infrastructure/admin-onboarding.repository';
import type {UUID} from '@/shared/types';
import {Button,Card,ErrorBanner,Input,SuccessBanner} from '@/components/ui';
import {Field} from '@/components/forms';
import {AdministrationRecords,AdministrationSection} from './administration-records';
import {AdministrationDialog} from './administration-dialog';
interface Invitation {id:string;email:string;companyName:string;status:string;expiresAt:string;registrationPath:string|null}
interface Directory {employees:AdminEmployee[];total:number;companies:Array<{id:string;name:string;type:string}>;invitations:Invitation[]}
interface Review {command:AdminOnboardingCommand;title:string;detail:string}
export function ProjectAdminOnboarding({projectId,owner,disabled,onDone}:{projectId:string;owner:CommandOwner;disabled:boolean;onDone:()=>void}) {
 const endpoint=`/api/projects/${projectId}/admin-onboarding`,token='project-admin-onboarding';
 useSyncExternalStore(owner.subscribe,owner.snapshot,owner.snapshot);
 const gate=useRef(new FrozenCommand<Review>()).current,generation=useRef(0);
 const [data,setData]=useState<Directory>(),[mode,setMode]=useState<'existing'|'invite'>('existing'),[open,setOpen]=useState(false),[step,setStep]=useState(0);
 const [search,setSearch]=useState(''),[companySearch,setCompanySearch]=useState(''),[offset,setOffset]=useState(0);
 const [email,setEmail]=useState(''),[companyId,setCompanyId]=useState('');
 const [loading,setLoading]=useState(true),[error,setError]=useState<string>(),[success,setSuccess]=useState<string>();
 const [review,setReview]=useState<Review>(),[consent,setConsent]=useState(false),[revision,setRevision]=useState(0),[,render]=useState(0);
 const [completed,setCompleted]=useState(false),[renewal,setRenewal]=useState(false),[resultInviteId,setResultInviteId]=useState<string>();
 const blocked=disabled||owner.blocked(token),locked=blocked||gate.locked,formLocked=locked||!!review||completed;
 useUnsavedProgress(gate.locked);
 useEffect(()=>{
  const epoch=++generation.current;setLoading(true);
  const timer=setTimeout(()=>void apiRequest<Directory>(`${endpoint}?${new URLSearchParams({search,companySearch,offset:String(offset)})}`)
   .then(value=>{if(epoch===generation.current){setData(value);setError(undefined);}})
   .catch(cause=>{if(epoch===generation.current)setError(getErrorMessage(cause,'Unable to load employees. Refresh the directory.'));})
   .finally(()=>{if(epoch===generation.current)setLoading(false);}),200);
  return()=>{clearTimeout(timer);generation.current++;};
 },[endpoint,search,companySearch,offset,revision]);
 function start(nextMode:'existing'|'invite') {
  if(formLocked||!owner.claim(token))return;
  setMode(nextMode);setOpen(true);setStep(0);setReview(undefined);setConsent(false);setError(undefined);setSuccess(undefined);setCompleted(false);setResultInviteId(undefined);
 }
 function propose(value:Review) {
  if(formLocked||!owner.claim(token))return;
  setReview(value);setConsent(false);setSuccess(undefined);setError(undefined);setOpen(true);setStep(2);
 }
 function close(){if(blocked||!gate.reload())return;owner.release(token);setOpen(false);setReview(undefined);setConsent(false);setCompleted(false);setError(undefined);setRevision(n=>n+1);}
 function reload(){if(blocked||!gate.reload())return;setReview(undefined);setConsent(false);setStep(0);setError(undefined);setRevision(n=>n+1);}
 async function submit() {
  if(!review||!consent||blocked||!owner.claim(token))return;
  const frozen=gate.begin(review,crypto.randomUUID());if(!frozen)return;render(n=>n+1);setError(undefined);
  try {
   const result=await apiRequest<{action:string;signInRenewal?:boolean;inviteId?:string}>(endpoint,{method:'POST',body:frozen.body.command,headers:{'Idempotency-Key':frozen.key}});
   gate.success();setCompleted(true);setReview(undefined);setConsent(false);setResultInviteId(result.inviteId);
   setSuccess(result.action==='INVITE'?'Invitation created. Share its link with the employee. Once they create a profile, refresh employees and review their Project Admin grant.':result.action==='CANCEL_INVITE'?'Invitation canceled. Its link can no longer be accepted.':'Project Admin granted. The employee must sign in again to use the new authority.');
   if(result.signInRenewal){setRenewal(true);setSuccess('Project Admin granted to your account. Sign in again to continue.');}
   else {setRevision(n=>n+1);onDone();}
  } catch(cause){gate.fail(cause instanceof ApiClientError?cause.status:undefined);setError(getErrorMessage(cause,'The outcome is uncertain. Retry this same action.'));}
  finally {render(n=>n+1);}
 }
 async function copyLink(path:string){try{await navigator.clipboard.writeText(new URL(path,window.location.origin).href);setSuccess('Invitation link copied. Send it to the intended employee.');}catch{setError('Unable to copy the link. Open the invitation or copy its address.');}}
 const emailValid=/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
 const createdInvite=data?.invitations.find(i=>i.id===resultInviteId);
 function reviewInvite(){const company=data?.companies.find(c=>c.id===companyId);if(!company)return;propose({command:{action:'INVITE',companyId:company.id as UUID,email:email.trim().toLowerCase(),confirmed:true},title:`Invite ${email.trim()}`,detail:`Company: ${company.name}. Their company will be associated with this project. This link expires in seven days and grants Requester access on acceptance. Project Admin requires a later reviewed grant.`});}
 return <Card title="Establish a Project Admin" description="Select an existing employee, or invite someone to create a profile first."><div className="stack">
  {!open&&error&&<ErrorBanner message={error}/>} {!open&&success&&<SuccessBanner message={success}/>}
  <div className="row"><Button disabled={formLocked||open} onClick={()=>start('existing')}>Select existing employee</Button><Button variant="secondary" disabled={formLocked||open} onClick={()=>start('invite')}>Invite new employee</Button><Button variant="secondary" disabled={formLocked||open||loading} onClick={()=>setRevision(n=>n+1)}>Refresh employees and invitations</Button></div>
  {open&&<AdministrationDialog title={completed?'Onboarding action completed':review?review.title:mode==='existing'?'Select a Project Admin':'Invite a new employee'}
   step={{current:completed?mode==='invite'?4:3:review?mode==='invite'?3:2:mode==='invite'?step+1:1,total:mode==='invite'?4:3,label:completed?'Complete':review?'Review':mode==='invite'?step===0?'Employee email':'Employee company':'Choose employee'}}
   onClose={close} closeDisabled={blocked||gate.pending||!!gate.command&&!gate.stale}
   footer={completed?<Button onClick={close}>Close</Button>:review?<><Button variant="secondary" disabled={blocked||gate.pending||!!gate.command&&!gate.stale} onClick={gate.stale?reload:close}>{gate.stale?'Reload onboarding':'Cancel'}</Button><div className="row"><Button variant="secondary" disabled={locked} onClick={()=>{setReview(undefined);setConsent(false);setStep(mode==='invite'?1:0);}}>Back</Button><Button disabled={!consent||blocked||gate.pending||gate.stale} onClick={()=>void submit()}>{gate.pending?'Submitting…':gate.command?'Retry same action':'Confirm action'}</Button></div></>:<><Button variant="secondary" disabled={locked} onClick={close}>Cancel</Button>{mode==='invite'&&<div className="row">{step>0&&<Button variant="secondary" disabled={locked} onClick={()=>setStep(0)}>Back</Button>}<Button disabled={locked||loading||(step===0?!emailValid:!companyId)} onClick={()=>step===0?setStep(1):reviewInvite()}>Next</Button></div>}</>}>
   {error&&<ErrorBanner message={error}/>} {loading&&!completed&&<p role="status">Loading employee directory…</p>}
   {completed?<><SuccessBanner message={success??'Action completed.'}/>{renewal&&<a className="app-link" href="/login">Sign in again</a>}{resultInviteId&&(createdInvite?.registrationPath?<><Field label="Employee invitation link"><Input readOnly value={new URL(createdInvite.registrationPath,window.location.origin).href} onFocus={e=>e.currentTarget.select()}/></Field><div className="row"><Button variant="secondary" onClick={()=>void copyLink(createdInvite.registrationPath!)}>Copy invitation link</Button><a className="app-link" href={createdInvite.registrationPath} target="_blank" rel="noopener noreferrer">Open invitation</a></div><p>The invitation link creates a profile and Requester membership. Return to Select existing employee for the separate Project Admin grant.</p></>:<p role="status">Loading the invitation link. You can also refresh Employee invitations after closing.</p>)}</>:review?<><p>{review.detail}</p><label className="checkbox-row"><input type="checkbox" checked={consent} disabled={locked} onChange={e=>setConsent(e.target.checked)}/><span>I confirm this action for this project.</span></label>{gate.stale&&<p role="alert">State changed. Reload onboarding and review the current employee or invitation again.</p>}</>:mode==='existing'?<>
    <Field label="Search employee name or email"><Input value={search} maxLength={100} disabled={locked} onChange={e=>{setSearch(e.target.value);setOffset(0);}}/></Field><p className="muted">Tenant IT can choose active internal employees across the tenant. Project Admins choose employees from this project's companies.</p>
    {!loading&&data?.employees.length===0&&<p>No eligible employees found. Invite a new employee or change your search. Disabled accounts and project access require a separate review.</p>}
    <AdministrationRecords picker label="eligible employees on this page" rows={data?.employees??[]} id={p=>p.userId} disabled={locked||loading} columns={[{key:'name',label:'Name',text:p=>p.name},{key:'email',label:'Email',text:p=>p.email},{key:'company',label:'Company',text:p=>p.companyName},{key:'role',label:'Project role',text:p=>p.role?.replaceAll('_',' ')??'No membership'}]}
     actions={p=>p.canAdminister?<span>Already Project Admin</span>:<Button variant="secondary" disabled={locked||loading} onClick={()=>propose({command:{action:'GRANT',userId:p.userId,companyId:p.companyId,expectedRole:p.role,confirmed:true},title:`Grant Project Admin to ${p.name}`,detail:`${p.email} · ${p.companyName}. ${p.role?'Their operational role is preserved.':'Their company will be associated and Requester membership added.'} Administration applies only to this project.`})}>Review admin grant</Button>}/>
    <div className="row"><Button variant="secondary" disabled={locked||loading||offset===0} onClick={()=>setOffset(n=>Math.max(0,n-25))}>Previous employee page</Button><span role="status">{data?.employees.length?offset+1:0}–{offset+(data?.employees.length??0)} of {data?.total??0}</span><Button variant="secondary" disabled={locked||loading||(data?.employees.length??0)<25||offset+25>=(data?.total??0)} onClick={()=>setOffset(n=>n+25)}>Next employee page</Button></div>
   </>:step===0?<><p>The employee creates their own profile and password using a project invitation. You grant Project Admin afterward.</p><Field label="Employee email"><Input type="email" value={email} maxLength={254} disabled={locked} onChange={e=>setEmail(e.target.value)}/></Field><p className="muted">This flow provides a link for you to send. It does not send email.</p></>:<>
    <p>Select the employee's general contractor or owner representative company.</p><Field label="Search employee company"><Input value={companySearch} maxLength={100} disabled={locked} onChange={e=>{setCompanySearch(e.target.value);setCompanyId('');}}/></Field><Field label="Employee company"><select className="select" value={companyId} disabled={locked||loading} onChange={e=>setCompanyId(e.target.value)}><option value="">Choose a company</option>{data?.companies.map(c=><option key={c.id} value={c.id}>{c.name} · {c.type==='GC'?'General contractor':'Owner representative'}</option>)}</select></Field>
    {!loading&&!data?.companies.length&&<p>No eligible companies match. Change the search, or register the company in Project companies after closing this flow.</p>}<p className="muted">Up to 100 matching companies. Narrow the search to find another company.</p>
   </>}
  </AdministrationDialog>}
  <AdministrationSection title="Employee invitations"><p className="muted">Latest 50 invitations. Refresh after acceptance to see the new profile in the employee picker.</p>
   <AdministrationRecords label="employee invitations" rows={data?.invitations??[]} id={i=>i.id} disabled={formLocked||open||loading} columns={[{key:'email',label:'Email',text:i=>i.email},{key:'company',label:'Company',text:i=>i.companyName},{key:'status',label:'Status',text:i=>i.status},{key:'expiry',label:'Expires',text:i=>new Date(i.expiresAt).toLocaleString()}]}
    actions={i=>i.registrationPath?<><Button variant="secondary" disabled={formLocked||open} onClick={()=>void copyLink(i.registrationPath!)}>Copy invitation link</Button><a className="app-link" href={i.registrationPath} target="_blank" rel="noopener noreferrer">Open invitation</a><Button variant="secondary" disabled={formLocked||open} onClick={()=>propose({command:{action:'CANCEL_INVITE',inviteId:i.id as UUID,confirmed:true},title:`Cancel invitation for ${i.email}`,detail:'The pending link will stop working. Existing accounts and project memberships are preserved.'})}>Review cancellation</Button></>:null}/>
  </AdministrationSection>
 </div></Card>;
}
