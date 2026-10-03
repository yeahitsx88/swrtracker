'use client';
import {useEffect,useRef,useState,useSyncExternalStore,useId} from 'react';
import Link from 'next/link';
import {apiRequest} from '@/lib/apiClient';
import {ApiClientError,getErrorMessage} from '@/lib/errors';
import {FrozenCommand,CommandOwner} from '@/lib/frozen-command';
import type {OffboardingPreview,OffboardingResult,OffboardingScope} from '@/lib/contracts/account-offboarding';
import {Button,ErrorBanner,Input,SuccessBanner} from '@/components/ui';
type Body={subjectUserId:string;scope:OffboardingScope;reason:string;snapshot:string;confirmed:true};
export function AccountOffboarding({subjectUserId,subjectName,scope,onResult,onLockChange,commandOwner,onCancel}:{subjectUserId:string;subjectName:string;scope:OffboardingScope;commandOwner?:CommandOwner;onCancel?:()=>void;onResult?:(result:OffboardingResult)=>void;onLockChange?:(locked:boolean)=>void}){
 const fallback=useRef(new CommandOwner());const owner=commandOwner??fallback.current;const token=useId();useSyncExternalStore(owner.subscribe,owner.snapshot,owner.snapshot);const blocked=owner.blocked(token);
 const [replayed,setReplayed]=useState(false);
 const url=scope.kind==='TENANT_ACCOUNT'?`/api/accounts/${subjectUserId}/offboarding`:`/api/projects/${scope.projectId}/members/${subjectUserId}/offboarding`;
 const [preview,setPreview]=useState<OffboardingPreview>(),[reason,setReason]=useState(''),[confirmed,setConfirmed]=useState(false);
 const [error,setError]=useState<string>(),[result,setResult]=useState<OffboardingResult>(),[loading,setLoading]=useState(false),[revision,setRevision]=useState(0);
 const gate=useRef(new FrozenCommand<Body>()),generation=useRef(0);
 const heading=useRef<HTMLHeadingElement>(null);useEffect(()=>{heading.current?.focus();},[result]);
 const action=scope.kind==='TENANT_ACCOUNT'?'Disable tenant account':'Remove from this project';
 async function load(offset=0,snapshot?:string){const epoch=++generation.current;setLoading(true);setError(undefined);setPreview(undefined);setConfirmed(false);
  try{const value=await apiRequest<{preview:OffboardingPreview}>(`${url}?offset=${offset}${snapshot?`&snapshot=${snapshot}`:''}`);if(epoch===generation.current)setPreview(value.preview);}
  catch(cause){if(epoch===generation.current){if(cause instanceof ApiClientError&&cause.status===409)gate.current.fail(409);setError(getErrorMessage(cause,'Unable to load offboarding evidence.'));}}
  finally{if(epoch===generation.current){setLoading(false);setRevision(n=>n+1);}}
 }
 useEffect(()=>{void load();return()=>{generation.current++;};},[url]); // Selected person/scope mounts a new editor.
 async function submit(){if(!preview||!owner.claim(token))return;const frozen=gate.current.begin({subjectUserId,scope,reason:reason.trim(),snapshot:preview.snapshot,confirmed:true},crypto.randomUUID());if(!frozen){if(!gate.current.locked)owner.release(token);return;}onLockChange?.(true);
  setError(undefined);setRevision(n=>n+1);
  try{const value=await apiRequest<{result:OffboardingResult;replayed:boolean}>(url,{method:'POST',body:frozen.body,headers:{'Idempotency-Key':frozen.key}});gate.current.success();setResult(value.result);setReplayed(value.replayed);onResult?.(value.result);}
  catch(cause){gate.current.fail(cause instanceof ApiClientError?cause.status:undefined);setError(getErrorMessage(cause,'The response is uncertain. Retry the same confirmed action.'));}
  finally{if(!gate.current.locked)owner.release(token);onLockChange?.(gate.current.locked);setRevision(n=>n+1);}
 }
 void revision;
 return <section className="stack" aria-label={`${action}: ${subjectName}`}>
 <h3 ref={heading} tabIndex={-1} className="panel-title">{action}: {subjectName}</h3>
 {onCancel&&<div className="row"><Button variant="secondary" disabled={blocked||gate.current.pending||!!gate.current.command&&!gate.current.stale} onClick={()=>{if(owner.blocked(token)||!gate.current.reload())return;owner.release(token);onLockChange?.(false);onCancel();}}>{result?'Close access review':'Cancel access removal'}</Button></div>}
 <p>{scope.kind==='TENANT_ACCOUNT'?'This disables access across this tenant.':'This removes access to this project. The account and access to other projects remain.'} Historical requests, drafts, files and audit evidence are retained.</p>
 {error&&<ErrorBanner message={error}/>}
 {loading&&<p role="status">Loading current duties and continuity checks…</p>}
 {preview&&!result&&<>
 {preview.retainsCentralIT&&<p role="note">This person retains separate Central IT support authority. Only a separately confirmed tenant account disable removes that authority.</p>}
 {preview.alreadyDisabled?<p>Access is already disabled. A confirmed retry records no additional transition.</p>:null}
 {preview.blockerTotal?<><p>Resolve these blockers before disabling access:</p><ul>{preview.blockers.map((b,i)=><li key={`${b.code}-${b.projectId}-${i}`}>{b.code.replaceAll('_',' ')} · {b.count}{b.resolutionPath&&<> · <Link className="app-link" href={b.resolutionPath}>Resolve duty</Link></>}</li>)}</ul><div className="row"><Button variant="secondary" disabled={blocked||loading||gate.current.locked||preview.blockerOffset===0} onClick={()=>void load(preview.blockerOffset-25,preview.snapshot)}>Previous blockers</Button><span>{preview.blockerOffset+1}–{preview.blockerOffset+preview.blockers.length} of {preview.blockerTotal}</span><Button variant="secondary" disabled={blocked||loading||gate.current.locked||preview.blockerOffset+25>=preview.blockerTotal} onClick={()=>void load(preview.blockerOffset+25,preview.snapshot)}>Next blockers</Button></div></>:<p>No unresolved duty or continuity blockers in this scope.</p>}
 {scope.kind==='PROJECT_ACCESS'&&<p>{preview.centralITRecipientCount?`Central IT review will be queued for ${preview.centralITRecipientCount} current recipient(s).`:'No eligible Central IT recipient is available. No review notification will be queued.'}</p>}
 <label className="field"><span className="field-label">Reason (10–1000 characters)</span><Input value={reason} maxLength={1000} disabled={blocked||gate.current.locked} onChange={e=>setReason(e.target.value)}/></label>
 <label className="checkbox-row"><input type="checkbox" checked={confirmed} disabled={blocked||gate.current.locked} onChange={e=>setConfirmed(e.target.checked)}/><span>I confirm: {action.toLowerCase()} for {subjectName}.</span></label>
 <div className="row"><Button variant="danger" disabled={blocked||loading||gate.current.pending||gate.current.stale||!confirmed||reason.trim().length<10||preview.blockerTotal>0} onClick={()=>void submit()}>{gate.current.pending?'Submitting…':gate.current.command?'Retry same confirmed action':action}</Button>
 </div>
 {gate.current.stale&&<p role="alert">The evidence changed. Reload and confirm the displayed scope again.</p>}
 {gate.current.command&&!gate.current.stale&&!gate.current.pending&&<p role="status">The outcome is uncertain. Your reason, scope and retry key are frozen until the same action returns a definite response.</p>}
 </>}
 <Button variant="secondary" disabled={blocked||loading||gate.current.pending||!!gate.current.command&&!gate.current.stale} onClick={()=>{if(!owner.blocked(token)&&gate.current.reload()){owner.release(token);onLockChange?.(false);setResult(undefined);void load();}}}>Reload evidence</Button>
 {result&&<><SuccessBanner message={`${replayed?'Original confirmed operation replayed: ':''}${result.outcome==='DISABLED'?'Access disabled':'Access was already disabled'}. History was retained.`}/><p>{result.centralReview==='QUEUED'?'Central IT review queued. This does not disable the tenant account.':result.centralReview==='NOT_QUEUED_NO_CENTRAL_IT'?'No Central IT review was queued because there was no eligible recipient.':'No project review applies to this tenant action.'}</p><p>This is the recorded outcome of this operation. Reload evidence to check current access.</p><p>Lifecycle evidence: {result.eventId??'No new transition'} · {result.disabledAt}</p></>}
 </section>;
}
