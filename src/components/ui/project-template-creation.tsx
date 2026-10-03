'use client';
import {useRef,useState,useSyncExternalStore} from 'react';
import {apiRequest} from '@/lib/apiClient';
import {ApiClientError,getErrorMessage} from '@/lib/errors';
import {FrozenCommand,CommandOwner} from '@/lib/frozen-command';
import {useUnsavedProgress} from '@/lib/use-unsaved-progress';
import {Button,ErrorBanner,Input,SuccessBanner,Textarea} from '@/components/ui';
import {Field} from '@/components/forms';
import {AdministrationDialog} from './administration-dialog';
import type {CrewBuild} from '@/modules/tenancy/domain/types';
type Body={name:string;crewBuild:CrewBuild;aorDepth:number;aorLevelLabels:string[];disciplineGroups:string[]};
export function ProjectTemplateCreation({onClose,onCreated,owner}:{onClose:()=>void;onCreated:(template:{id:string;name:string})=>void;owner?:CommandOwner}){
 const fallbackOwner=useRef(new CommandOwner()).current;const commandOwner=owner??fallbackOwner,token='template-creation';useSyncExternalStore(commandOwner.subscribe,commandOwner.snapshot,commandOwner.snapshot);
 const [step,setStep]=useState(0),[name,setName]=useState(''),[crewBuild,setCrewBuild]=useState<CrewBuild>('FULL'),[labels,setLabels]=useState(''),[groups,setGroups]=useState('');
 const [consent,setConsent]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState<string>(),[result,setResult]=useState<{id:string;name:string}>();
 const gate=useRef(new FrozenCommand<Body>());const blocked=commandOwner.blocked(token),locked=blocked||gate.current.locked,uncertain=!!gate.current.command&&!gate.current.stale;
 useUnsavedProgress(locked);
 const lines=(text:string)=>text.split('\n').map(line=>line.trim()).filter(Boolean);
 const input:Body={name:name.trim(),crewBuild,aorDepth:lines(labels).length,aorLevelLabels:lines(labels),disciplineGroups:lines(groups)};
 function close(){if(!blocked&&gate.current.reload()){commandOwner.release(token);onClose();}}
 async function save(){if(!consent||blocked||!commandOwner.claim(token))return;const attempt=gate.current.begin(input,crypto.randomUUID());if(!attempt)return;setBusy(true);setError(undefined);
  try{const response=await apiRequest<{template:{id:string;name:string}}>('/api/project-templates',{method:'POST',body:attempt.body,headers:{'Idempotency-Key':attempt.key}});gate.current.success();setResult(response.template);setStep(3);onCreated(response.template);}
  catch(cause){gate.current.fail(cause instanceof ApiClientError?cause.status:undefined);setError(getErrorMessage(cause,'Unable to confirm template creation. Retry the unchanged template.'));}finally{setBusy(false);}
 }
 return <AdministrationDialog title={result?'Template Created':'Create a Project Template'} help="Save a reusable starting configuration for projects in this tenant." step={{current:step+1,total:4,label:['Name','Configuration','Review','Complete'][step]!}} onClose={close} closeDisabled={blocked||busy||uncertain}
 footer={result?<Button onClick={close}>Close</Button>:<><Button variant="secondary" disabled={blocked||busy||uncertain} onClick={()=>{if(gate.current.stale){gate.current.reload();setStep(0);setConsent(false);setError(undefined);}else close();}}>{gate.current.stale?'Reload review':'Cancel'}</Button><div className="row">{step>0&&<Button variant="secondary" disabled={locked} onClick={()=>{setStep(step-1);setConsent(false);}}>Back</Button>}{step<2?<Button disabled={locked||!name.trim()} onClick={()=>setStep(step+1)}>Next</Button>:<Button disabled={blocked||busy||gate.current.stale||!consent} onClick={()=>void save()}>{busy?'Creating…':uncertain?'Retry unchanged template':'Create template'}</Button>}</div></>}>
 {error&&<ErrorBanner message={error}/>} {gate.current.stale&&<p role="alert">State changed. Reload and confirm the configuration again.</p>}
 {step===0&&<Field label="Template name"><Input value={name} maxLength={160} disabled={locked} onChange={e=>setName(e.target.value)}/></Field>}
 {step===1&&<><Field label="Crew build"><select className="select" value={crewBuild} disabled={locked} onChange={e=>setCrewBuild(e.target.value as CrewBuild)}><option value="FULL">Full</option><option value="MEDIUM">Medium</option><option value="SLIM">Slim</option></select></Field><Field label="Area hierarchy level labels"><Textarea value={labels} maxLength={2000} disabled={locked} onChange={e=>setLabels(e.target.value)}/><span className="muted">One level per line, from highest to lowest. Leave blank for no hierarchy.</span></Field><Field label="Discipline groups"><Textarea value={groups} maxLength={4000} disabled={locked} onChange={e=>setGroups(e.target.value)}/><span className="muted">One group per line. These become the project's starting discipline groups.</span></Field></>}
 {step===2&&<><dl className="administration-dialog-summary"><div><dt>Name</dt><dd>{input.name}</dd></div><div><dt>Crew build</dt><dd>{crewBuild}</dd></div><div><dt>Area hierarchy</dt><dd>{input.aorLevelLabels.join(' → ')||'No hierarchy'}</dd></div><div><dt>Discipline groups</dt><dd>{input.disciplineGroups.join(', ')||'None'}</dd></div></dl><p>Existing projects remain unchanged. Choose this template when creating a project or configuring an initial Setup project.</p><label className="checkbox-row"><input type="checkbox" checked={consent} disabled={locked} onChange={e=>setConsent(e.target.checked)}/><span>I confirm this reusable configuration.</span></label></>}
 {result&&<><SuccessBanner message={`${result.name} is ready to use.`}/><dl className="administration-dialog-summary"><div><dt>Template reference</dt><dd>{result.id}</dd></div></dl></>}
 </AdministrationDialog>;
}
