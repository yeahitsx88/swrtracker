'use client';
import {useEffect,useRef,useState} from 'react';
import {apiClient,apiRequest} from '@/lib/apiClient';
import {ApiClientError,getErrorMessage} from '@/lib/errors';
import {CommandOwner,FrozenCommand} from '@/lib/frozen-command';
import {Button,Input,ErrorBanner,SuccessBanner} from '@/components/ui';
import {AdministrationSection} from './administration-records';
import {useAdministrationProgress} from '@/lib/use-administration-progress';
import type {SurveyTeamSummary,TeamArea} from '@/modules/tenancy/application/survey-teams';
import type {WorkforcePerson} from '@/modules/tenancy/application/survey-workforce';
import type {ReorganizationSelection,ReorganizationPreview} from '@/modules/tenancy/application/reorganize-survey';
import type {UUID} from '@/shared/types';
export function SurveyReorganization({projectId,archived,onLockChange,isBlocked,owner:workspaceOwner,initialMove,onCommitted,onReviewReloaded}:{initialMove?:{kind:'CREW'|'INSTRUMENT_MAN';partyChiefId:string;instrumentManId?:string;superintendentId?:string};onCommitted?:()=>void;onReviewReloaded?:()=>void;projectId:string;archived:boolean;owner?:CommandOwner;onLockChange?:(locked:boolean)=>void;isBlocked?:()=>boolean}){
 const owner=useRef(new CommandOwner()).current,commandOwner=workspaceOwner??owner,busy=useRef(false);
 useAdministrationProgress(commandOwner,`/projects/${projectId}/survey/teams`);
 const [teams,setTeams]=useState<SurveyTeamSummary[]>([]),[destinationTeam,setDestinationTeam]=useState('');
 const [people,setPeople]=useState<WorkforcePerson[]>([]),[areas,setAreas]=useState<TeamArea[]>([]),[build,setBuild]=useState('FULL'),[kind,setKind]=useState<'CREW'|'INSTRUMENT_MAN'>(initialMove?.kind??'CREW'),[chief,setChief]=useState(initialMove?.partyChiefId??''),[instrument,setInstrument]=useState(initialMove?.instrumentManId??''),[area,setArea]=useState(''),[superintendent,setSuperintendent]=useState(initialMove?.superintendentId??'');
 const [preview,setPreview]=useState<Omit<ReorganizationPreview,'state'>>(),[reason,setReason]=useState(''),[consent,setConsent]=useState(false),[error,setError]=useState<string>(),[success,setSuccess]=useState<string>(),[loading,setLoading]=useState(false),[,render]=useState(0);
 const gate=useRef(new FrozenCommand<ReorganizationSelection&{snapshot:string;reason:string;confirmed:true}>()).current;
 const base=`/api/projects/${projectId}/survey/reorganization`;
 async function readChoices(){
  const context=await apiClient.workforceContext(projectId),personnel:WorkforcePerson[]=[],locations:TeamArea[]=[],namedTeams:SurveyTeamSummary[]=[];
  for(let offset=0;;offset+=100){const page=await apiClient.workforce(projectId,{search:'',limit:100,offset});personnel.push(...page.data);if(offset+100>=page.total)break;}
  for(let offset=0;;offset+=100){const page=await apiClient.listTeamAreas(projectId,{search:'',limit:100,offset});locations.push(...page.data);if(offset+100>=page.total)break;}
  for(let offset=0;;offset+=100){const page=await apiClient.listSurveyTeams(projectId,{search:'',limit:100,offset});namedTeams.push(...page.data);if(offset+100>=page.total)break;}
  return {context,personnel,locations,namedTeams};
 }
 function acceptChoices(current:Awaited<ReturnType<typeof readChoices>>){setPeople(current.personnel);setAreas(current.locations);setBuild(current.context.project.crewBuild);setTeams(current.namedTeams);}
 useEffect(()=>{let active=true;void readChoices().then(current=>{if(active)acceptChoices(current);}).catch(cause=>{if(active)setError(getErrorMessage(cause,'Unable to load current movement choices.'));});return()=>{active=false;};},[projectId]);
 const locked=gate.locked||loading;
 function selection():ReorganizationSelection{return kind==='CREW'?{kind,partyChiefId:chief as UUID,areaId:area as UUID,superintendentId:build==='FULL'?superintendent as UUID:null,...(destinationTeam?{destinationTeamId:destinationTeam as UUID}:{})}:{kind,instrumentManId:instrument as UUID,partyChiefId:chief as UUID};}
 async function inspect(){if(isBlocked?.()||busy.current||gate.locked)return;busy.current=true;setLoading(true);setError(undefined);setSuccess(undefined);try{const query=new URLSearchParams(Object.entries(selection()).map(([k,v])=>[k,String(v)]));onLockChange?.(true);setPreview((await apiRequest<{preview:Omit<ReorganizationPreview,'state'>}>(`${base}?${query}`)).preview);setConsent(false);}catch(cause){onLockChange?.(false);setError(getErrorMessage(cause,'Unable to preview this move.'));}finally{busy.current=false;setLoading(false);}}
 async function save(){if(isBlocked?.()||busy.current||archived)return;if(!preview||!consent)return;const frozen=gate.begin({...preview.selection,snapshot:preview.snapshot,reason,confirmed:true},crypto.randomUUID());if(!frozen)return;busy.current=true;render(v=>v+1);setError(undefined);try{await apiRequest(base,{method:'POST',body:frozen.body,headers:{'Idempotency-Key':frozen.key}});gate.success();onLockChange?.(false);setSuccess('Manpower move saved atomically. Requests and historical assignments were retained. Reload Team Management to see current staffing.');setPreview(undefined);setConsent(false);onCommitted?.();}catch(cause){gate.fail(cause instanceof ApiClientError?cause.status:undefined);setError(getErrorMessage(cause,'Outcome uncertain. Retry the unchanged move.'));}finally{busy.current=false;render(v=>v+1);}}
 async function reload(){
  if(isBlocked?.()||busy.current||gate.pending||gate.command&&!gate.stale)return;
  busy.current=true;setLoading(true);setError(undefined);
  try{const current=await readChoices();if(gate.reload()){acceptChoices(current);onLockChange?.(false);setPreview(undefined);setConsent(false);setReason('');setChief('');setArea('');setSuperintendent('');setInstrument('');setDestinationTeam('');render(v=>v+1);onReviewReloaded?.();}}
  catch(cause){setError(getErrorMessage(cause,'Unable to read current movement choices. Keep this review and retry loading.'));}
  finally{busy.current=false;setLoading(false);}
 }
 return <AdministrationSection title="Coordinate Manpower Movement" open={!!initialMove} locked={locked}>
 <p>Move a Chief and their complete current crew to an explicit existing named team, or change same-Area reporting only. Team coverage stays intact; the Chief’s individual Area and reporting are reviewed separately. Existing request assignments never move automatically.</p>{archived&&<p>Archived project: manpower is read-only.</p>}{error&&<ErrorBanner message={error}/>} {success&&<SuccessBanner message={success}/>}
 <label className="field"><span className="field-label">Movement</span><select className="select" value={kind} disabled={locked||archived||!!preview} onChange={e=>setKind(e.target.value as typeof kind)}><option value="CREW">Party Chief / intact crew</option><option value="INSTRUMENT_MAN">Instrument Man between crews</option></select></label>
 {kind==='INSTRUMENT_MAN'&&<label className="field"><span className="field-label">Instrument Man</span><select className="select" value={instrument} disabled={locked||archived||!!preview} onChange={e=>setInstrument(e.target.value)}><option value="">Choose a person</option>{people.filter(p=>p.role==='INSTRUMENT_MAN').map(p=><option key={p.userId} value={p.userId}>{p.name} · {p.email}</option>)}</select></label>}
 <label className="field"><span className="field-label">{kind==='CREW'?'Party Chief / crew':'Destination Party Chief'}</span><select className="select" value={chief} disabled={locked||archived||!!preview} onChange={e=>setChief(e.target.value)}><option value="">Choose a Chief</option>{people.filter(p=>p.role==='PARTY_CHIEF').map(p=><option key={p.userId} value={p.userId}>{p.name} · {p.email}</option>)}</select></label>
 {kind==='CREW'&&<><label className="field"><span className="field-label">Destination Named Team</span><select className="select" value={destinationTeam} disabled={locked||archived||!!preview} onChange={e=>setDestinationTeam(e.target.value)}><option value="">Same-Area reporting only — keep current team</option>{teams.map(t=><option key={t.id} value={t.id}>{t.name} · {(t.areas??[{id:t.areaId,name:t.areaName}]).map(a=>a.name).join(', ')}</option>)}</select></label><label className="field"><span className="field-label">Destination Area</span><select className="select" value={area} disabled={locked||archived||!!preview} onChange={e=>setArea(e.target.value)}><option value="">Choose an Area</option>{areas.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>{build==='FULL'&&<label className="field"><span className="field-label">Responsible Superintendent</span><select className="select" value={superintendent} disabled={locked||archived||!!preview} onChange={e=>setSuperintendent(e.target.value)}><option value="">Choose a Superintendent with existing Area coverage</option>{people.filter(p=>p.role==='SURVEY_SUPERINTENDENT').map(p=><option key={p.userId} value={p.userId}>{p.name} · {p.email}</option>)}</select></label>}</>}
 {!preview&&<Button disabled={locked||archived||!chief||(kind==='CREW'?(!area||build==='FULL'&&!superintendent):!instrument)} onClick={()=>void inspect()}>Preview Manpower Move</Button>}
 {preview&&<><ul aria-label="Reviewed Movement Facts" style={{overflowWrap:'anywhere'}}>{preview.summary.map(line=><li key={line}>{line}</li>)}</ul>{preview.blockers.length>0&&<ErrorBanner message={preview.blockers.join('; ')}/>}<label className="field"><span className="field-label">Reason (10–1000 characters)</span><Input value={reason} maxLength={1000} disabled={locked} onChange={e=>{setReason(e.target.value);setConsent(false);}}/></label><label className="checkbox-row"><input type="checkbox" checked={consent} disabled={locked} onChange={e=>setConsent(e.target.checked)}/><span>I confirm the displayed move and preservation of existing request assignments.</span></label><Button disabled={archived||loading||gate.pending||gate.stale||!consent||reason.trim().length<10||preview.blockers.length>0} onClick={()=>void save()}>{gate.pending?'Moving personnel…':gate.command&&!gate.stale?'Retry Unchanged Move':'Confirm Manpower Move'}</Button></>}
 {gate.stale&&<p role="alert">Staffing or work changed. Reload this preview before confirming again.</p>}
 <Button variant="secondary" disabled={loading||gate.pending||!!gate.command&&!gate.stale} onClick={()=>void reload()}>Reload Current Movement Choices</Button>
 </AdministrationSection>;
}
