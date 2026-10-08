'use client';
import {useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {apiRequest} from '@/lib/apiClient';
import {operationsStatusLabel} from '@/lib/operations-view';
import {ApiClientError,getErrorMessage} from '@/lib/errors';
import {CommandOwner,FrozenCommand} from '@/lib/frozen-command';
import {Button,Card,ErrorBanner,Input,SuccessBanner} from '@/components/ui';
import type {PreparationCancellationCommand,PreparationCancellationPreview} from '@/modules/tenancy/application/cancel-project-preparation';
export function ProjectPreparationCancellation({projectId,owner,onFinished}:{projectId:string;owner:CommandOwner;onFinished:()=>void}){
 const token=`preparation-cancellation:${projectId}`,url=`/api/projects/${projectId}/preparation-cancellation`;
 useSyncExternalStore(owner.subscribe,owner.snapshot,owner.snapshot);
 const gate=useRef(new FrozenCommand<PreparationCancellationCommand>()).current,reading=useRef(false),generation=useRef(0);
 const [preview,setPreview]=useState<PreparationCancellationPreview>(),[reason,setReason]=useState(''),[consent,setConsent]=useState(false),[busy,setBusy]=useState(false),[readFailed,setReadFailed]=useState(false),[error,setError]=useState<string>(),[success,setSuccess]=useState<string>(),[revision,setRevision]=useState(0);
 async function load(){
  if(reading.current||owner.blocked(token)||gate.pending||gate.command&&!gate.stale)return;
  reading.current=true;const epoch=++generation.current;setBusy(true);setError(undefined);
  try{const result=await apiRequest<{preview:PreparationCancellationPreview}>(url);if(epoch!==generation.current||!gate.reload())return;setPreview(result.preview);setReason('');setConsent(false);setReadFailed(false);owner.release(token);}
  catch(cause){if(epoch===generation.current){setReadFailed(gate.stale);setError(getErrorMessage(cause,'Unable to load current preparation evidence. Reload and review before acting.'));}}
  finally{reading.current=false;if(epoch===generation.current)setBusy(false);}
 }
 useEffect(()=>{void load();return()=>{generation.current++;};},[projectId]);
 async function submit(){
  if(!preview||busy||owner.blocked(token)||gate.stale||!consent||reason.trim().length<10||reason.trim().length>1000||preview.status!=='SETUP'||preview.cancellationId&&preview.blockers.length&&!gate.command||!owner.claim(token))return;
  const attempt=gate.begin({action:preview.cancellationId?'FINISH':'START',snapshot:preview.snapshot,reason:reason.trim(),confirmed:true},crypto.randomUUID());
  if(!attempt){if(!gate.locked)owner.release(token);return;}setBusy(true);setError(undefined);setRevision(n=>n+1);
  try{await apiRequest(url,{method:'POST',body:attempt.body,headers:{'Idempotency-Key':attempt.key}});gate.success();owner.release(token);setSuccess(attempt.body.action==='START'?'Preparation cancellation started. Authorized operational users must resolve the existing work before Central IT finishes cancellation.':'Preparation cancelled. The project is Archived; its identity, Setup changes, files and history are retained.');if(attempt.body.action==='FINISH')onFinished();else{setBusy(false);await load();}}
  catch(cause){gate.fail(cause instanceof ApiClientError?cause.status:undefined);setError(getErrorMessage(cause,'The outcome is uncertain. Retry the unchanged cancellation command.'));}
  finally{setBusy(false);if(!gate.locked)owner.release(token);setRevision(n=>n+1);}
 }
 void revision;
 const locked=busy||owner.blocked(token)||gate.locked,finishing=!!preview?.cancellationId;
 return <Card title="Cancel Project Preparation" description="Central IT reviews the existing work, starts cancellation, then archives the project after required cleanup."><div className="stack">
 {error&&<ErrorBanner message={error}/>} {success&&<SuccessBanner message={success}/>} {busy&&<p role="status">Loading or saving preparation cancellation…</p>}
 {readFailed&&<p role="alert">Current evidence could not be loaded. Your reviewed reason, consent and command remain held until Reload current evidence succeeds.</p>}
 {preview&&<><p>{finishing?'Cancellation is in progress. New work and reopening are blocked.':'Starting cancellation blocks new ordinary work, reassignment, activation and reopening.'} Authorized operational users may complete or cancel only the existing reviewed requests. Central IT resolves outstanding invitations and finishes cancellation.</p>
 <p>Finishing changes the project to Archived. Project identity, current Setup changes, files and history are retained.</p>
 {finishing&&<p>Recorded start reason: {preview.reason}</p>}
 <section><h3 className="panel-title">Unfinished Requests</h3>{preview.work.length?<ul>{preview.work.map(record=><li key={record.id}><span className="administration-company-id">{record.name}</span><span> — {operationsStatusLabel(record.detail)}</span></li>)}</ul>:<p>No unfinished requests remain.</p>}</section>
 <section><h3 className="panel-title">Outstanding Invitations</h3>{preview.invitations.length?<ul>{preview.invitations.map(record=><li key={record.id}><span className="administration-company-id">{record.name}</span><span> — {record.detail}</span></li>)}</ul>:<p>No outstanding invitations remain.</p>}</section>
 {preview.blockers.length>0?<div role="alert"><h3 className="panel-title">Required Before Archiving</h3>{preview.blockers.map(blocker=><p key={blocker}>{blocker}</p>)}</div>:<p>No unfinished requests or outstanding invitations remain.</p>}
 <label className="field"><span className="field-label">{finishing?'Completion reason':'Cancellation reason'} (10–1000 characters)</span><Input value={reason} maxLength={1000} disabled={locked} onChange={event=>{setReason(event.target.value);setConsent(false);}}/></label>
 <label className="checkbox-row"><input type="checkbox" checked={consent} disabled={locked} onChange={event=>setConsent(event.target.checked)}/><span>{finishing?'I reviewed the current evidence and confirm cancellation and archival of this preparation.':'I reviewed the existing work and confirm that preparation cancellation should begin.'}</span></label>
 <div className="row"><Button variant="danger" disabled={busy||owner.blocked(token)||gate.stale||!gate.command&&(!consent||reason.trim().length<10||preview.status!=='SETUP'||finishing&&preview.blockers.length>0)} onClick={()=>void submit()}>{busy?'Working…':gate.command&&!gate.stale?'Retry Unchanged Cancellation':finishing?'Finish Cancellation and Archive':'Start Preparation Cancellation'}</Button></div>
 {gate.stale&&<p role="alert">Preparation evidence changed. Reload current evidence successfully, then review a new reason and confirmation.</p>}
 </>}
 <Button variant="secondary" disabled={busy||owner.blocked(token)||!!gate.command&&!gate.stale} onClick={()=>void load()}>Reload current evidence</Button>
 </div></Card>;
}
