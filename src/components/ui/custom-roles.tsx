'use client';
import {useAdministrationNotice} from './administration-workspace';
import {useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {apiRequest} from '@/lib/apiClient';
import {ApiClientError,getErrorMessage} from '@/lib/errors';
import {CommandOwner,FrozenCommand} from '@/lib/frozen-command';
import {Button,Card,ErrorBanner,Input,SuccessBanner} from '@/components/ui';
import {AdministrationRecords} from './administration-records';
import type {CustomRole} from '@/modules/tenancy/domain/custom-role';
type Intent={url:string;method:'POST'|'PATCH'|'DELETE';body:Record<string,unknown>};
const templateLabel=(role:string)=>role==='REQUESTER'?'Requester':'Viewer';
export function CustomRoles({owner}:{owner:CommandOwner}){
 const token='tenant-custom-roles';useSyncExternalStore(owner.subscribe,owner.snapshot,owner.snapshot);
 const gate=useRef(new FrozenCommand<Intent>());
 const [roles,setRoles]=useState<CustomRole[]>([]),[authorized,setAuthorized]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState<string>(),[success,setSuccess]=useState<string>();
 const [open,setOpen]=useState(false),[step,setStep]=useState(0),[editing,setEditing]=useState<CustomRole>(),[deleting,setDeleting]=useState(false),[name,setName]=useState(''),[baseRole,setBaseRole]=useState('REQUESTER'),[consent,setConsent]=useState(false);
 const [,render]=useState(0),[readFailed,setReadFailed]=useState(false);const reading=useRef(false);const blocked=owner.blocked(token),locked=loading||blocked||gate.current.locked;
 async function load(renew=false){if(reading.current||owner.blocked(token)||gate.current.pending||gate.current.command&&!gate.current.stale)return;reading.current=true;setLoading(true);setError(undefined);try{const r=await apiRequest<{roles:CustomRole[]}>('/api/roles');if(renew&&!gate.current.reload())return;setRoles(r.roles);setAuthorized(true);setReadFailed(false);if(renew){owner.release(token);setOpen(false);setConsent(false);setEditing(undefined);setDeleting(false);setStep(0);}}catch(e){setReadFailed(gate.current.stale);setError(getErrorMessage(e,'Unable to read current custom roles. Tenant Admin access is required.'));}finally{reading.current=false;setLoading(false);}}
 useEffect(()=>{void load();},[]);
 function begin(role?:CustomRole,remove=false){if(locked)return;setEditing(role);setDeleting(remove);setName(role?.name??'');setBaseRole(role?.baseRole??'REQUESTER');setStep(remove?2:0);setConsent(false);setSuccess(undefined);setError(undefined);setOpen(true);}
 async function submit(){if(loading||blocked||gate.current.pending||gate.current.stale||!consent||!owner.claim(token))return;
  const value:Intent={url:editing?`/api/roles/${editing.id}`:'/api/roles',method:deleting?'DELETE':editing?'PATCH':'POST',body:{...(deleting?{}:{name:name.trim(),baseRole}),...(editing?{version:editing.version}:{}),confirmed:true}};
  const attempt=gate.current.begin(value,crypto.randomUUID());if(!attempt)return;render(n=>n+1);setError(undefined);
  try{await apiRequest(attempt.body.url,{method:attempt.body.method,body:attempt.body.body,headers:{'Idempotency-Key':attempt.key}});gate.current.success();owner.release(token);setOpen(false);setConsent(false);setSuccess(deleting?'Custom role deleted.':editing?'Custom role updated across all projects. Affected members must sign in again if the template changed.':'Custom role deployed to every current and future project.');void load();}
  catch(e){gate.current.fail(e instanceof ApiClientError?e.status:undefined);if(!gate.current.locked)owner.release(token);setError(getErrorMessage(e,'Outcome uncertain. Retry the unchanged role decision.'));}finally{render(n=>n+1);}
 }
 useAdministrationNotice(token,{source:'Custom Roles',href:'/accounts/roles',tone:error?'error':success?'success':'status',message:gate.current.pending?'Saving the reviewed decision…':gate.current.stale?'State changed. Return to this action, deliberately reload and review again.':gate.current.command?'Outcome uncertain. Return to this action and retry the unchanged decision.':error??(success)??''});
 return <Card title="Custom Roles" description="Tenant Admin creates tenant-wide role names with exactly Requester or Viewer permissions. Project Admin assigns them within their projects. System roles are fixed."><div className="stack">
 {readFailed&&<p role="alert">Current custom roles could not be loaded. Your reviewed decision remains held. Reload Roles must successfully read the current catalog before a fresh review and consent.</p>}{error&&<ErrorBanner message={error}/>} {success&&<SuccessBanner message={success}/>} {loading&&<p role="status">Loading custom roles…</p>}{!authorized&&error&&<Button variant="secondary" disabled={loading||blocked} onClick={()=>void load()}>Reload Roles</Button>}
 {authorized&&<>
 {!open?<Button disabled={blocked||loading} onClick={()=>begin()}>Add Role</Button>:<section className="administration-wizard stack" aria-label={deleting?'Delete Custom Role':editing?'Edit Role Wizard':'Add Role Wizard'}>
 {!deleting&&<ol className="administration-wizard-steps">{['Name','Template','Review and Deploy'].map((label,index)=><li key={label} aria-current={step===index?'step':undefined}>{label}</li>)}</ol>}
 {step===0&&<label className="field"><span className="field-label">Role name</span><Input autoComplete="off" value={name} maxLength={80} disabled={locked} onChange={e=>setName(e.target.value)}/></label>}
 {step===1&&<fieldset disabled={locked}><legend>Base Permissions</legend>{['REQUESTER','VIEWER'].map(value=><label key={value} className="checkbox-row"><input type="radio" name="custom-role-template" value={value} checked={baseRole===value} onChange={()=>setBaseRole(value)}/><span>{templateLabel(value)} — {value==='REQUESTER'?'submit and track authorized requests':'read authorized requests and status'}</span></label>)}</fieldset>}
 {step===2&&<><h3 className="panel-title">{deleting?'Review Role Deletion':'Review Tenant-wide Role'}</h3><dl><dt>Role Name</dt><dd>{name}</dd><dt>Exact Permissions</dt><dd>{templateLabel(baseRole)}</dd><dt>Scope</dt><dd>Every current and future project in this tenant</dd>{editing&&<><dt>Existing Assignments</dt><dd>{editing.assignmentCount} across all projects</dd></>}</dl>
 <p>{deleting?'Every assignment must be reassigned before deletion, including retained historical memberships.':editing?'Changes apply to every existing assignment. A template change requires affected members to sign in again.':'Deploying adds this role to project assignment pickers; it does not grant anyone access.'}</p>
 <label className="checkbox-row"><input type="checkbox" checked={consent} disabled={locked} onChange={e=>setConsent(e.target.checked)}/><span>I confirm this tenant-wide {deleting?'deletion':editing?'change':'role'}.</span></label></>}
 {gate.current.stale&&<p role="alert">The role changed or still has assignments. Reload the role list and review the current details before confirming again.</p>}
 <div className="row">{step>0&&!deleting&&<Button variant="secondary" disabled={locked} onClick={()=>{setStep(n=>n-1);setConsent(false);}}>Back</Button>}
 {step<2?<Button disabled={locked||!name.trim()} onClick={()=>setStep(n=>n+1)}>Next</Button>:<Button variant={deleting?'danger':'primary'} disabled={loading||blocked||!consent||gate.current.pending||gate.current.stale} onClick={()=>void submit()}>{gate.current.pending?'Saving…':gate.current.command&&!gate.current.stale?'Retry Unchanged Decision':deleting?'Delete Role':editing?'Save Role Changes':'Deploy Role'}</Button>}
 <Button variant="secondary" disabled={loading||blocked||gate.current.pending||!!gate.current.command&&!gate.current.stale} onClick={()=>{if(gate.current.stale)void load(true);else if(gate.current.reload()){owner.release(token);setOpen(false);setConsent(false);void load();}}}>{gate.current.stale?'Reload Roles':'Cancel'}</Button></div>
 </section>}
 <AdministrationRecords scrollable label="custom roles" rows={roles} id={r=>r.id} disabled={locked||open} columns={[{key:'name',label:'Role Name',text:r=>r.name},{key:'base',label:'Exact Permissions',text:r=>templateLabel(r.baseRole)},{key:'count',label:'Assignments',text:r=>String(r.assignmentCount)}]} actions={r=><><Button variant="secondary" disabled={locked||open} onClick={()=>begin(r)}>Edit Role</Button><Button variant="secondary" disabled={locked||open||r.assignmentCount>0} title={r.assignmentCount?'Reassign all members before deletion':undefined} onClick={()=>begin(r,true)}>Delete Role</Button></>}/>
 {!loading&&!roles.length&&<p>No custom roles yet. Add a role based on Requester or Viewer.</p>}
 </>}
 </div></Card>;
}
