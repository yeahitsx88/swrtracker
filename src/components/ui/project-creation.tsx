'use client';
import Link from 'next/link';
import {useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {apiClient} from '@/lib/apiClient';
import {ApiClientError,getErrorMessage} from '@/lib/errors';
import {FrozenCommand,CommandOwner} from '@/lib/frozen-command';
import {useUnsavedProgress} from '@/lib/use-unsaved-progress';
import {Button,Card,ErrorBanner,Input,SuccessBanner} from '@/components/ui';
import {Field} from '@/components/forms';
import {AdministrationDialog} from './administration-dialog';
import {AdministrationRecords,AdministrationSection} from './administration-records';
import {ProjectRecommissioning} from './project-recommissioning';
import {TenantHomeSettings} from './tenant-home-settings';
import type {CrewBuild} from '@/modules/tenancy/domain/types';

export function ProjectCreation(){
 const owner=useRef(new CommandOwner()).current,token='project-creation';const ownerToken=useSyncExternalStore(owner.subscribe,owner.snapshot,owner.snapshot);
 const [data,setData]=useState<Awaited<ReturnType<typeof apiClient.projectAdministration>>>();
 const [name,setName]=useState(''),[crewBuild,setCrewBuild]=useState<CrewBuild>('FULL'),[templateId,setTemplateId]=useState('');
 const [open,setOpen]=useState(false),[step,setStep]=useState(0),[consent,setConsent]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState<string>(),[created,setCreated]=useState<{id:string;name:string}>();
 const [recommissionLocked,setRecommissionLocked]=useState(false),[recommission,setRecommission]=useState<string>();
 const [revision,setRevision]=useState(0);
 const command=useRef(new FrozenCommand<Parameters<typeof apiClient.createProject>[0]>());
 const blocked=owner.blocked(token),locked=blocked||command.current.locked,uncertain=!!command.current.command&&!command.current.stale;
 useUnsavedProgress(locked);
 useEffect(()=>{let active=true;apiClient.projectAdministration().then(value=>{if(active)setData(value);}).catch(cause=>{if(active)setError(getErrorMessage(cause,'Unable to check project administration.'));});return()=>{active=false;};},[revision]);
 function close(){if(blocked||!command.current.reload())return;owner.release(token);setOpen(false);setError(undefined);setRevision(n=>n+1);}
 function reload(){if(blocked||!command.current.reload())return;setStep(0);setConsent(false);setError(undefined);setRevision(n=>n+1);}
 async function submit(){
  if(blocked||busy||recommissionLocked||!consent||!owner.claim(token))return;
  const attempt=command.current.begin({name:name.trim(),...(templateId?{templateId}:{crewBuild})},crypto.randomUUID());if(!attempt)return;
  setBusy(true);setError(undefined);
  try{const {project}=await apiClient.createProject(attempt.body,attempt.key);command.current.success();setCreated(project);setStep(3);setRevision(n=>n+1);}
  catch(cause){command.current.fail(cause instanceof ApiClientError?cause.status:undefined);setError(getErrorMessage(cause,'The creation response is uncertain. Retry the unchanged project.'));}
  finally{setBusy(false);}
 }
 if(!data||!data.canCreateProject&&!data.projects.length)return error?<div role="alert">{error}<Button variant="secondary" onClick={()=>{setError(undefined);setRevision(n=>n+1);}}>Retry administration</Button></div>:null;
 const selectedTemplate=data.templates.find(t=>t.id===templateId);
 return <><Card title="Project Administration" help="Create a project in Setup, establish its Project Admin and complete readiness before activation. Manage reusable templates in Tenant General Settings before creating a project."><div className="stack">
 {error&&!open&&<ErrorBanner message={error}/>}
 {data.canCreateProject&&<div className="row"><Button disabled={recommissionLocked||!!recommission||ownerToken!==null||open} onClick={()=>{if(!owner.claim(token))return;setName('');setTemplateId('');setCrewBuild('FULL');setConsent(false);setStep(0);setOpen(true);setCreated(undefined);setError(undefined);}}>Create Project</Button></div>}
 {open&&<AdministrationDialog title={created?'Project Created':'Create a Project'} step={{current:step+1,total:4,label:['Project name','Starting configuration','Review','Complete'][step]!}} onClose={close} closeDisabled={busy||uncertain}
 footer={created?<><Link className="button button-secondary" href={`/projects/${created.id}/admin`}>Set up Project Admin</Link><Button onClick={close}>Close</Button></>:<><Button variant="secondary" disabled={busy||uncertain} onClick={command.current.stale?reload:close}>{command.current.stale?'Reload administration':'Cancel'}</Button><div className="row">{step>0&&<Button variant="secondary" disabled={locked} onClick={()=>{setStep(step-1);setConsent(false);}}>Back</Button>}{step<2?<Button disabled={locked||!name.trim()} onClick={()=>setStep(step+1)}>Next</Button>:<Button disabled={busy||command.current.stale||!consent||!name.trim()} onClick={()=>void submit()}>{busy?'Creating…':uncertain?'Retry unchanged project':'Create project'}</Button>}</div></>}>
 {error&&<ErrorBanner message={error}/>} {command.current.stale&&<p role="alert">State changed. Reload and review again before creating.</p>}
 {step===0&&<Field label="Project name"><Input required maxLength={160} value={name} disabled={locked} onChange={e=>setName(e.target.value)}/></Field>}
 {step===1&&<><Field label="Project template"><select className="select" value={templateId} disabled={locked} onChange={e=>setTemplateId(e.target.value)}><option value="">Start without a template</option>{data.templates.map(t=><option key={t.id} value={t.id}>{t.name} · {t.crewBuild}</option>)}</select></Field>{!templateId&&<Field label="Crew build"><select className="select" value={crewBuild} disabled={locked} onChange={e=>setCrewBuild(e.target.value as CrewBuild)}><option value="FULL">Full · Superintendent, Party Chief, Instrument Man</option><option value="MEDIUM">Medium · Party Chief, Instrument Man</option><option value="SLIM">Slim · Instrument Man</option></select></Field>}<p className="muted">Create reusable templates in Tenant General Settings before starting this flow.</p></>}
 {step===2&&<><dl className="administration-dialog-summary"><div><dt>Project</dt><dd>{name.trim()}</dd></div><div><dt>Starting configuration</dt><dd>{selectedTemplate?`${selectedTemplate.name} · ${selectedTemplate.crewBuild}`:`No template · ${crewBuild}`}</dd></div></dl><p>The project begins in Setup. Establish its Project Admin and complete readiness before activation.</p><label className="checkbox-row"><input type="checkbox" checked={consent} disabled={locked} onChange={e=>setConsent(e.target.checked)}/><span>I confirm this project and starting configuration.</span></label></>}
 {created&&<><SuccessBanner message={`${created.name} was created in Setup.`}/><p>Next, set up the Project Admin who will configure this project and its personnel.</p><dl className="administration-dialog-summary"><div><dt>Project reference</dt><dd>{created.id}</dd></div></dl></>}
 </AdministrationDialog>}
 {data.canCreateProject&&<Link className="app-link" href="/accounts">Tenant accounts and Central IT reviews</Link>}
 {recommission&&<ProjectRecommissioning key={recommission} projectId={recommission} onClose={()=>setRecommission(undefined)} onChanged={()=>setRevision(n=>n+1)} onLockChange={setRecommissionLocked}/>}
 <AdministrationSection title="Administered Projects" open help="Filter, sort, select and export the loaded administered project inventory. Open a project's administration to manage personnel, companies, Survey and settings."><AdministrationRecords label="administered projects" rows={data.projects} id={p=>p.id} columns={[{key:'name',label:'Project',text:p=>p.name},{key:'status',label:'Status',text:p=>p.status==='SETUP'?'Setup':p.status==='ACTIVE'?'Active':'Archived'}]} actions={p=><><Link className="app-link" href={`/projects/${p.id}/admin`}>Open administration</Link>{data.canCreateProject&&(p.status==='ARCHIVED'||p.recommissioning)?<Button variant="secondary" disabled={recommissionLocked||locked||open||ownerToken!==null} onClick={()=>setRecommission(p.id)}>{p.status==='ARCHIVED'?'Review recommissioning':'Continue readiness review'}</Button>:null}</>}/></AdministrationSection>
 </div></Card>{data.canCreateProject&&<TenantHomeSettings owner={owner} disabled={open||recommissionLocked||!!recommission} onTemplatesChanged={()=>setRevision(n=>n+1)}/>}</>;
}
