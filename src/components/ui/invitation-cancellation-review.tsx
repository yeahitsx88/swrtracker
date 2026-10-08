'use client';
import {useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {apiRequest} from '@/lib/apiClient';
import {ApiClientError,getErrorMessage} from '@/lib/errors';
import {CommandOwner,FrozenCommand} from '@/lib/frozen-command';
import {AdministrationDialog} from './administration-dialog';
import {Button,ErrorBanner,Input} from '@/components/ui';
import type {InvitationCancellationCommand,InvitationCancellationPreview} from '@/modules/identity/application/cancel-project-invitation';
/** Reused by normal pending invitations and governed preparation cleanup. */
export function InvitationCancellationReview({projectId,inviteId,email,owner,disabled,onSaved}:{projectId:string;inviteId:string;email:string;owner:CommandOwner;disabled:boolean;onSaved:()=>void}){
 const token=`cancel-invitation:${inviteId}`;
 useSyncExternalStore(owner.subscribe,owner.snapshot,owner.snapshot);
 const [open,setOpen]=useState(false);
 return <><Button variant="danger" disabled={disabled||owner.blocked(token)||open} aria-label={`Cancel Invitation for ${email}`} onClick={()=>{if(owner.claim(token))setOpen(true);}}>Cancel Invitation</Button>
 {open&&<Review projectId={projectId} inviteId={inviteId} owner={owner} token={token} onClose={()=>{owner.release(token);setOpen(false);}} onSaved={onSaved}/>}</>;
}
function Review({projectId,inviteId,owner,token,onClose,onSaved}:{projectId:string;inviteId:string;owner:CommandOwner;token:string;onClose:()=>void;onSaved:()=>void}){
 const url=`/api/projects/${projectId}/invites/${inviteId}/cancel`,gate=useRef(new FrozenCommand<InvitationCancellationCommand>()).current;
 const [preview,setPreview]=useState<InvitationCancellationPreview>(),[reason,setReason]=useState(''),[consent,setConsent]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState<string>(),[,render]=useState(0);
 const reading=useRef(false),generation=useRef(0);
 async function load(){
  if(reading.current||owner.blocked(token)||gate.pending||gate.command&&!gate.stale)return;
  reading.current=true;const epoch=++generation.current;setBusy(true);setError(undefined);
  try{const result=await apiRequest<{preview:InvitationCancellationPreview}>(url);if(epoch!==generation.current||!gate.reload())return;setPreview(result.preview);setReason('');setConsent(false);}
  catch(e){if(epoch===generation.current)setError(getErrorMessage(e,'Current invitation could not be loaded. Your reviewed command remains held until Reload Invitation succeeds.'));}
  finally{reading.current=false;if(epoch===generation.current){setBusy(false);render(n=>n+1);}}
 }
 useEffect(()=>{void load();return()=>{generation.current++;};},[projectId,inviteId]);
 async function submit(){
  if(busy||owner.blocked(token)||gate.stale||!preview||!gate.command&&(!preview.canCancel||!consent||reason.trim().length<10)||!owner.claim(token))return;
  const command=gate.begin({snapshot:preview.snapshot,reason:reason.trim(),confirmed:true},crypto.randomUUID());if(!command)return;
  setBusy(true);setError(undefined);render(n=>n+1);
  try{await apiRequest(url,{method:'POST',body:command.body,headers:{'Idempotency-Key':command.key}});gate.success();onClose();onSaved();}
  catch(e){gate.fail(e instanceof ApiClientError?e.status:undefined);setError(getErrorMessage(e,'The outcome is uncertain. Retry the unchanged invitation cancellation.'));}
  finally{setBusy(false);render(n=>n+1);}
 }
 const locked=busy||gate.locked;
 return <AdministrationDialog title="Cancel Invitation" locked={locked} onDismiss={onClose}>
 {error&&<ErrorBanner message={error}/>} {busy&&<p role="status">Loading or saving invitation cancellation…</p>}
 <p>Central IT cancellation prevents future use of this registration link. It retains the invitation and its history; it does not remove an account that has already accepted.</p>
 {preview&&<><dl><dt>Email</dt><dd className="administration-company-id">{preview.email}</dd><dt>Role</dt><dd>{preview.role}</dd><dt>Company</dt><dd>{preview.companyName}</dd><dt>Expires</dt><dd>{new Date(preview.expiresAt).toLocaleString()}</dd></dl>
 {!preview.canCancel&&<p role="alert">This invitation is no longer eligible for cancellation. It may be accepted, cancelled, expired, or outside the current preparation cleanup.</p>}
 <label className="field"><span className="field-label">Cancellation reason (10–1000 characters)</span><Input value={reason} maxLength={1000} disabled={locked||!preview.canCancel} onChange={e=>{setReason(e.target.value);setConsent(false);}}/></label>
 <label className="checkbox-row"><input type="checkbox" checked={consent} disabled={locked||!preview.canCancel} onChange={e=>setConsent(e.target.checked)}/><span>I reviewed this invitation and confirm its registration link should no longer be usable.</span></label>
 <Button variant="danger" disabled={busy||gate.stale||!gate.command&&(!preview.canCancel||!consent||reason.trim().length<10)} onClick={()=>void submit()}>{busy?'Working…':gate.command?'Retry Unchanged Cancellation':'Confirm Cancellation'}</Button></>}
 {gate.stale&&<p role="alert">Invitation evidence changed. Reload Invitation successfully, then enter a new reason and renew confirmation. Your previous command stays held until the read succeeds.</p>}
 <div className="row"><Button variant="secondary" disabled={busy||!!gate.command&&!gate.stale} onClick={()=>void load()}>Reload Invitation</Button><Button variant="secondary" disabled={locked} onClick={onClose}>Keep Invitation</Button></div>
 </AdministrationDialog>;
}
