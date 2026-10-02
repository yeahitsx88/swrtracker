'use client';
import {useEffect,useId,useRef,useState,useSyncExternalStore,type FormEvent} from 'react';
import {apiClient,apiRequest} from '@/lib/apiClient';
import {ApiClientError,getErrorMessage} from '@/lib/errors';
import {CommandOwner,FrozenCommand} from '@/lib/frozen-command';
import {Button,ErrorBanner,Input,SuccessBanner} from '@/components/ui';

interface InvitationOptions {
  projectStatus:'SETUP'|'ACTIVE'|'ARCHIVED';
  companies:Array<{id:string;name:string;type:string}>;
  pendingInvites:Array<{email:string;companyName:string;expiresAt:string}>;
}
type InviteIntent={companyId:string;email:string};
const companyLabels:Record<string,string>={GC:'General contractor',OWNER_REP:'Owner representative',SUBCONTRACTOR:'Subcontractor'};
export function RequesterInvitations({projectId,commandOwner}:{projectId:string;commandOwner:CommandOwner}) {
  const token=useId();
  const ownerToken=useSyncExternalStore(commandOwner.subscribe,commandOwner.snapshot,commandOwner.snapshot);
  const gate=useRef(new FrozenCommand<InviteIntent>()).current;
  const alive=useRef(false),generation=useRef(0);
  const [options,setOptions]=useState<InvitationOptions>(),[loading,setLoading]=useState(true);
  const [companyId,setCompanyId]=useState(''),[email,setEmail]=useState('');
  const [intent,setIntent]=useState<InviteIntent>(),[confirmed,setConfirmed]=useState(false);
  const [error,setError]=useState<string>(),[inviteUrl,setInviteUrl]=useState<string>();
  const [,refresh]=useState(0);
  async function load() {
    const current=++generation.current;setLoading(true);setError(undefined);
    try {
      const value=await apiRequest<InvitationOptions>(`/api/projects/${projectId}/invites`);
      if(alive.current&&current===generation.current){setOptions(value);setCompanyId(id=>value.companies.some(c=>c.id===id)?id:'');}
    } catch(cause){if(alive.current&&current===generation.current)setError(getErrorMessage(cause,'Unable to load invitation companies. Reload invitations to try again.'));}
    finally{if(alive.current&&current===generation.current)setLoading(false);}
  }
  useEffect(()=>{alive.current=true;void load();return()=>{alive.current=false;generation.current++;};},[projectId]);
  const closed=options?.projectStatus==='ARCHIVED';
  const locked=gate.locked||ownerToken!==null;
  function review(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(locked||loading||closed||!options?.companies.some(c=>c.id===companyId)||!email.trim())return;
    setIntent({companyId,email:email.trim().toLowerCase()});setConfirmed(false);setInviteUrl(undefined);setError(undefined);
  }
  async function send(){
    if(!intent||!confirmed||closed||!commandOwner.claim(token))return;
    const command=gate.begin(intent,crypto.randomUUID());
    if(!command){if(!gate.locked)commandOwner.release(token);return;}
    refresh(n=>n+1);setError(undefined);
    try{
      const result=await apiClient.createRequesterInvite(projectId,command.body,command.key);
      gate.success();setInviteUrl(`${window.location.origin}/invite/${encodeURIComponent(result.inviteToken)}`);
      setIntent(undefined);setConfirmed(false);setEmail('');void load();
    }catch(cause){gate.fail(cause instanceof ApiClientError?cause.status:undefined);setError(getErrorMessage(cause,'The invitation outcome is uncertain. Retry the same invitation.'));}
    finally{if(!gate.locked)commandOwner.release(token);refresh(n=>n+1);}
  }
  function reload(){
    if(commandOwner.blocked(token)||!gate.reload())return;
    commandOwner.release(token);setIntent(undefined);setConfirmed(false);void load();refresh(n=>n+1);
  }
  const selected=options?.companies.find(c=>c.id===intent?.companyId);
  return <details className="panel project-admin-section" open>
    <summary><h2 className="panel-title">Invite a new requester</h2></summary>
    <div className="stack project-admin-section-content">
    <p>For a new employee or external requester without a tenant account. They choose their own password and receive Requester access to this project. For an existing account, use “Add a project member”.</p>
    <p className="muted">Up to 100 associated companies are shown.</p>
    {error&&<ErrorBanner message={error}/>}
    {loading&&<p role="status">Loading invitation companies…</p>}
    {closed?<p>This archived project does not accept invitations.</p>:<form className="stack" onSubmit={review}>
      <label className="field"><span className="field-label">Requester company</span><select className="select" value={companyId} required disabled={locked||loading||!!intent||!options?.companies.length} onChange={event=>setCompanyId(event.target.value)}>
        <option value="">Choose an associated company</option>{options?.companies.map(company=><option key={company.id} value={company.id}>{company.name} · {companyLabels[company.type]??company.type}</option>)}
      </select></label>
      {!loading&&options&&!options.companies.length&&<p>Associate the requester’s company in Project companies below, then reload invitations.</p>}
      <label className="field"><span className="field-label">New requester email</span><Input type="email" value={email} required maxLength={254} disabled={locked||loading||!!intent} onChange={event=>setEmail(event.target.value)}/></label>
      <Button type="submit" disabled={locked||loading||!!intent||!companyId||!email.trim()}>Review requester invitation</Button>
    </form>}
    {intent&&<div className="stack" aria-label="Confirm requester invitation">
      <p>Invite <strong>{intent.email}</strong> from <strong>{selected?.name}</strong> as a <strong>Requester</strong> on this project.</p>
      <label className="checkbox-row"><input type="checkbox" checked={confirmed} disabled={locked} onChange={event=>setConfirmed(event.target.checked)}/><span>I confirm the company, email and project access.</span></label>
      <Button disabled={!confirmed||commandOwner.blocked(token)||gate.pending||gate.stale} onClick={()=>void send()}>{gate.pending?'Creating invitation…':gate.command?'Retry same invitation':'Create requester invitation'}</Button>
      {gate.stale&&<p role="alert">State changed. Reload invitations before another action.</p>}
    </div>}
    {inviteUrl&&<div className="stack"><SuccessBanner message="Requester invitation created. Share this link with the intended recipient; it expires in seven days."/>
      <label className="field"><span className="field-label">Registration link</span><Input readOnly value={inviteUrl} onFocus={event=>event.currentTarget.select()}/></label>
      <p>No email was sent. Account creation occurs when the recipient completes registration.</p>
    </div>}
    <Button variant="secondary" disabled={commandOwner.blocked(token)||gate.pending||!!gate.command&&!gate.stale} onClick={reload}>{intent&&!gate.locked?'Cancel and reload invitations':'Reload invitations'}</Button>
    {!!options?.pendingInvites.length&&<div><h4 className="panel-title">Pending requester invitations</h4><p>Up to 100 active invitations, newest first.</p><ul className="tm-list">{options.pendingInvites.map(invite=><li key={invite.email}>{invite.email} · {invite.companyName} · Expires {new Date(invite.expiresAt).toLocaleDateString()}</li>)}</ul></div>}
    </div>
  </details>;
}
