'use client';
import {useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {apiRequest} from '@/lib/apiClient';
import {getErrorMessage} from '@/lib/errors';
import {roleLabel} from '@/lib/display-labels';
import type {CommandOwner} from '@/lib/frozen-command';
import type {InvitationHistoryFilter,ProjectInvitationHistory} from '@/modules/identity/application/project-invitation-history';
import {Button,Card,ErrorBanner,Input,Select,SuccessBanner} from '@/components/ui';
import {useProjectWorkspace} from './project-shell-header';
import {InvitationCancellationReview} from './invitation-cancellation-review';
import './administration-records.css';
const states:Array<[InvitationHistoryFilter,string]>=[['HISTORY','Accepted, expired and cancelled'],['ALL','All invitations'],['PENDING','Pending'],['ACCEPTED','Accepted'],['EXPIRED','Expired'],['CANCELLED','Cancelled']];
const stateLabels={PENDING:'Pending',ACCEPTED:'Accepted',EXPIRED:'Expired',CANCELLED:'Cancelled'};
function timestamp(value:string){return new Date(value).toLocaleString();}
export function ProjectInvitationHistory({projectId,owner,revision,onInvitesChanged}:{projectId:string;owner:CommandOwner;revision:number;onInvitesChanged:()=>void}){
 const centralIT=useProjectWorkspace()?.capabilities.centralIT===true;
 return centralIT?<History projectId={projectId} owner={owner} revision={revision} onInvitesChanged={onInvitesChanged}/>:null;
}
function History({projectId,owner,revision,onInvitesChanged}:{projectId:string;owner:CommandOwner;revision:number;onInvitesChanged:()=>void}){
 const ownerToken=useSyncExternalStore(owner.subscribe,owner.snapshot,owner.snapshot),generation=useRef(0);
 const [view,setView]=useState({state:'HISTORY' as InvitationHistoryFilter,search:'',offset:0}),[search,setSearch]=useState(''),[response,setResponse]=useState<ProjectInvitationHistory>(),[busy,setBusy]=useState(false),[error,setError]=useState<string>(),[success,setSuccess]=useState<string>();
 const locked=busy||ownerToken!==null;
 async function load(){
  if(owner.snapshot()!==null)return;const epoch=++generation.current;setBusy(true);setResponse(undefined);setError(undefined);
  try{const query=new URLSearchParams({state:view.state,search:view.search,limit:'25',offset:String(view.offset)}),result=await apiRequest<ProjectInvitationHistory>(`/api/projects/${projectId}/invites?${query}`);if(epoch===generation.current)setResponse(result);}
  catch(e){if(epoch===generation.current)setError(getErrorMessage(e,'Unable to load invitation history. Reload current invitations.'));}
  finally{if(epoch===generation.current)setBusy(false);}
 }
 useEffect(()=>{void load();return()=>{generation.current++;};},[projectId,view,revision]);
 return <Card title="Invitation History" description="Central IT can review this project's retained invitations across fixed roles and companies. Acceptance does not describe a person's current access."><div className="stack">
 {error&&<ErrorBanner message={error}/>} {success&&<SuccessBanner message={success}/>}
 <p>Invitations record registration decisions, not current account or project access.</p>
 <form className="stack" onSubmit={event=>{event.preventDefault();if(!locked)setView({...view,search:search.trim(),offset:0});}}>
 <label className="field"><span className="field-label">Invitation state</span><Select value={view.state} disabled={locked} onChange={event=>{setView({...view,state:event.target.value as InvitationHistoryFilter,offset:0});setSuccess(undefined);}}>{states.map(([state,label])=><option key={state} value={state}>{label}</option>)}</Select></label>
 <label className="field"><span className="field-label">Search invitations by email, company or role</span><Input value={search} maxLength={200} disabled={locked} onChange={event=>setSearch(event.target.value)}/></label>
 <div className="row"><Button type="submit" variant="secondary" disabled={locked}>Search Invitations</Button><Button type="button" variant="secondary" disabled={locked} onClick={()=>void load()}>Reload Current Invitations</Button></div>
 </form>
 {busy&&<p role="status">Loading current invitation records…</p>}
 {response&&<><p className="muted">Status at last refresh: {timestamp(response.observedAt)}. Expiry and recorded acceptance or cancellation dates are shown separately. Scroll the table sideways to see every detail.</p>
 <div className="administration-table-scroll record-scrollable" tabIndex={0} role="region" aria-label="Invitation history table"><table className="administration-table"><caption className="administration-table-caption">Project Invitation Records</caption><thead><tr>{['Email / Reference','Company / Role','Status','Created','Expires','Recorded Outcome','Action'].map(label=><th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{response.data.map(invitation=><tr key={invitation.id}>
 <td><span className="administration-company-id">{invitation.email}</span><details><summary>Invitation ID</summary><span className="administration-company-id">{invitation.id}</span></details></td>
 <td><span className="administration-company-id">{invitation.companyName}</span><div>{roleLabel(invitation.role)}</div></td><td>{stateLabels[invitation.state]}</td><td>{timestamp(invitation.createdAt)}</td><td>{timestamp(invitation.expiresAt)}</td>
 <td>{invitation.acceptedAt&&<div>Accepted: {timestamp(invitation.acceptedAt)}</div>}{invitation.canceledAt&&<div>Cancelled: {timestamp(invitation.canceledAt)}</div>}{!invitation.acceptedAt&&!invitation.canceledAt&&'No recorded acceptance or cancellation'}</td>
 <td>{invitation.canCancel?<InvitationCancellationReview projectId={projectId} inviteId={invitation.id} email={invitation.email} owner={owner} disabled={locked} onSaved={()=>{setSuccess('Invitation cancelled. Its record and history are retained.');onInvitesChanged();}}/>:<span>Read only</span>}</td>
 </tr>)}</tbody></table></div>
 {!response.data.length&&<p>{response.total?'No invitations on this page. Use Previous Invitation History or search again.':'No invitations match this state and search.'}</p>}
 <div className="row"><Button variant="secondary" disabled={locked||view.offset===0} onClick={()=>setView({...view,offset:Math.max(0,view.offset-25)})}>Previous Invitation History</Button><span role="status">{response.data.length?response.offset+1:0}–{response.data.length?response.offset+response.data.length:0} of {response.total} invitations</span><Button variant="secondary" disabled={locked||response.offset+response.limit>=response.total} onClick={()=>setView({...view,offset:view.offset+25})}>Next Invitation History</Button></div>
 </>}
 </div></Card>;
}
