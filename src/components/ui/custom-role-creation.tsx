'use client';
import {useRef,useState,useSyncExternalStore} from 'react';
import {apiRequest} from '@/lib/apiClient';
import {ApiClientError,getErrorMessage} from '@/lib/errors';
import {CommandOwner,FrozenCommand} from '@/lib/frozen-command';
import {useUnsavedProgress} from '@/lib/use-unsaved-progress';
import {roleLabel} from '@/lib/display-labels';
import type {CustomRole,CustomRoleDirectory,CreateCustomRole} from '@/modules/tenancy/domain/custom-role';
import {OPERATIONAL_ROLE_PROFILES} from '@/modules/tenancy/domain/operational-role-profiles';
import {Button,ErrorBanner,Input,SuccessBanner} from '@/components/ui';
import {Field} from '@/components/forms';
import {AdministrationDialog} from './administration-dialog';
import {AdministrationRecords} from './administration-records';
import {OperationalRolePicker} from './operational-role-picker';

export function CustomRoleCreation({directory,owner,disabled,onCreated,onReload}:{directory?:CustomRoleDirectory;owner:CommandOwner;disabled?:boolean;onCreated:(role:CustomRole)=>void;onReload:()=>void}) {
 const token='custom-role-creation';useSyncExternalStore(owner.subscribe,owner.snapshot,owner.snapshot);
 const gate=useRef(new FrozenCommand<CreateCustomRole>()).current;
 const [open,setOpen]=useState(false),[step,setStep]=useState(0),[name,setName]=useState(''),[description,setDescription]=useState(''),[baseRole,setBaseRole]=useState<CreateCustomRole['baseRole']>('REQUESTER');
 const [consent,setConsent]=useState(false),[error,setError]=useState<string>(),[result,setResult]=useState<CustomRole>(),[,render]=useState(0);
 const blocked=!!disabled||owner.blocked(token),locked=blocked||gate.locked,canDismiss=!blocked&&!gate.pending&&(!gate.command||gate.stale);
 const profile=OPERATIONAL_ROLE_PROFILES[result?.baseRole??baseRole];
 const duplicate=directory?.roles.some(r=>r.name.toLowerCase()===name.trim().replace(/\s+/g,' ').toLowerCase());
 const nameValid=name.trim().length>0&&name.trim().length<=80&&!duplicate;
 useUnsavedProgress(gate.locked);
 function close(){if(!canDismiss||!gate.reload())return;owner.release(token);setOpen(false);setError(undefined);onReload();}
 function reload(){if(blocked||!gate.reload())return;setConsent(false);setStep(0);setError(undefined);onReload();render(n=>n+1);}
 async function save(){
  if(blocked||!consent||!directory?.canCreate||!owner.claim(token))return;
  const frozen=gate.begin({name:name.trim().replace(/\s+/g,' '),description:description.trim(),baseRole,confirmed:true},crypto.randomUUID());if(!frozen)return;
  render(n=>n+1);setError(undefined);
  try{const response=await apiRequest<{role:CustomRole}>('/api/custom-roles',{method:'POST',body:frozen.body,headers:{'Idempotency-Key':frozen.key}});gate.success();setResult(response.role);setStep(3);setConsent(false);onCreated(response.role);}
  catch(cause){gate.fail(cause instanceof ApiClientError?cause.status:undefined);setError(getErrorMessage(cause,'The outcome is uncertain. Retry this same role creation.'));}
  finally{render(n=>n+1);}
 }
 return <div className="stack">
  <div className="row">{directory?.canCreate&&<Button disabled={blocked||owner.snapshot()!==null||open} onClick={()=>{if(!owner.claim(token))return;setOpen(true);setStep(0);setName('');setDescription('');setBaseRole('REQUESTER');setConsent(false);setError(undefined);setResult(undefined);}}>Create Custom Role</Button>}
   <Button variant="secondary" disabled={blocked||owner.snapshot()!==null||open} onClick={onReload}>Refresh Custom Roles</Button></div>
  {!directory?<p role="status">Custom roles are unavailable. Refresh roles to try again.</p>:<>
   {!directory.canCreate&&<p className="muted">Tenant IT manages tenant-wide custom role definitions.</p>}
   <AdministrationRecords label="custom roles" rows={directory.roles} id={r=>r.id} disabled={blocked||open} columns={[
    {key:'name',label:'Custom Role',text:r=>r.name},{key:'profile',label:'Permission Profile',text:r=>roleLabel(r.baseRole)},{key:'description',label:'Description',text:r=>r.description||'No description'},
   ]}/>
  </>}
  {open&&<AdministrationDialog title={result?'Custom Role Created':'Create Custom Role'} step={{current:step+1,total:4,label:['Role Details','Permission Profile','Review','Complete'][step]??'Role Details'}} help="Custom roles belong to this tenant and inherit one existing operational permission profile. Tenant IT creates definitions; Project Admins can select them during internal member enrollment. Administrative authority and responsibility grants are assigned separately." onClose={close} closeDisabled={!canDismiss}
   footer={result?<Button onClick={close}>Close</Button>:<><Button variant="secondary" disabled={!canDismiss} onClick={gate.stale?reload:close}>{gate.stale?'Reload Roles':'Cancel'}</Button><div className="row">
    {step>0&&<Button variant="secondary" disabled={locked} onClick={()=>{setStep(s=>s-1);setConsent(false);}}>Back</Button>}
    {step<2?<Button disabled={locked||!nameValid||!directory?.canCreate} onClick={()=>setStep(s=>s+1)}>{step===1?'Review Role':'Next'}</Button>:<Button disabled={blocked||!consent||gate.pending||gate.stale||!directory?.canCreate} onClick={()=>void save()}>{gate.pending?'Creating…':gate.command?'Retry Same Creation':'Create Role'}</Button>}
   </div></>}>
   {error&&<ErrorBanner message={error}/>}
   {step===0&&<>
    <Field label="Custom Role Name"><Input value={name} maxLength={80} disabled={locked} placeholder="For example, Site Requester" onChange={e=>setName(e.target.value)}/></Field>
    {duplicate&&<p role="alert">A custom role with this name already exists. Choose another name.</p>}
    <Field label="Description (Optional)"><Input value={description} maxLength={500} disabled={locked} onChange={e=>setDescription(e.target.value)}/></Field>
   </>}
   {step===1&&<><OperationalRolePicker label="Inherited Permission Profile" value={baseRole} onChange={setBaseRole} disabled={locked}/><p><strong>{roleLabel(baseRole)}</strong> supplies this custom role’s permissions.</p></>}
   {step>=1&&<dl className="administration-dialog-summary">
    {step>=2&&<><div><dt>Custom Role</dt><dd>{result?.name??name.trim()}</dd></div><div><dt>Permission Profile</dt><dd>{roleLabel(result?.baseRole??baseRole)}</dd></div>{(result?.description??description.trim())&&<div><dt>Description</dt><dd>{result?.description??description.trim()}</dd></div>}<div><dt>Scope</dt><dd>Every project in this tenant</dd></div></>}
    <div><dt>Visibility</dt><dd>{profile.visibility}</dd></div><div><dt>Responsibilities</dt><dd>{profile.responsibilities}</dd></div>
   </dl>}
   {step===2&&<><p>Creating this definition does not assign it to anyone. Project Admin authority, Survey Reviewer grants, staffing links and current workflow checks remain separate.</p><label className="checkbox-row"><input type="checkbox" checked={consent} disabled={locked} onChange={e=>setConsent(e.target.checked)}/><span>I confirm this tenant-wide name and inherited permission profile.</span></label></>}
   {result&&<><SuccessBanner message={`${result.name} is available for internal project member enrollment.`}/><p>No member access has changed. Select this role when adding an existing member or inviting a new member.</p><details><summary>Role Reference</summary><span className="administration-company-id">{result.id}</span></details></>}
   {gate.stale&&<p role="alert">Reload roles and review the details before creating another role.</p>}
  </AdministrationDialog>}
 </div>;
}
