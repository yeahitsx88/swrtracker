'use client';
import {useEffect,useRef,useState,type FormEvent} from 'react';
import {apiClient,createIdempotencyKey} from '@/lib/apiClient';
import {ApiClientError,getErrorMessage} from '@/lib/errors';
import {FrozenCommand} from '@/lib/frozen-command';
import type {GrantSuperintendentAreaInput,GrantSuperintendentAreaResult,SuperintendentCoverageReview} from '@/modules/tenancy/application/grant-superintendent-area';
import type {UUID} from '@/shared/types';
import {Button,ErrorBanner,SuccessBanner} from '@/components/ui';
import {blockersFrom} from './action-blockers';
import {HeadingHelp} from './heading-help';
import './team-management.css';

/** Survey Manager gives a Superintendent complete individual coverage of one top-level Area. */
export function SuperintendentAreaGrant({projectId,superintendentId,disabled=false,isBlocked,onLockChange,onGranted}:{projectId:string;superintendentId:UUID;disabled?:boolean;isBlocked?:()=>boolean;onLockChange?:(locked:boolean)=>void;onGranted?:(result:GrantSuperintendentAreaResult)=>void}){
 const gate=useRef(new FrozenCommand<GrantSuperintendentAreaInput>()).current;
 const [review,setReview]=useState<SuperintendentCoverageReview>(),[loading,setLoading]=useState(false),[revision,setRevision]=useState(0);
 const [areaId,setAreaId]=useState(''),[reason,setReason]=useState(''),[confirmed,setConfirmed]=useState(false);
 const [error,setError]=useState<string>(),[success,setSuccess]=useState<string>(),[,render]=useState(0);
 const locked=gate.locked||disabled;
 useEffect(()=>{
  let active=true;setLoading(true);setError(undefined);
  apiClient.reviewSuperintendentCoverage(projectId,superintendentId).then(result=>{if(active){setReview(result);setAreaId('');setConfirmed(false);}})
   .catch(cause=>{if(active)setError(getErrorMessage(cause,'Unable to read current Area coverage.'));})
   .finally(()=>{if(active)setLoading(false);});
  return()=>{active=false;};
 },[projectId,superintendentId,revision]);
 const readOnly=!!review&&(review.project.status==='ARCHIVED'||review.project.crewBuild!=='FULL');
 const area=review?.grantableAreas.find(item=>item.areaId===areaId);
 const choosable=!!review?.grantableAreas.length;
 const blockers=blockersFrom([
  [!review,'Current coverage has not loaded yet. Use Reload coverage.'],
  [readOnly,'Area coverage can only change on an editable Full crew build project.'],
  [!!review&&!review.person.active,'This Superintendent’s account or project access is inactive.'],
  [gate.stale,'Coverage changed since this review loaded. Use Reload coverage, then review again.'],
  [!!review&&!review.grantableAreas.length,'Every live top-level Area is already fully covered by this Superintendent.'],
  [choosable&&!areaId,'Choose the Area to cover.','tm-grant-area'],
  [choosable&&reason.trim().length<10,'Give a reason of at least 10 characters.','tm-grant-reason'],
  [choosable&&!confirmed,'Tick the confirmation box.','tm-grant-confirm'],
 ]);
 function reload(){if(gate.pending||isBlocked?.())return;if(!gate.reload())return;onLockChange?.(false);setSuccess(undefined);setRevision(n=>n+1);render(n=>n+1);}
 async function submit(event:FormEvent){
  event.preventDefault();
  if(isBlocked?.()||!review||(!gate.command&&blockers.length))return;
  const frozen=gate.begin({action:'grant-superintendent-area',superintendentId,areaId:areaId as UUID,expectedSnapshot:review.snapshotToken,reason:reason.trim(),confirmGrant:true},createIdempotencyKey());
  if(!frozen)return;
  onLockChange?.(true);render(n=>n+1);setError(undefined);setSuccess(undefined);
  try{
   const result=await apiClient.grantSuperintendentArea(projectId,frozen.body,frozen.key);
   gate.success();onLockChange?.(false);
   setSuccess(`${area?.areaName??'The Area'} is now covered. Crews in that Area can report to ${review.person.name}.`);
   setReason('');setRevision(n=>n+1);onGranted?.(result);
  }catch(cause){
   const status=cause instanceof ApiClientError?cause.status:undefined;
   gate.fail(status);if(!gate.locked)onLockChange?.(false);
   setError(getErrorMessage(cause,'The grant was not confirmed. Retry to send the same grant.'));
  }finally{render(n=>n+1);}
 }
 return <section className="tm-section stack" aria-label="Superintendent Area coverage">
  <HeadingHelp label="Area coverage" heading={<h3 className="panel-title">Area Coverage</h3>} help={<span>A Superintendent needs their own coverage of an Area before Party Chiefs there can report to them. Named-team Areas do not count. This adds the individual assignment and the review responsibility together; remove coverage with the obligations review below.</span>}/>
  {success?<SuccessBanner message={success}/>:null}{error?<ErrorBanner message={error}/>:null}{loading?<p className="muted" role="status">Loading current coverage…</p>:null}
  {review?<>
   <p>Covered now: {review.coveredAreas.length?review.coveredAreas.map(item=><span key={item.areaId} className="chip">{item.areaName}{item.complete?'':item.assignmentId?' · review missing':' · assignment missing'}</span>):<strong>none</strong>}</p>
   {readOnly?<p className="muted">This project’s Area coverage is read-only.</p>:!choosable&&!gate.command?<p className="muted">Every live top-level Area is already covered by {review.person.name}. To remove coverage, use the obligations review below.</p>:<form className="stack" onSubmit={submit} aria-label="Give Area coverage">
    <label className="field" id="tm-grant-area"><span className="field-label">Area to cover</span><select className="select" value={areaId} disabled={locked} onChange={event=>{setAreaId(event.target.value);setConfirmed(false);}}>
     <option value="">{review.grantableAreas.length?'Choose a top-level Area':'No uncovered top-level Areas'}</option>
     {review.grantableAreas.map(item=><option key={item.areaId} value={item.areaId}>{item.areaName}</option>)}</select></label>
    <label className="field" id="tm-grant-reason"><span className="field-label">Reason (10–1000 characters)</span><textarea className="textarea" maxLength={1000} value={reason} disabled={locked} onChange={event=>setReason(event.target.value)}/></label>
    <label className="tm-check" id="tm-grant-confirm"><input type="checkbox" checked={confirmed} disabled={locked} onChange={event=>setConfirmed(event.target.checked)}/><span>I confirm {review.person.name} should cover {area?.areaName??'this Area'}. Existing coverage, crews and request history stay unchanged.</span></label>
    {gate.command&&!gate.pending&&!gate.stale?<p role="status">The last grant is unconfirmed. Retry sends the same grant once.</p>:null}
    <div className="row"><Button type="submit" disabled={gate.pending||disabled} blockers={gate.command&&!gate.stale?[]:blockers} blockedTitle="Can’t give coverage yet">{gate.pending?'Granting…':gate.command&&!gate.stale?'Retry unchanged grant':'Give Area coverage'}</Button>
     <Button type="button" variant="secondary" disabled={gate.pending||(!!gate.command&&!gate.stale)} onClick={reload}>Reload coverage</Button></div>
   </form>}
  </>:null}
 </section>;
}
