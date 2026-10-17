"use client";
import {useRef,useState} from 'react';
import type {AttachmentRecord} from '@/lib/contracts';
import {AdministrationRecords,AdministrationSection} from '@/components/ui/administration-records';
import {apiRequest,createIdempotencyKey} from '@/lib/apiClient';
import {getErrorMessage} from '@/lib/errors';

const PREVIEWABLE=new Set(['image/png','image/jpeg']);

/**
 * Files on a request. Images can be previewed in place (recorded like a download).
 * The uploader may withdraw a mistaken file while they could still upload that
 * kind of file; the server re-checks every rule and keeps the record.
 */
export function AttachmentList({attachments,actorId,canWithdraw,onWithdrawn}:{
 attachments:AttachmentRecord[];actorId?:string;
 canWithdraw?:(attachment:AttachmentRecord)=>boolean;
 onWithdrawn?:(attachment:AttachmentRecord)=>void;
}){
 const dialog=useRef<HTMLDialogElement>(null);
 const [preview,setPreview]=useState<AttachmentRecord>();
 const [withdrawing,setWithdrawing]=useState<AttachmentRecord>();
 const [reason,setReason]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState<string>();
 if(!attachments.length)return <p className="muted">No attachments uploaded.</p>;
 function open(kind:'preview'|'withdraw',attachment:AttachmentRecord){
  setError(undefined);setReason('');
  if(kind==='preview'){setWithdrawing(undefined);setPreview(attachment);}else{setPreview(undefined);setWithdrawing(attachment);}
  dialog.current?.showModal();
 }
 async function withdraw(){
  if(!withdrawing||busy)return;
  setBusy(true);setError(undefined);
  try{
   await apiRequest(`/api/tickets/${withdrawing.ticketId}/attachments/${withdrawing.id}/withdraw`,{method:'POST',body:{reason},headers:{'Idempotency-Key':createIdempotencyKey()}});
   onWithdrawn?.({...withdrawing,withdrawnAt:new Date().toISOString(),withdrawalReason:reason.trim()});
   dialog.current?.close();
  }catch(cause){setError(getErrorMessage(cause,'Unable to withdraw this file. Reload and try again.'));}
  finally{setBusy(false);}
 }
 return <>
  <AdministrationSection title="Attachment Records" open><AdministrationRecords label="attachments" rows={attachments} id={a=>a.id} columns={[
  {key:'filename',label:'File',text:a=>a.filename,render:a=>a.withdrawnAt?<span><s>{a.filename}</s> <span className="badge status-badge tone-closed">Withdrawn</span></span>:a.filename},
  {key:'purpose',label:'Purpose',text:a=>a.purpose==='REQUEST_INSTRUCTION'?'Request instruction':'Field support / evidence'},
  {key:'type',label:'Type',text:a=>a.mimeType},
  {key:'size',label:'Bytes',text:a=>String(a.sizeBytes)},
  {key:'cycle',label:'Revision cycle',text:a=>String(a.returnCycle)},
  {key:'uploaded',label:'Uploaded',text:a=>a.createdAt,render:a=>new Date(a.createdAt).toLocaleString()},
  {key:'hash',label:'SHA-256',text:a=>a.contentSha256,render:a=><details><summary>Checksum</summary>{a.contentSha256}</details>}
  ]} actions={a=>a.withdrawnAt
   ?<span className="muted" title={a.withdrawalReason??undefined}>Withdrawn{a.withdrawalReason?`: ${a.withdrawalReason}`:''}</span>
   :<span className="row">
     {PREVIEWABLE.has(a.mimeType)?<button type="button" className="app-link" onClick={()=>open('preview',a)}>Preview</button>:null}
     <a className="app-link" href={a.downloadUrl}>Download</a>
     {actorId&&a.uploadedBy===actorId&&canWithdraw?.(a)?<button type="button" className="app-link" onClick={()=>open('withdraw',a)}>Withdraw</button>:null}
    </span>}/></AdministrationSection>
  <dialog ref={dialog} className="attachment-dialog popout-dialog" aria-labelledby="attachment-dialog-title" onClose={()=>{setPreview(undefined);setWithdrawing(undefined);}}>
   <div className="popout-header"><h2 id="attachment-dialog-title">{preview?preview.filename:withdrawing?`Withdraw ${withdrawing.filename}?`:'File'}</h2>
    <button type="button" className="button button-secondary" onClick={()=>dialog.current?.close()}>Close</button></div>
   <div className="popout-body">
    {/* eslint-disable-next-line @next/next/no-img-element -- authenticated, uncached file bytes */}
    {preview?<img className="attachment-preview" src={`${preview.downloadUrl}?disposition=inline`} alt={`Preview of ${preview.filename}`}/>:null}
    {withdrawing?<div className="stack">
     <p>The file stays in the request history but can no longer be downloaded, and it stops counting toward the file limit. This cannot be undone.</p>
     {error?<p className="error-banner" role="alert">{error}</p>:null}
     <label className="field"><span className="field-label">Reason</span>
      <textarea className="textarea" value={reason} maxLength={500} onChange={event=>setReason(event.target.value)} placeholder="For example: wrong drawing revision attached"/></label>
     <div className="row"><button type="button" className="button button-danger" disabled={busy||reason.trim().length<3} onClick={()=>void withdraw()}>{busy?'Withdrawing…':'Withdraw file'}</button>
      <button type="button" className="button button-secondary" disabled={busy} onClick={()=>dialog.current?.close()}>Keep file</button></div>
    </div>:null}
   </div>
  </dialog>
 </>;
}
