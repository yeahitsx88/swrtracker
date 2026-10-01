'use client';
import {useEffect,useReducer,useRef,useState,type FormEvent} from 'react';
import type {UUID} from '@/shared/types';
import type {SuperintendentAreaReadQuery,UnlinkSuperintendentAreaResult} from '@/modules/tenancy/application/superintendent-area.types';
import {apiClient,createIdempotencyKey} from '@/lib/apiClient';
import {initialSuperintendentAreaEditor,reduceSuperintendentAreaEditor,canConfirmSuperintendentAreaUnlink,superintendentAreaFailure,superintendentAreaReadFailure} from '@/lib/superintendent-area-view';
import {Button,ErrorBanner,SuccessBanner} from '@/components/ui';
import {PaginationControls} from '@/components/forms';
import './team-management.css';
export function SuperintendentAreaObligations({projectId,superintendentId,disabled=false,isBlocked,invalidateVersion=0,onLockChange,onUnlinked}:{projectId:string;superintendentId:UUID;disabled?:boolean;isBlocked?:()=>boolean;invalidateVersion?:number;onLockChange?:(locked:boolean)=>void;onUnlinked?:(result:UnlinkSuperintendentAreaResult)=>void}){
 const [state,dispatch]=useReducer(reduceSuperintendentAreaEditor,undefined,initialSuperintendentAreaEditor);
 const [mode,setMode]=useState<'replacements'|'reporting'>('replacements');
 const [draft,setDraft]=useState(''),[search,setSearch]=useState(''),[limit,setLimit]=useState<10|25|50|100>(10),[offset,setOffset]=useState(0),[revision,setRevision]=useState(0),[success,setSuccess]=useState<string|null>(null);
 const heading=useRef<HTMLHeadingElement>(null),running=useRef(false),generation=useRef(0),seenInvalidation=useRef(invalidateVersion);
 const frozen=state.pending||state.uncertain||disabled;
 useEffect(()=>{dispatch({type:'person',superintendentId});},[superintendentId]);
 useEffect(()=>{if(seenInvalidation.current!==invalidateVersion){seenInvalidation.current=invalidateVersion;dispatch({type:'stale',message:'Related staffing changed. Reload current Area obligations before confirming.'});setSuccess(null);}},[invalidateVersion]);
 useEffect(()=>{
  if(!state.superintendentId||frozen)return;
  let active=true;const current=Math.max(generation.current,state.generation)+1;generation.current=current;dispatch({type:'load',generation:current});
  const query={search,limit,offset},input:SuperintendentAreaReadQuery=state.assignment?{mode:mode==='reporting'?'superintendent-area-reporting':'superintendent-area-replacements',superintendentId:state.superintendentId,linkId:state.assignment.assignmentId,query}:{mode:'superintendent-areas',superintendentId:state.superintendentId,query};
  apiClient.readSuperintendentAreas(projectId,input).then(data=>{if(active)dispatch({type:'read',generation:current,data});}).catch(error=>{if(active)dispatch(superintendentAreaReadFailure(error,current));});
  return()=>{active=false;};
 // A generation change invalidates late reads without silently replacing evidence.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[projectId,state.superintendentId,state.assignment?.assignmentId,mode,search,limit,offset,revision,frozen]);
 const resetQuery=()=>{setDraft('');setSearch('');setOffset(0);};
 function reload(){if(frozen||isBlocked?.())return;dispatch({type:'reload'});resetQuery();setMode('replacements');setRevision(n=>n+1);setSuccess(null);heading.current?.focus();}
 function cancel(){if(frozen||isBlocked?.())return;dispatch({type:'cancel'});resetQuery();setMode('replacements');heading.current?.focus();}
 async function submit(event:FormEvent){
  event.preventDefault();if(running.current||disabled||isBlocked?.())return;
  const next=reduceSuperintendentAreaEditor(state,state.uncertain?{type:'retry'}:{type:'begin',key:createIdempotencyKey()});if(!next.pending||!next.attempt)return;
  running.current=true;onLockChange?.(true);dispatch(state.uncertain?{type:'retry'}:{type:'begin',key:next.attempt.key});let retainLock=false;
  try{
   const result=await apiClient.unlinkSuperintendentArea(projectId,next.attempt.input,next.attempt.key);
   dispatch({type:'success',result});dispatch({type:'reload'});resetQuery();setMode('replacements');setRevision(n=>n+1);
   setSuccess('One individual Area assignment unlinked. Remaining assignments and obligations still need separate resolution before a role change.');onUnlinked?.(result);heading.current?.focus();
  }catch(error){const failure=superintendentAreaFailure(error);retainLock=failure.type==='uncertain';dispatch(failure);}
  finally{running.current=false;onLockChange?.(retainLock);}
 }
 const page=state.assignment?(mode==='reporting'?state.reporting?.reporting:state.replacements?.replacements):state.detail?.assignments;
 const label=state.assignment?(mode==='reporting'?'Search dependent Chiefs':'Search covered Superintendents'):'Search individual assignments by Area';
 const readOnly=state.detail?.project.status==='ARCHIVED'||state.detail?.project.crewBuild!=='FULL';
 return <section className="tm-section stack tm-workspace" aria-label="Superintendent individual Area obligations">
  <h3 className="panel-title" tabIndex={-1} ref={heading}>Superintendent individual Area obligations</h3>
  <p className="muted">Remove one individual assignment after replacement coverage and dependent reporting are resolved. Review handover and role changes are separate.</p>
  {success?<SuccessBanner message={success}/>:null}{state.stale?<ErrorBanner message="Area obligations changed. Reload current Area obligations before confirming; cancelling does not clear this warning."/>:null}{state.error?<ErrorBanner message={state.error}/>:null}{state.loading?<p role="status" className="muted">Loading Area obligations...</p>:null}
  {state.detail?<><p>Selected Superintendent: <strong>{state.detail.person.name}</strong>{!state.detail.person.active?' · Inactive':''}</p>{readOnly?<p className="muted">This project exposes read-only Area evidence. Cleanup requires an editable Full crew build.</p>:null}<p className="muted">Retained department evidence: {state.detail.departmentMembershipCount} memberships, {state.detail.sharedDepartmentAssignmentCount} shared Area assignments. These records are unchanged; they do not establish Superintendent visibility.</p></>:null}
  <form className="tm-search" onSubmit={e=>{e.preventDefault();if(!frozen&&!isBlocked?.()){setSearch(draft.trim());setOffset(0);setRevision(n=>n+1);}}}>
   <label className="field tm-search-text"><span className="field-label">{label}</span><input className="input" maxLength={200} value={draft} disabled={frozen} onChange={e=>setDraft(e.target.value)}/></label>
   <label className="field"><span className="field-label">Area evidence items per page</span><select className="select" value={limit} disabled={frozen} onChange={e=>{setLimit(Number(e.target.value) as typeof limit);setOffset(0);}}>{[10,25,50,100].map(n=><option value={n} key={n}>{n}</option>)}</select></label><Button type="submit" variant="secondary" disabled={frozen}>Search</Button>
  </form>
  {!state.assignment?<ul className="tm-list">{state.detail?.assignments.data.map(a=><li className="tm-person" key={a.assignmentId}><div><strong>{a.areaName}</strong><span className="tm-email muted">Individual assignment {a.assignmentId}</span></div><div><span className="tm-email">{a.duplicateIndividualCount} other exact duplicates · {a.overlappingIndividualCount} overlapping individual assignments</span><span className="tm-email">{a.responsibilityCount} protected · {a.actingCount} acting · {a.reportingCount} Chief reporting links</span>{a.refusalReason?<span className="muted">{a.refusalReason}</span>:null}</div><Button type="button" variant="secondary" aria-label={`Inspect individual assignment ${a.assignmentId}`} disabled={frozen||state.loading} onClick={()=>{if(isBlocked?.())return;dispatch({type:'assignment',assignment:a});resetQuery();setMode('replacements');setSuccess(null);heading.current?.focus();}}>Inspect assignment</Button></li>)}</ul>:<>
   <h4>Individual assignment: {state.assignment.areaName}</h4><p className="tm-email muted">Exact assignment {state.assignment.assignmentId}</p>
   {state.assignment.refusalReason?<p role="status">{state.assignment.refusalReason}. Resolve supported review grants above and Chief reporting through the existing Party Chief Staffing editor. Unsupported or inactive obligations require a separate approved contract.</p>:null}
   <div className="row"><Button type="button" variant="secondary" disabled={frozen} aria-pressed={mode==='replacements'} onClick={()=>{if(!isBlocked?.()){setMode('replacements');resetQuery();}}}>Choose covered replacement</Button><Button type="button" variant="secondary" disabled={frozen} aria-pressed={mode==='reporting'} onClick={()=>{if(!isBlocked?.()){setMode('reporting');resetQuery();}}}>View dependent Chiefs</Button></div>
   {mode==='reporting'?<ul className="tm-list">{state.reporting?.reporting.data.map(r=><li className="tm-person" key={r.linkId}><div><strong>{r.name}</strong><span className="tm-email muted">{r.email}</span></div><div>{r.areaName}{r.retired?' · Retired Area':''}{!r.active?' · Inactive':''}<span className="tm-email muted">{r.canUseStaffing?'Resolve deliberately through this Chief’s existing Staffing editor.':r.refusalReason??'Requires a separate approved cleanup contract.'}</span></div></li>)}</ul>:<ul className="tm-list">{state.replacements?.replacements.data.map(c=><li className="tm-person" key={c.userId}><div><strong>{c.name}</strong><span className="tm-email muted">{c.email}</span></div><div>Complete existing review and individual coverage</div><Button type="button" variant="secondary" aria-label={`Select covered replacement ${c.name}`} aria-pressed={state.replacement?.userId===c.userId} disabled={frozen||state.loading||state.stale||!!state.error} onClick={()=>{if(!isBlocked?.())dispatch({type:'replacement',replacement:c});}}>{state.replacement?.userId===c.userId?'Selected':'Select'}</Button></li>)}</ul>}
   {state.replacement?<form className="stack" onSubmit={submit} aria-label="Confirm Superintendent Area unlink"><p>Unlink <strong>{state.detail?.person.name}</strong>'s exact <strong>{state.assignment.areaName}</strong> individual assignment. Replacement: <strong>{state.replacement.name}</strong>.</p><ul><li>Reuse review grant {state.replacement.replacementGrantId}.</li><li>Reuse individual assignment {state.replacement.replacementAssignmentId}.</li><li>Keep other Areas, duplicate or overlapping assignments, department records, roles, crews and request history.</li></ul><label className="tm-check"><input type="checkbox" disabled={frozen||readOnly} checked={state.confirmed} onChange={e=>dispatch({type:'confirm',confirmed:e.target.checked})}/><span>I confirm unlinking this exact individual Area assignment after coverage and reporting are resolved.</span></label><div className="row"><Button type="submit" variant="danger" disabled={disabled||readOnly||state.pending||(!state.uncertain&&!canConfirmSuperintendentAreaUnlink(state))}>{state.pending?'Unlinking...':state.uncertain?'Retry unchanged Area unlink':'Confirm Area unlink'}</Button><Button type="button" variant="secondary" disabled={frozen} onClick={cancel}>Keep individual assignment</Button></div></form>:<Button type="button" variant="secondary" disabled={frozen} onClick={cancel}>Keep individual assignment</Button>}
  </>}
  {!state.loading&&page?.total===0?<p className="tm-empty">{!state.assignment?'No current individual assignments match. Other obligations may remain.':mode==='reporting'?'No dependent Chief reporting links match.':search?'No covered Superintendents match this search. Clear the search or change the filters.':'No current Superintendent has complete exact-Area coverage here. If a supported review grant remains, use its handover above; otherwise additional coverage requires separately authorized administration.'}</p>:null}
  {page&&page.total>0?<div className="tm-footer"><span className="muted" role="status">{page.total} results</span>{!frozen?<PaginationControls total={page.total} limit={limit} offset={offset} onChange={next=>{if(!isBlocked?.())setOffset(next);}}/>:null}</div>:null}
  <div className="row"><Button type="button" variant="secondary" disabled={frozen} onClick={reload}>Reload current Area obligations</Button></div>
 </section>;
}
