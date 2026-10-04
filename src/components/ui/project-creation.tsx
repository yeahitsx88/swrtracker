'use client';
import Link from 'next/link';
import './administration-workspace.css';
import {ProjectRecommissioning} from './project-recommissioning';
import {AdministrationRecords,AdministrationSection} from './administration-records';
import { useEffect,useRef,useState,type FormEvent } from 'react';
import { apiClient } from '@/lib/apiClient';
import { ApiClientError,getErrorMessage } from '@/lib/errors';
import { FrozenCommand } from '@/lib/frozen-command';
import { useUnsavedProgress } from '@/lib/use-unsaved-progress';
import { Button,Card,ErrorBanner,Input,SuccessBanner } from '@/components/ui';
import type { CrewBuild } from '@/modules/tenancy/domain/types';
export function ProjectCreation(){
 const [data,setData]=useState<Awaited<ReturnType<typeof apiClient.projectAdministration>>>();
 const [name,setName]=useState(''),[crewBuild,setCrewBuild]=useState<CrewBuild>('FULL'),[templateId,setTemplateId]=useState('');
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState<string>(),[created,setCreated]=useState<{id:string;name:string}>();
 const [recommissionLocked,setRecommissionLocked]=useState(false);
 const [recommission,setRecommission]=useState<string>();
 const [revision,setRevision]=useState(0);
 const command=useRef(new FrozenCommand<Parameters<typeof apiClient.createProject>[0]>());
 const locked=command.current.locked,uncertain=!!command.current.command&&!command.current.stale;
 useUnsavedProgress(locked);
 useEffect(()=>{let active=true;apiClient.projectAdministration().then(value=>{if(active)setData(value);}).catch(cause=>{if(active)setError(getErrorMessage(cause,'Unable to check project administration.'));});return()=>{active=false;};},[revision]);
 async function submit(event:FormEvent){
 event.preventDefault();if(busy||recommissionLocked)return;
 const attempt=command.current.begin({name,...(templateId?{templateId}:{crewBuild})},crypto.randomUUID());if(!attempt)return;
 setBusy(true);setError(undefined);
 try{const {project}=await apiClient.createProject(attempt.body,attempt.key);command.current.success();setCreated(project);setOpen(false);setName('');setTemplateId('');setRevision(n=>n+1);}
 catch(cause){command.current.fail(cause instanceof ApiClientError?cause.status:undefined);setError(getErrorMessage(cause,'The creation response is uncertain. Retry the unchanged project.'));}
 finally{setBusy(false);}
 }
 if(!data||!data.canCreateProject&&!data.projects.length)return error?<div role="alert">{error}<Button variant="secondary" onClick={()=>{setError(undefined);setRevision(n=>n+1);}}>Retry administration</Button></div>:null;
 return <Card className="administration-inventory" title="Project Administration" description="Open the projects you administer.">
 <div className="stack">
 {created?<><SuccessBanner message={`${created.name} was created in Setup.`}/><Link className="button button-secondary" href={`/projects/${created.id}/admin`}>Configure {created.name}</Link></>:null}
 {error?<ErrorBanner message={error}/>:null}
 {data.canCreateProject&&(!open?<Button disabled={recommissionLocked} onClick={()=>{setOpen(true);setCreated(undefined);}}>Create Project</Button>:<form className="stack" onSubmit={submit}>
 <label className="field"><span className="field-label">Project name</span><Input value={name} required maxLength={160} disabled={locked} onChange={e=>setName(e.target.value)}/></label>
 <label className="field"><span className="field-label">Existing project template</span><select className="select" value={templateId} disabled={locked} onChange={e=>setTemplateId(e.target.value)}><option value="">No template</option>{data.templates.map(t=><option key={t.id} value={t.id}>{t.name} · {t.crewBuild}</option>)}</select></label>
 {!templateId?<label className="field"><span className="field-label">Crew build</span><select className="select" value={crewBuild} disabled={locked} onChange={e=>setCrewBuild(e.target.value as CrewBuild)}><option value="FULL">Full · Superintendent, Party Chief, Instrument Man</option><option value="MEDIUM">Medium · Party Chief, Instrument Man</option><option value="SLIM">Slim · Instrument Man</option></select></label>:null}
 <p className="muted">The project stays in Setup until its configuration is ready and an administrator activates it.</p>
 <div className="row"><Button type="submit" disabled={busy||command.current.stale||!name.trim()}>{busy?'Creating…':uncertain?'Retry unchanged project':'Create Project'}</Button><Button type="button" variant="secondary" disabled={busy||uncertain} onClick={()=>{if(command.current.reload()){setOpen(false);setError(undefined);setRevision(n=>n+1);}}}>{command.current.stale?'Reload project administration':'Cancel'}</Button></div>
 </form>)}
 {data.canCreateProject&&<Link className="button button-secondary" href="/accounts">Tenant Accounts and Central IT Reviews</Link>}
 {recommission&&<ProjectRecommissioning key={recommission} projectId={recommission} onClose={()=>setRecommission(undefined)} onChanged={()=>setRevision(n=>n+1)} onLockChange={setRecommissionLocked}/>}
 <AdministrationSection title="Administered Projects" open description="Filter, sort and export this administered project inventory."><AdministrationRecords scrollable label="administered projects" rows={data.projects} id={p=>p.id} columns={[{key:'name',label:'Project',text:p=>p.name},{key:'status',label:'Status',className:'administration-state-column',text:p=>p.status==='SETUP'?'Setup':p.status==='ACTIVE'?'Active':'Archived',render:p=><span className="badge">{p.status==='SETUP'?'Setup':p.status==='ACTIVE'?'Active':'Archived'}</span>}]} actions={p=><><Link className="button button-secondary" href={`/projects/${p.id}/admin`}>Open administration</Link>{data.canCreateProject&&(p.status==='ARCHIVED'||p.recommissioning)?<Button variant="secondary" disabled={recommissionLocked||locked} onClick={()=>setRecommission(p.id)}>{p.status==='ARCHIVED'?'Review recommissioning':'Continue readiness review'}</Button>:null}</>}/></AdministrationSection>

 </div></Card>;
}
