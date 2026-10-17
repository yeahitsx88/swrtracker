'use client';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { apiRequest } from '@/lib/apiClient';
import { ApiClientError, getErrorMessage } from '@/lib/errors';
import { CommandOwner, FrozenCommand } from '@/lib/frozen-command';
import { Button, ErrorBanner, Input, SuccessBanner } from '@/components/ui';
import {RoleOptions,roleSelection} from './role-options';
import type {CustomRole} from '@/modules/tenancy/domain/custom-role';
import {apiClient} from '@/lib/apiClient';
import {usePathname} from 'next/navigation';
import {useAdministrationNotice} from './administration-workspace';

export const operationalRoleLabels: Record<string,string> = {REQUESTER:'Requester',SURVEY_MANAGER:'Survey Manager',SURVEY_SUPERINTENDENT:'Survey Superintendent',PARTY_CHIEF:'Party Chief',INSTRUMENT_MAN:'Instrument Man',CAD_TECHNICIAN:'CAD Technician',CAD_LEAD:'CAD Lead',VIEWER:'Viewer'};
type Company={id:string;name:string;type:string};
type Employee={companyId:string;name:string;email:string;password:string;role:string;projectAdmin:boolean;confirmed:true};
type Attempt={url:string;body:Record<string,unknown>};

