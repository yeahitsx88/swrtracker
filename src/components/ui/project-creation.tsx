'use client';
import Link from 'next/link';
import './administration-workspace.css';
import {ProjectRecommissioning} from './project-recommissioning';
import {AdministrationRecords,AdministrationSection} from './administration-records';
import { useEffect,useRef,useState,useSyncExternalStore,type FormEvent } from 'react';
import { apiClient } from '@/lib/apiClient';
import { ApiClientError,getErrorMessage } from '@/lib/errors';
import { CommandOwner,FrozenCommand } from '@/lib/frozen-command';
import { useAdministrationProgress } from '@/lib/use-administration-progress';
import { Button,Card,ErrorBanner,Input,SuccessBanner } from '@/components/ui';
import type { CrewBuild } from '@/modules/tenancy/domain/types';
export function ProjectCreation({onLockChange}:{onLockChange?:(locked:boolean)=>void}){
 const owner=useRef(new CommandOwner()).current,token='project-creation',reading=useRef(false);const held=useSyncExternalStore(owner.subscribe,owner.snapshot,owner.snapshot)!==null;
 useAdministrationProgress(owner,'/projects',false);
 const [data,setData]=useState<Awaited<ReturnType<typeof apiClient.projectAdministration>>>();
 const [name,setName]=useState(''),[crewBuild,setCrewBuild]=useState<CrewBuild>('FULL'),[templateId,setTemplateId]=useState('');
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState<string>(),[created,setCreated]=useState<{id:string;name:string}>();
 const [recommissionLocked,setRecommissionLocked]=useState(false);
 const [recommission,setRecommission]=useState<string>();
 const [loading,setLoading]=useState(true),[readFailed,setReadFailed]=useState(false);
 const command=useRef(new FrozenCommand<Parameters<typeof apiClient.createProject>[0]>());
 const locked=loading||busy||recommissionLocked||owner.blocked(token)||command.current.locked,uncertain=!!command.current.command&&!command.current.stale;
 useEffect(()=>{onLockChange?.(held||loading||busy||recommissionLocked);},[held,loading,busy,recommissionLocked,onLockChange]);
 async function load(renew=false){if(reading.current||owner.blocked(token)||command.current.pending||command.current.command&&!command.current.stale)return;reading.current=true;setLoading(true);setError(undefined);try{const current=await apiClient.projectAdministration();if(renew&&!command.current.reload())return;setData(current);setReadFailed(false);if(renew){owner.release(token);setOpen(false);setName('');setTemplateId('');}}catch(cause){setReadFailed(command.current.stale);setError(getErrorMessage(cause,'Unable to read current project administration.'));}finally{reading.current=false;setLoading(false);}}
 useEffect(()=>{void load();},[]);
 async function submit(event:FormEvent){
 event.preventDefault();if(busy||loading||recommissionLocked||owner.blocked(token)||command.current.stale||!data?.canCreateProject||!name.trim()||!owner.claim(token))return;
 const attempt=command.current.begin({name,...(templateId?{templateId}:{crewBuild})},crypto.randomUUID());if(!attempt){if(!command.current.locked)owner.release(token);return;}
 setBusy(true);setError(undefined);
 try{const {project}=await apiClient.createProject(attempt.body,attempt.key);command.current.success();owner.release(token);setCreated(project);setOpen(false);setName('');setTemplateId('');void load();}
 catch(cause){command.current.fail(cause instanceof ApiClientError?cause.status:undefined);setError(getErrorMessage(cause,'The creation response is uncertain. Retry the unchanged project.'));}
 finally{if(!command.current.locked)owner.release(token);setBusy(false);}
 }
 if(!data||!data.canCreateProject&&!data.projects.length)return error?<div role="alert">{error}<Button variant="secondary" disabled={loading} onClick={()=>void load()}>Retry administration</Button></div>:null;
 return <Card className="administration-inventory" title="Project Administration" description="Open the projects you administer.">
 <div className="stack">
 {created?<><SuccessBanner message={`${created.name} was created in Setup.`}/><Link className="button button-secondary" href={`/projects/${created.id}/admin`}>Configure {created.name}</Link></>:null}
 {readFailed&&<p role="alert">Current project administration could not be loaded. Your reviewed creation remains held. Reload project administration must successfully read current authority and templates before creating again.</p>}
 {loading&&<p role="status">Loading project administration…</p>}
 {error?<ErrorBanner message={error}/>:null}
 {data.canCreateProject&&(!open?<Button disabled={locked} onClick={()=>{setOpen(true);setCreated(undefined);}}>Create Project</Button>:<form className="stack" onSubmit={submit}>
 <label className="field"><span className="field-label">Project name</span><Input value={name} required maxLength={160} disabled={locked} onChange={e=>setName(e.target.value)}/></label>
 <label className="field"><span className="field-label">Existing project template</span><select className="select" value={templateId} disabled={locked} onChange={e=>setTemplateId(e.target.value)}><option value="">No template</option>{data.templates.map(t=><option key={t.id} value={t.id}>{t.name} · {t.crewBuild}</option>)}</select></label>
 <Link className="button button-secondary" href="/accounts/templates">Create or Manage Project Templates</Link>
 {!templateId?<label className="field"><span className="field-label">Crew build</span><select className="select" value={crewBuild} disabled={locked} onChange={e=>setCrewBuild(e.target.value as CrewBuild)}><option value="FULL">Full · Superintendent, Party Chief, Instrument Man</option><option value="MEDIUM">Medium · Party Chief, Instrument Man</option><option value="SLIM">Slim · Instrument Man</option></select></label>:null}
 <p className="muted">The project stays in Setup until its configuration is ready and an administrator activates it.</p>
 <div className="row"><Button type="submit" disabled={loading||busy||owner.blocked(token)||recommissionLocked||command.current.stale||!name.trim()}>{busy?'Creating…':uncertain?'Retry unchanged project':'Create Project'}</Button><Button type="button" variant="secondary" disabled={loading||busy||owner.blocked(token)||recommissionLocked||uncertain} onClick={()=>{if(command.current.stale)void load(true);else if(command.current.reload()){owner.release(token);setOpen(false);setError(undefined);}}}>{command.current.stale?'Reload project administration':'Cancel'}</Button></div>
 </form>)}
 {data.canCreateProject&&<Link className="button button-secondary" href="/accounts">Tenant Accounts</Link>}
 {recommission&&<ProjectRecommissioning key={recommission} projectId={recommission} onClose={()=>setRecommission(undefined)} owner={owner} onChanged={()=>void load()} onLockChange={setRecommissionLocked}/>}
 <AdministrationSection title="Administered Projects" open description="Filter, sort and export this administered project inventory."><AdministrationRecords scrollable label="administered projects" rows={data.projects} id={p=>p.id} disabled={locked||held} columns={[{key:'name',label:'Project',text:p=>p.name},{key:'status',label:'Status',className:'administration-state-column',text:p=>p.status==='SETUP'?'Setup':p.status==='ACTIVE'?'Active':'Archived',render:p=><span className="badge badge-neutral">{p.status==='SETUP'?'Setup':p.status==='ACTIVE'?'Active':'Archived'}</span>}]} actions={p=><><Link className="button button-secondary" href={`/projects/${p.id}/admin`}>Open administration</Link>{data.canCreateProject&&(p.status==='ARCHIVED'||p.recommissioning)?<Button variant="secondary" disabled={recommissionLocked||locked} onClick={()=>setRecommission(p.id)}>{p.status==='ARCHIVED'?'Review recommissioning':'Continue readiness review'}</Button>:null}</>}/></AdministrationSection>

 </div></Card>;
}
