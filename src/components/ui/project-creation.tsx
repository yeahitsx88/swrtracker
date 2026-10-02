'use client';
import Link from 'next/link';
import { useEffect,useState,type FormEvent } from 'react';
import { apiClient } from '@/lib/apiClient';
import { getErrorMessage } from '@/lib/errors';
import { Button,Card,ErrorBanner,Input,SuccessBanner } from '@/components/ui';
import { PROJECT_STATUS_LABELS } from '@/lib/display-labels';
import type { CrewBuild } from '@/modules/tenancy/domain/types';
export function ProjectCreation(){
 const [data,setData]=useState<Awaited<ReturnType<typeof apiClient.projectAdministration>>>();
 const [name,setName]=useState(''),[crewBuild,setCrewBuild]=useState<CrewBuild>('FULL'),[templateId,setTemplateId]=useState('');
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState<string>(),[created,setCreated]=useState<{id:string;name:string}>();
 const [revision,setRevision]=useState(0);
 useEffect(()=>{let active=true;apiClient.projectAdministration().then(value=>{if(active)setData(value);}).catch(cause=>{if(active)setError(getErrorMessage(cause,'Unable to check project administration.'));});return()=>{active=false;};},[revision]);
 async function submit(event:FormEvent){
 event.preventDefault();if(busy)return;setBusy(true);setError(undefined);
 try{const {project}=await apiClient.createProject({name,...(templateId?{templateId}:{crewBuild})});setCreated(project);setOpen(false);setName('');setTemplateId('');setRevision(n=>n+1);}
 catch(cause){setError(getErrorMessage(cause,'Unable to create the project. Check your entries and try again.'));}
 finally{setBusy(false);}
 }
 if(!data||!data.canCreateProject&&!data.projects.length)return error?<div role="alert">{error}<Button variant="secondary" onClick={()=>{setError(undefined);setRevision(n=>n+1);}}>Retry administration</Button></div>:null;
 return <Card title="Project administration" description="Open the projects you administer.">
 <div className="stack">
 {created?<><SuccessBanner message={`${created.name} was created in Setup.`}/><Link className="button button-secondary" href={`/projects/${created.id}/admin`}>Configure {created.name}</Link></>:null}
 {error?<ErrorBanner message={error}/>:null}
 {data.canCreateProject&&(!open?<Button onClick={()=>{setOpen(true);setCreated(undefined);}}>Create Project</Button>:<form className="stack" onSubmit={submit}>
 <label className="field"><span className="field-label">Project name</span><Input value={name} required maxLength={160} disabled={busy} onChange={e=>setName(e.target.value)}/></label>
 <label className="field"><span className="field-label">Existing project template</span><select className="select" value={templateId} disabled={busy} onChange={e=>setTemplateId(e.target.value)}><option value="">No template</option>{data.templates.map(t=><option key={t.id} value={t.id}>{t.name} · {t.crewBuild}</option>)}</select></label>
 {!templateId?<label className="field"><span className="field-label">Crew build</span><select className="select" value={crewBuild} disabled={busy} onChange={e=>setCrewBuild(e.target.value as CrewBuild)}><option value="FULL">Full · Superintendent, Party Chief, Instrument Man</option><option value="MEDIUM">Medium · Party Chief, Instrument Man</option><option value="SLIM">Slim · Instrument Man</option></select></label>:null}
 <p className="muted">The project stays in Setup until its configuration is ready and an administrator activates it.</p>
 <div className="row"><Button type="submit" disabled={busy||!name.trim()}>{busy?'Creating…':'Create Project'}</Button><Button type="button" variant="secondary" disabled={busy} onClick={()=>setOpen(false)}>Cancel</Button></div>
 </form>)}
 {data.canCreateProject&&<Link className="app-link" href="/accounts">Tenant accounts and Central IT reviews</Link>}
 <h3 className="panel-title">Administered projects</h3><p className="muted">Up to 100 administered projects, newest first.</p><ul className="tm-list">{data.projects.map(p=><li key={p.id}><Link className="app-link" href={`/projects/${p.id}/admin`}>{p.name}</Link> <span className={`badge status-badge ${p.status==='ACTIVE'?'tone-success':'tone-neutral'}`}>{PROJECT_STATUS_LABELS[p.status]}</span></li>)}</ul>
 </div></Card>;
}