/** Same wizard for Central IT and scoped Project Admin; all authority stays on the server. */
export function ProjectMemberWizard({projectId,companies,owner,onCreated,initialAdmin=false,canGrantAdmin=false}:{projectId:string;companies:Company[];owner:CommandOwner;onCreated:()=>void;initialAdmin?:boolean;canGrantAdmin?:boolean}) {
  const token=`employee:${projectId}:${initialAdmin?'admin':'member'}`;
  const pathname=usePathname();
  useSyncExternalStore(owner.subscribe,owner.snapshot,owner.snapshot);
  const gate=useRef(new FrozenCommand<Attempt>());
  const [open,setOpen]=useState(false),[step,setStep]=useState(0),[mode,setMode]=useState('new');
  const [person,setPerson]=useState(''),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[companyId,setCompanyId]=useState(''),[role,setRole]=useState('REQUESTER'),[admin,setAdmin]=useState(initialAdmin),[consent,setConsent]=useState(false);
  const [candidates,setCandidates]=useState<Array<{userId:string;name:string;email:string;companyName:string;companyType:string}>>([]),[userId,setUserId]=useState(''),[search,setSearch]=useState(''),[offset,setOffset]=useState(0),[loading,setLoading]=useState(true);
  const [error,setError]=useState<string>(),[success,setSuccess]=useState<string>();
  const [currentCompanies,setCurrentCompanies]=useState(companies),[roles,setRoles]=useState<CustomRole[]>([]),[ready,setReady]=useState(false),[closed,setClosed]=useState(false),[currentCanGrantAdmin,setCurrentCanGrantAdmin]=useState(false),[readFailed,setReadFailed]=useState(false);
  const reading=useRef(false);
  const [,rerender]=useState(0);
  const blocked=owner.blocked(token),locked=loading||gate.current.locked||blocked;
  const company=currentCompanies.find(c=>c.id===companyId);
  const candidate=candidates.find(c=>c.userId===userId);
  const requesterOnly=(mode==='existing'?candidate?.companyType:company?.type)==='SUBCONTRACTOR';
  useEffect(()=>{if(mode!=='existing'||!open){if(!reading.current)setLoading(false);return;}if(gate.current.locked||reading.current)return;let active=true;setLoading(true);apiRequest<{candidates:typeof candidates}>(`/api/projects/${projectId}/companies?limit=100&offset=${offset}`).then(r=>{if(active)setCandidates(r.candidates);}).catch(e=>{if(active)setError(getErrorMessage(e,'Unable to load eligible accounts.'));}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[projectId,mode,open,offset]);
  const identityValid=mode==='new'?!!person.trim()&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())&&password.length>=8&&new TextEncoder().encode(password).length<=72:!!candidate&&!loading;
  const accessValid=(mode==='existing'?!!candidate&&!loading:!!company)&&(!requesterOnly||roleSelection(role,roles).role==='REQUESTER');
  async function loadCurrent(renew=false){
    if(reading.current||owner.blocked(token)||gate.current.pending||gate.current.command&&!gate.current.stale)return;
    reading.current=true;setLoading(true);setError(undefined);
    try {
      const [catalog,access,context]=await Promise.all([apiRequest<{roles:CustomRole[]}>(`/api/roles?projectId=${projectId}`),apiRequest<{companies:Company[];candidates:typeof candidates}>(`/api/projects/${projectId}/companies?limit=100&offset=0`),apiClient.projectAdministration()]);
      const project=context.projects.find(p=>p.id===projectId);if(!project)throw new Error('Current Project Admin access is required. Return to Projects to check your access.');
      if(renew&&!gate.current.reload())return;
      setCurrentCompanies(access.companies);setCandidates(access.candidates);setRoles(catalog.roles);setClosed(project.status==='ARCHIVED'||project.recommissioning||initialAdmin&&!context.canCreateProject);setCurrentCanGrantAdmin(context.canCreateProject);setReady(true);setReadFailed(false);
      if(renew){owner.release(token);setOpen(false);setStep(0);setPerson('');setEmail('');setPassword('');setCompanyId('');setRole('REQUESTER');setAdmin(initialAdmin);setUserId('');setSearch('');setOffset(0);setConsent(false);onCreated();}
    }catch(cause){setReadFailed(gate.current.stale);setError(getErrorMessage(cause,'Unable to load current project access, companies and roles.'));}
    finally{reading.current=false;setLoading(false);}
  }
  useEffect(()=>{void loadCurrent();},[projectId]);
  useEffect(()=>{if(!gate.current.locked&&!reading.current)setCurrentCompanies(companies);},[companies]);
  function reset(){if(loading||blocked)return;if(gate.current.stale){void loadCurrent(true);return;}if(!gate.current.reload())return;owner.release(token);setOpen(false);setStep(0);setPassword('');setConsent(false);setError(undefined);setUserId('');}

  async function submit(){
    if(loading||blocked||gate.current.pending||gate.current.stale||!consent||(!gate.current.command&&(!ready||closed||!accessValid))||!owner.claim(token))return;
    const body:Employee={companyId,name:person.trim(),email:email.trim(),password,...roleSelection(role,roles),projectAdmin:admin,confirmed:true};
    const value:Attempt=mode==='new'?{url:`/api/projects/${projectId}/employees`,body:{...body}}:{url:`/api/projects/${projectId}/members`,body:{userId,...roleSelection(role,roles)}};
    const attempt=gate.current.begin(value,crypto.randomUUID());if(!attempt)return;
    rerender(n=>n+1);setError(undefined);
    try {await apiRequest(attempt.body.url,{method:'POST',body:attempt.body.body,headers:{'Idempotency-Key':attempt.key}});gate.current.success();owner.release(token);setSuccess(mode==='new'?`${person.trim()} was created and added to this project${admin?' with independent Project Admin access':''}.`:'Project membership created.');setPassword('');setOpen(false);setStep(0);setConsent(false);onCreated();}
    catch(e){gate.current.fail(e instanceof ApiClientError?e.status:undefined);if(!gate.current.locked)owner.release(token);setError(getErrorMessage(e,'Outcome uncertain. Retry the unchanged account creation.'));}
    finally {rerender(n=>n+1);}
  }
  useAdministrationNotice(token,{source:initialAdmin?'Project Admin Creation':'Project Member Creation',href:pathname.startsWith('/accounts')?'/accounts':`/projects/${projectId}/admin`,tone:error?'error':success?'success':'status',message:gate.current.pending?'Saving the reviewed creation…':gate.current.stale?'Project access changed. Return to this creation, successfully reload current records and review again.':gate.current.command?'Outcome uncertain. Return to this creation and retry the unchanged decision.':error??success??''});
  return <div className="stack">
    {success&&<SuccessBanner message={success}/>}
    {!open&&error&&<ErrorBanner message={error}/>} {loading&&<p role="status">Loading current project access…</p>}
    {readFailed&&<p role="alert">Current project access could not be loaded. Your reviewed creation remains held. Reload Wizard must successfully read current project authority, companies, eligible accounts and roles before a new review and confirmation.</p>}
    {closed&&<p role="alert">Project access creation is unavailable while this project is archived or preparing, or independent authority is no longer available. Return to Projects to check current access.</p>}
    {!ready&&error&&<Button variant="secondary" disabled={locked} onClick={()=>void loadCurrent()}>Reload Project Access</Button>}
    {!open?<Button disabled={locked||!ready||closed} onClick={()=>{setOpen(true);setSuccess(undefined);setAdmin(initialAdmin);}}>{initialAdmin?'Create Project Admin':'Add Project Member'}</Button>:
    <section className="administration-wizard stack" aria-label={initialAdmin?'Create Project Admin Wizard':'Add Project Member Wizard'}>
      <ol className="administration-wizard-steps">{['Person','Project Access','Review'].map((label,index)=><li key={label} aria-current={step===index?'step':undefined}>{label}</li>)}</ol>
      {error&&<ErrorBanner message={error}/>}
      {step===0&&<>
        {!initialAdmin&&<label className="field"><span className="field-label">Account source</span><select aria-label="Account source" className="select" disabled={locked} value={mode} onChange={e=>{setMode(e.target.value);setUserId('');setRole('REQUESTER');setConsent(false);}}><option value="new">Create a New Employee</option><option value="existing">Add an Existing Account</option></select></label>}
        {mode==='new'?<>
          <label className="field"><span className="field-label">Employee name</span><Input autoComplete="off" maxLength={200} disabled={locked} value={person} onChange={e=>setPerson(e.target.value)}/></label>
          <label className="field"><span className="field-label">Company email</span><Input type="email" autoComplete="off" maxLength={254} disabled={locked} value={email} onChange={e=>setEmail(e.target.value)}/></label>
          <label className="field"><span className="field-label">Initial password (at least 8 characters)</span><Input type="password" autoComplete="new-password" disabled={locked} value={password} onChange={e=>setPassword(e.target.value)}/></label>
        </>:<>
          <label className="field"><span className="field-label">Filter eligible accounts on this page</span><Input value={search} disabled={locked} onChange={e=>setSearch(e.target.value)}/></label>
          <label className="field"><span className="field-label">Existing account</span><select aria-label="Existing account" className="select" size={4} value={userId} disabled={locked||loading} onChange={e=>{setUserId(e.target.value);setRole('REQUESTER');setConsent(false);}}>{candidates.filter(c=>(c.name+' '+c.email).toLowerCase().includes(search.toLowerCase())).map(c=><option key={c.userId} value={c.userId}>{c.name} · {c.email} · {c.companyName}</option>)}</select></label>
          {loading?<p role="status">Loading accounts…</p>:!candidates.length&&<p>No eligible accounts. Create a new employee or associate their company on the Companies page.</p>}
          <div className="row"><Button variant="secondary" disabled={locked||loading||!offset} onClick={()=>setOffset(n=>Math.max(0,n-100))}>Previous accounts</Button><Button variant="secondary" disabled={locked||loading||candidates.length<100} onClick={()=>setOffset(n=>n+100)}>Next accounts</Button></div>
        </>}
      </>}
      {step===1&&<>
        {mode==='new'&&<label className="field"><span className="field-label">Employee company</span><select aria-label="Employee company" className="select" value={companyId} disabled={locked} onChange={e=>{setCompanyId(e.target.value);if(currentCompanies.find(c=>c.id===e.target.value)?.type==='SUBCONTRACTOR'){setRole('REQUESTER');setAdmin(false);}}}><option value="">Choose a project company</option>{currentCompanies.filter(c=>!initialAdmin||c.type!=='SUBCONTRACTOR').map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
        {!currentCompanies.length&&mode==='new'&&<p>Register or associate a company on the Companies page first. Your entered details stay here when you switch tabs.</p>}
        <label className="field"><span className="field-label">Operational role</span><select aria-label="Operational role" className="select" size={4} value={role} disabled={locked} onChange={e=>setRole(e.target.value)}><RoleOptions roles={roles} requesterOnly={requesterOnly}/></select></label>
        {mode==='new'&&canGrantAdmin&&currentCanGrantAdmin&&<label className="checkbox-row"><input type="checkbox" checked={admin} disabled={locked||company?.type==='SUBCONTRACTOR'} onChange={e=>setAdmin(e.target.checked)}/><span>Grant independent Project Admin access for this project</span></label>}
        {requesterOnly&&<p>Subcontractor accounts receive Requester access only.</p>}
      </>}
      {step===2&&<>
        <h3 className="panel-title">Review {mode==='new'?'Employee Creation':'Project Membership'}</h3>
        <dl><dt>Person</dt><dd>{mode==='new'?`${person} · ${email}`:candidates.find(c=>c.userId===userId)?.name??userId}</dd><dt>Company</dt><dd>{mode==='new'?company?.name:candidates.find(c=>c.userId===userId)?.companyName}</dd><dt>Operational Role</dt><dd>{roles.find(r=>r.id===role)?.name??operationalRoleLabels[role]}</dd>{mode==='new'&&<><dt>Independent Project Admin</dt><dd>{admin?'Yes — this project only':'No'}</dd></>}</dl>
        <p>{mode==='new'?'Creates an account and grants access to this project only.':'Adds this existing account to this project only.'} Other projects and tenant IT authority are unchanged.</p>
        <label className="checkbox-row"><input type="checkbox" checked={consent} disabled={locked} onChange={e=>setConsent(e.target.checked)}/><span>I confirm this person, company and project access.</span></label>
        {gate.current.stale&&<p role="alert">State changed. Reload this wizard before confirming again.</p>}
      </>}
      <div className="row">
        {step>0&&<Button variant="secondary" disabled={locked} onClick={()=>{setStep(n=>n-1);setConsent(false);}}>Back</Button>}
        {step<2?<Button disabled={locked||(step===0?!identityValid:!accessValid)} onClick={()=>setStep(n=>n+1)}>Next</Button>:<Button disabled={loading||blocked||!consent||gate.current.pending||gate.current.stale} onClick={()=>void submit()}>{gate.current.pending?'Creating…':gate.current.command&&!gate.current.stale?'Retry Unchanged Creation':mode==='new'?'Create Employee':'Add Member'}</Button>}
        <Button variant="secondary" disabled={loading||blocked||gate.current.pending||!!gate.current.command&&!gate.current.stale} onClick={reset}>{gate.current.stale?'Reload Wizard':'Cancel'}</Button>
      </div>
    </section>}
  </div>;
}
