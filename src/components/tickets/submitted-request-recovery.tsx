'use client';
import {useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {apiClient} from '@/lib/apiClient';
import {ApiClientError,getErrorMessage} from '@/lib/errors';
import {CommandOwner,FrozenCommand} from '@/lib/frozen-command';
import {useAdministrationProgress} from '@/lib/use-administration-progress';
import {useAdministrationNotice} from '@/components/ui/administration-workspace';
import type {SubmittedRecoveryInput,SubmittedRecoveryPage,SubmittedRecoveryRecord} from '@/lib/contracts/submitted-recovery';
import {Button,Card,ErrorBanner,SuccessBanner} from '@/components/ui';
import {AdministrationRecords} from '@/components/ui/administration-records';
import {AdministrationDialog} from '@/components/ui/administration-dialog';
import {PaginationControls} from '@/components/forms';
import {operationsStatusLabel as statusLabel} from '@/lib/operations-view';

/** Bounded recovery summaries confer no ordinary ticket/history/file reading. */
export function SubmittedRequestRecovery({projectId,owner:workspaceOwner,readOnly=false,onLockChange}:{projectId:string;owner?:CommandOwner;readOnly?:boolean;onLockChange?:(locked:boolean)=>void}){
 const localOwner=useRef(new CommandOwner()).current,owner=workspaceOwner??localOwner,token='submitted-request-recovery';
 useSyncExternalStore(owner.subscribe,owner.snapshot,owner.snapshot);
 const gate=useRef(new FrozenCommand<{id:string;input:SubmittedRecoveryInput}>()).current;
 const [page,setPage]=useState<SubmittedRecoveryPage>(),[selected,setSelected]=useState<SubmittedRecoveryRecord>(),[reason,setReason]=useState(''),[consent,setConsent]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState<string>(),[message,setMessage]=useState<string>(),[,render]=useState(0);
 const busy=useRef(false),blocked=owner.blocked(token),locked=gate.locked||loading||blocked;
 useAdministrationProgress(owner,`/projects/${projectId}/${workspaceOwner?'admin':'survey/review'}`);
 useAdministrationNotice(token,{source:'Submitted Request Recovery',href:`/projects/${projectId}/admin/access-recovery`,tone:error?'error':message?'success':'status',message:gate.pending?'Saving the reviewed recovery…':gate.stale?'The request changed. Return to recovery, reload successfully and confirm a new review.':gate.command?'Recovery is uncertain. Return and retry the unchanged decision.':error??message??''});
 useEffect(()=>{onLockChange?.(!!selected||gate.locked);return()=>onLockChange?.(false);},[selected,gate.locked,onLockChange]);
 async function load(offset=page?.offset??0){
  if(busy.current||blocked||gate.pending||gate.command&&!gate.stale)return;
  busy.current=true;setLoading(true);setError(undefined);
  try{
   const current=await apiClient.listSubmittedRecovery(projectId,page?.limit??20,offset);
   if(gate.reload()){setPage(current);setSelected(undefined);setReason('');setConsent(false);owner.release(token);}
  }catch(cause){setError(getErrorMessage(cause,'Unable to read current recovery requests. Keep this review and retry loading.'));}
  finally{busy.current=false;setLoading(false);}
 }
 function dismiss(){if(locked)return;setSelected(undefined);setReason('');setConsent(false);owner.release(token);}
 async function recover(){
  if(!selected||!consent||readOnly||busy.current||!owner.claim(token))return;
  const attempt=gate.begin({id:selected.id,input:{expectedVersion:selected.rowVersion,expectedStatus:selected.status,reason:reason.trim(),confirmed:true}},crypto.randomUUID());if(!attempt){if(!gate.locked)owner.release(token);return;}
  busy.current=true;setError(undefined);render(n=>n+1);
  try{
   await apiClient.recoverSubmittedRequest(projectId,attempt.body.id,attempt.body.input,attempt.key);gate.success();owner.release(token);
   setPage(current=>current?{...current,total:current.total-1,data:current.data.filter(r=>r.id!==attempt.body.id)}:current);
   setSelected(undefined);setConsent(false);setReason('');setMessage('Request returned to its original requester for correction. Its number, files and history are retained. Resubmission requires fresh Survey review.');
  }catch(cause){gate.fail(cause instanceof ApiClientError?cause.status:undefined);setError(getErrorMessage(cause,'The response is uncertain. Retry the unchanged recovery decision.'));if(!gate.locked)owner.release(token);}
  finally{busy.current=false;render(n=>n+1);}
 }
 return <Card title="Submitted Request Recovery" description="Eligible administrators and Survey leaders can return cancelled or rejected submitted requests to their original requester for correction. This list shows only requests in your current recovery scope."><div className="stack">
 {error&&!selected&&<ErrorBanner message={error}/>} {message&&<SuccessBanner message={message}/>} {page?.readOnly&&<p role="status">This project is read-only for recovery. Reopen it before changing submitted work.</p>}
 <div><Button variant="secondary" disabled={loading||blocked||!!selected||gate.locked||readOnly} onClick={()=>void load()}>{loading?'Loading…':page?'Refresh Recovery Requests':'View Recovery Requests'}</Button></div>
 {page&&<><AdministrationRecords label="submitted requests available for recovery" rows={page.data} id={r=>r.id} columns={[{key:'number',label:'Number',text:r=>r.ticketNumber},{key:'request',label:'Request',text:r=>r.description},{key:'requester',label:'Requester',text:r=>r.requesterName},{key:'area',label:'Area',text:r=>r.areaName??'Area unavailable'},{key:'status',label:'Current Status',text:r=>statusLabel(r.status)}]} actions={r=>r.canRecover?<Button aria-haspopup="dialog" variant="secondary" disabled={locked||readOnly||!!selected} onClick={()=>{if(owner.claim(token)){setSelected(r);setConsent(false);setReason('');setError(undefined);setMessage(undefined);}}}>Review Recovery</Button>:<p>{r.blocker}</p>}/>
 {page.data.length===0&&<p role="status">No eligible cancelled or rejected submitted requests on this page.</p>}
 <PaginationControls limit={page.limit} offset={page.offset} total={page.total} onChange={offset=>{if(!locked&&!selected)void load(offset);}}/></>}
 {selected&&<AdministrationDialog className="request-recovery-dialog" title="Recover Submitted Request" locked={locked} onDismiss={dismiss}>
 <dl><dt>Request</dt><dd><strong>{selected.ticketNumber}</strong></dd><dt>Current Status</dt><dd>{statusLabel(selected.status)}</dd><dt>Original Requester</dt><dd>{selected.requesterName}</dd><dt>Area</dt><dd>{selected.areaName??'Area unavailable'}</dd></dl>
 <p>{selected.description}</p>
 <p style={{maxWidth:'min(75ch, 760px)'}}>Return this same request to <strong>Returned for Correction</strong>. Keep its number, files and history. Current approval, crew assignment and cancellation are cleared; prior staffing is not reinstated.</p>
 <p><strong>Next:</strong> {selected.requesterName} receives a notification, corrects the request and resubmits it for fresh Survey review.</p>
 <label className="field"><span className="field-label">Recovery Reason (10–1000 Characters)</span><textarea className="textarea" rows={3} minLength={10} maxLength={1000} value={reason} disabled={locked} onChange={e=>{setReason(e.target.value);setConsent(false);}}/></label>
 <label className="tm-check"><input type="checkbox" checked={consent} disabled={locked} onChange={e=>setConsent(e.target.checked)}/><span>I confirm same-record recovery for correction and fresh review after resubmission.</span></label>
 {error&&<ErrorBanner message={error}/>} {gate.command&&!gate.stale&&!gate.pending&&<p role="status">The response is uncertain. Retry this unchanged recovery decision before changing its reason or leaving.</p>} {gate.stale&&<p role="alert">The reviewed request changed. Reload successfully, then select a current request and confirm again.</p>}
 <div className="row"><Button type="button" disabled={blocked||readOnly||loading||!consent||reason.trim().length<10||gate.pending||gate.stale} onClick={()=>void recover()}>{gate.pending?'Recovering…':gate.command&&!gate.stale?'Retry Unchanged Recovery':'Confirm Return for Correction'}</Button><Button type="button" variant="secondary" disabled={loading||blocked||gate.pending||!!gate.command&&!gate.stale} onClick={()=>{if(gate.stale)void load();else dismiss();}}>{gate.stale?'Reload Recovery Requests':'Keep Current Status'}</Button></div>
 </AdministrationDialog>}
 </div></Card>;
}
