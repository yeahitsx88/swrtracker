'use client';
import {RecordCollection} from '@/components/ui/record-collection';
import {useEffect,useRef,useState,useSyncExternalStore,useId} from 'react';
import Link from 'next/link';
import {apiRequest} from '@/lib/apiClient';
import {ApiClientError,getErrorMessage} from '@/lib/errors';
import {FrozenCommand,CommandOwner} from '@/lib/frozen-command';
import type {OffboardingPreview,OffboardingResult,OffboardingScope} from '@/lib/contracts/account-offboarding';
import {Button,ErrorBanner,Input,SuccessBanner} from '@/components/ui';
import {blockersFrom} from '@/components/ui/action-blockers';
import {composeOffboardingReason,offboardingCommentLimit,OFFBOARDING_REASONS,OTHER_COMMENT_MIN,type OffboardingReasonCategory} from '@/lib/offboarding-reasons';
type Body={subjectUserId:string;scope:OffboardingScope;reason:string;snapshot:string;confirmed:true};
export function AccountOffboarding({subjectUserId,subjectName,scope,onResult,onLockChange,commandOwner,onCancel}:{subjectUserId:string;subjectName:string;scope:OffboardingScope;commandOwner?:CommandOwner;onCancel?:()=>void;onResult?:(result:OffboardingResult)=>void;onLockChange?:(locked:boolean)=>void}){
 const fallback=useRef(new CommandOwner());const owner=commandOwner??fallback.current;const token=useId();useSyncExternalStore(owner.subscribe,owner.snapshot,owner.snapshot);const blocked=owner.blocked(token);
 const [replayed,setReplayed]=useState(false);
 const url=scope.kind==='TENANT_ACCOUNT'?`/api/accounts/${subjectUserId}/offboarding`:`/api/projects/${scope.projectId}/members/${subjectUserId}/offboarding`;
 const [preview,setPreview]=useState<OffboardingPreview>(),[category,setCategory]=useState<OffboardingReasonCategory|''>(''),[comment,setComment]=useState(''),[confirmed,setConfirmed]=useState(false);
 const reason=composeOffboardingReason(category,comment);
 const [error,setError]=useState<string>(),[result,setResult]=useState<OffboardingResult>(),[loading,setLoading]=useState(false),[revision,setRevision]=useState(0),[readFailed,setReadFailed]=useState(false);
 const gate=useRef(new FrozenCommand<Body>()),generation=useRef(0);
 const heading=useRef<HTMLHeadingElement>(null);useEffect(()=>{heading.current?.focus();},[result]);
 const action=scope.kind==='TENANT_ACCOUNT'?'Disable tenant account':'Remove from this project';
 async function load(offset=0,snapshot?:string){const epoch=++generation.current;setLoading(true);setError(undefined);
  try{const value=await apiRequest<{preview:OffboardingPreview}>(`${url}?offset=${offset}${snapshot?`&snapshot=${snapshot}`:''}`);if(epoch!==generation.current)return false;setPreview(value.preview);setConfirmed(false);setReadFailed(false);return true;}
  catch(cause){if(epoch===generation.current){if(cause instanceof ApiClientError&&cause.status===409){gate.current.fail(409);owner.claim(token);onLockChange?.(true);}setReadFailed(true);setError(getErrorMessage(cause,'Unable to load offboarding evidence.'));}return false;}
  finally{if(epoch===generation.current){setLoading(false);setRevision(n=>n+1);}}
 }
 useEffect(()=>{void load();return()=>{generation.current++;};},[url]); // Selected person/scope mounts a new editor.
 async function reload(close=false){if(loading||owner.blocked(token)||gate.current.pending||gate.current.command&&!gate.current.stale||!owner.claim(token))return;onLockChange?.(true);
  try{if(!await load())return;if(!gate.current.reload())return;setResult(undefined);setCategory('');setComment('');setConfirmed(false);setError(undefined);if(close)onCancel?.();}
  finally{if(!gate.current.locked)owner.release(token);onLockChange?.(gate.current.locked);setRevision(n=>n+1);}
 }
 async function cancel(){if(loading||owner.blocked(token)||gate.current.pending||gate.current.command&&!gate.current.stale)return;if(gate.current.stale){await reload(true);return;}onCancel?.();}
 async function submit(){if(loading||!preview||!confirmed||!reason||preview.blockerTotal>0||!owner.claim(token))return;const frozen=gate.current.begin({subjectUserId,scope,reason,snapshot:preview.snapshot,confirmed:true},crypto.randomUUID());if(!frozen){if(!gate.current.locked)owner.release(token);return;}onLockChange?.(true);
  setError(undefined);setRevision(n=>n+1);
  try{const value=await apiRequest<{result:OffboardingResult;replayed:boolean}>(url,{method:'POST',body:frozen.body,headers:{'Idempotency-Key':frozen.key}});gate.current.success();setResult(value.result);setReplayed(value.replayed);onResult?.(value.result);}
  catch(cause){gate.current.fail(cause instanceof ApiClientError?cause.status:undefined);setError(getErrorMessage(cause,'The response is uncertain. Retry the same confirmed action.'));}
  finally{if(!gate.current.locked)owner.release(token);onLockChange?.(gate.current.locked);setRevision(n=>n+1);}
 }
 void revision;
 return <section className="stack" aria-label={`${action}: ${subjectName}`}>
 <h3 ref={heading} tabIndex={-1} className="panel-title">{action}: {subjectName}</h3>
 {onCancel&&<div className="row"><Button variant="secondary" disabled={blocked||loading||gate.current.pending||!!gate.current.command&&!gate.current.stale} onClick={()=>void cancel()}>{result?'Close access review':'Cancel access removal'}</Button></div>}
 <p>{scope.kind==='TENANT_ACCOUNT'?'This disables access across this tenant.':'This removes access to this project. The account and access to other projects remain.'} Historical requests, drafts, files and audit evidence are retained.</p>
 {error&&<ErrorBanner message={error}/>}
 {loading&&<p role="status">Loading current duties and continuity checks…</p>}
 {preview&&!result&&<>
 {preview.retainsCentralIT&&<p role="note">This person retains separate Tenant Admin support authority. Only a separately confirmed tenant account disable removes that authority.</p>}
 {preview.alreadyDisabled?<p>Access is already disabled. A confirmed retry records no additional transition.</p>:null}
 {preview.blockerTotal?<><p>Resolve these blockers before disabling access:</p><RecordCollection label="access blockers" records={<>{preview.blockers.map((b,i)=><li key={`${b.code}-${b.projectId}-${i}`}>{b.code.replaceAll('_',' ')} · {b.count}{b.resolutionPath&&<> · <Link className="app-link" href={b.resolutionPath}>Resolve duty</Link></>}</li>)}</>}/><div className="row"><Button variant="secondary" disabled={blocked||loading||gate.current.locked||preview.blockerOffset===0} onClick={()=>void load(preview.blockerOffset-25,preview.snapshot)}>Previous blockers</Button><span>{preview.blockerOffset+1}–{preview.blockerOffset+preview.blockers.length} of {preview.blockerTotal}</span><Button variant="secondary" disabled={blocked||loading||gate.current.locked||preview.blockerOffset+25>=preview.blockerTotal} onClick={()=>void load(preview.blockerOffset+25,preview.snapshot)}>Next blockers</Button></div></>:<p>No unresolved duty or continuity blockers in this scope.</p>}
 {scope.kind==='PROJECT_ACCESS'&&<p>{preview.centralITRecipientCount?`Tenant Admin review will be queued for ${preview.centralITRecipientCount} current recipient(s).`:'No eligible Tenant Admin recipient is available. No review notification will be queued.'}</p>}
 <div className="field" id={`${token}-reason`}><label className="field-label" htmlFor={`${token}-reason-input`}>Reason</label><select id={`${token}-reason-input`} className="select" value={category} disabled={blocked||loading||gate.current.locked} onChange={e=>{setCategory(e.target.value as OffboardingReasonCategory|'');setConfirmed(false);}}><option value="">Choose a reason</option>{OFFBOARDING_REASONS.map(value=><option key={value} value={value}>{value}</option>)}</select></div>
 <div className="field" id={`${token}-comment`}><label className="field-label" htmlFor={`${token}-comment-input`}>Reason details</label><Input id={`${token}-comment-input`} aria-describedby={`${token}-comment-help`} value={comment} maxLength={category?offboardingCommentLimit(category):offboardingCommentLimit('Transferred')} disabled={blocked||loading||gate.current.locked} onChange={e=>{setComment(e.target.value);setConfirmed(false);}}/><span className="field-help" id={`${token}-comment-help`}>{category==='Other'?`Required for Other: at least ${OTHER_COMMENT_MIN} characters.`:'Optional. Stored after the chosen reason.'}</span></div>
 <label className="checkbox-row" id={`${token}-confirm`}><input type="checkbox" checked={confirmed} disabled={blocked||loading||gate.current.locked} onChange={e=>setConfirmed(e.target.checked)}/><span>I confirm: {action.toLowerCase()} for {subjectName}.</span></label>
 <div className="row"><Button variant="danger" disabled={blocked||loading||gate.current.pending||gate.current.stale||preview.blockerTotal>0} blockedTitle="Can’t remove access yet" blockers={blockersFrom([[!category,'Choose a reason.',`${token}-reason`],[category==='Other'&&!reason,`Explain the reason in at least ${OTHER_COMMENT_MIN} characters.`,`${token}-comment`],[!confirmed,'Tick the confirmation box.',`${token}-confirm`]])} onClick={()=>void submit()}>{gate.current.pending?'Submitting…':gate.current.command&&!gate.current.stale?'Retry same confirmed action':action}</Button>
 </div>
 {gate.current.command&&!gate.current.stale&&!gate.current.pending&&<p role="status">The outcome is uncertain. Your reason, scope and retry key are frozen until the same action returns a definite response.</p>}
 </>}
 {gate.current.stale&&<p role="alert">{readFailed?'Current access evidence could not be loaded.':'The access evidence changed.'} Your reviewed access removal remains held. Reload evidence must successfully read current duties before a new decision or cancellation.</p>}
 <Button variant="secondary" disabled={blocked||loading||gate.current.pending||!!gate.current.command&&!gate.current.stale} onClick={()=>void reload()}>Reload evidence</Button>
 {result&&<><SuccessBanner message={`${replayed?'Original confirmed operation replayed: ':''}${result.outcome==='DISABLED'?'Access disabled':'Access was already disabled'}. History was retained.`}/><p>{result.centralReview==='QUEUED'?'Tenant Admin review queued. This does not disable the tenant account.':result.centralReview==='NOT_QUEUED_NO_CENTRAL_IT'?'No Tenant Admin review was queued because there was no eligible recipient.':'No project review applies to this tenant action.'}</p><p>This is the recorded outcome of this operation. Reload evidence to check current access.</p><p>Lifecycle evidence: {result.eventId??'No new transition'} · {result.disabledAt}</p></>}
 </section>;
}
