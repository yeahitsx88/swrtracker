'use client';

import {useProjectWorkspace} from '@/components/ui/project-shell-header';
import {InvitationCancellationReview} from '@/components/ui/invitation-cancellation-review';
import {RecordCollection} from '@/components/ui/record-collection';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { apiClient } from '@/lib/apiClient';
import type { ProjectCompanyAccessResponse } from '@/lib/contracts/projects';
import { ApiClientError,getErrorMessage } from '@/lib/errors';
import { Button, Card, ErrorBanner, Input, Select, SuccessBanner } from '@/components/ui';
import {AdministrationSection,AdministrationRecords} from '@/components/ui/administration-records';
import {AdministrationBatch,type AdministrationAction} from '@/components/ui/administration-batch';
import {CommandOwner,FrozenCommand} from '@/lib/frozen-command';
import {apiRequest} from '@/lib/apiClient';
import { Field } from '@/components/forms';

export function SubcontractorAccess({ projectId,owner,companiesRevision=0,onInvitesChanged }: { projectId: string;owner:CommandOwner;companiesRevision?:number;onInvitesChanged?:()=>void }) {
  const centralIT=useProjectWorkspace()?.capabilities.centralIT===true;
  const ownerToken=useSyncExternalStore(owner.subscribe,owner.snapshot,owner.snapshot);
  const token='subcontractor-invite',gate=useRef(new FrozenCommand<{companyId:string;email:string}>()).current;
  const [,render]=useState(0),generation=useRef(0),[loading,setLoading]=useState(false),[readFailed,setReadFailed]=useState(false);const blocked=owner.blocked(token);
  const [selected,setSelected]=useState<string[]>([]),[batch,setBatch]=useState<AdministrationAction[]>(),[archived,setArchived]=useState(false);
  const [overview, setOverview] = useState<ProjectCompanyAccessResponse | null>(null);
  const [companyId, setCompanyId] = useState('');
  const [email, setEmail] = useState('');
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async (recover=false) => {
    if(gate.locked&&!recover)return false;const epoch=++generation.current;setLoading(true);setError(null);
    try {
      const next=await apiClient.getProjectCompanyAccess(projectId);if(epoch!==generation.current)return false;setOverview(next);setArchived(next.projectStatus==='ARCHIVED');
      setCompanyId((current) => next.companies.some(c=>c.id===current)?current:next.companies[0]?.id || '');return true;
    } catch (err) {
      if(epoch===generation.current){setOverview(null);setArchived(true);setError(getErrorMessage(err, 'Unable to load subcontractor access.'));}return false;
    }finally{if(epoch===generation.current)setLoading(false);}
  }, [projectId]);

  useEffect(() => { void load();return()=>{generation.current++;}; }, [load,companiesRevision]);

  async function reloadInvitation(){if(loading||busy!==null||owner.blocked(token)||gate.pending||gate.command&&!gate.stale||!owner.claim(token))return;setBusy('reload');
    try{if(!await load(true)){setReadFailed(true);return;}if(!gate.reload())return;setEmail('');setInviteUrl(null);setReadFailed(false);setError(null);}
    finally{if(!gate.locked)owner.release(token);setBusy(null);render(n=>n+1);}
  }
  async function invite() {
    if(loading||!overview||overview.invitationCreationBlockedReason!==null||archived||busy!==null||!owner.claim(token))return;
    const command=gate.begin({companyId,email},crypto.randomUUID());if(!command){if(!gate.locked)owner.release(token);return;}
    setBusy('invite');render(n=>n+1);
    setError(null);
    setSuccess(null);
    setInviteUrl(null);
    try {
      const response = await apiRequest<{inviteToken:string}>(`/api/projects/${projectId}/invites`,{method:'POST',body:command.body,headers:{'Idempotency-Key':command.key}});
      gate.success();owner.release(token);
      setInviteUrl(`${window.location.origin}/invite/${response.inviteToken}`);
      setEmail('');
      setSuccess('Requester invitation created. Share the registration link with the intended recipient.');
      await load();onInvitesChanged?.();
    } catch (err) {
      gate.fail(err instanceof ApiClientError?err.status:undefined);if(!gate.locked)owner.release(token);setError(getErrorMessage(err,'Outcome uncertain. Retry the unchanged invitation.'));
    } finally {
      setBusy(null);render(n=>n+1);
    }
  }


  return (
    <Card
      title="Subcontractor Access"
      description="Invite subcontractor requesters and designate who may view all requests from their company on this project."
    >
      <div className="stack">
        {error ? <ErrorBanner message={error} /> : null}
        {success ? <SuccessBanner message={success} /> : null}
        {!overview&&loading ? <p className="muted">Loading subcontractor access...</p> : null}
        {!overview&&!loading&&<Button variant="secondary" disabled={busy!==null||ownerToken!==null} onClick={()=>void load()}>Reload Subcontractor Access</Button>}
{gate.stale&&<p role="alert">{readFailed?'Current invitation records could not be loaded.':'Invitation state changed.'} Your reviewed invitation remains held. Reload Invitation must successfully read current access and project context before another invitation.</p>}
{gate.stale&&<Button variant="secondary" disabled={loading||blocked||busy!==null} onClick={()=>void reloadInvitation()}>Reload Invitation</Button>}
        {overview ? (
          <>
            <Field label="Subcontractor Company">
              <Select disabled={loading||busy!==null||ownerToken!==null} value={companyId} onChange={(event) => setCompanyId(event.target.value)}>
                {overview.companies.map((company) => (
                  <option key={company.id} value={company.id}>{company.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Requester Email">
              <Input disabled={loading||busy!==null||ownerToken!==null} type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
            </Field>
            <Button disabled={loading||busy !== null || blocked || gate.stale || archived || overview.invitationCreationBlockedReason!==null || !companyId || !email.trim()} onClick={() => void invite()}>
              {busy === 'invite' ? 'Creating...' : gate.command&&!gate.stale?'Retry Unchanged Invitation':'Create Invitation'}
            </Button>
            {overview.invitationCreationBlockedReason&&<p role="status">{overview.invitationCreationBlockedReason==='PREPARATION_CANCELLATION'?'New invitations are unavailable while preparation cancellation is in progress. Central IT may cancel eligible reviewed invitations below.':overview.invitationCreationBlockedReason==='RECOMMISSIONING'?'New invitations are unavailable during reopening preparation. Reopen the project before inviting requesters.':'Archived projects are read-only. Invitation records remain available below.'}</p>}
            {!gate.locked&&<Button variant="secondary" disabled={loading||busy!==null||ownerToken!==null} onClick={()=>void load()}>Refresh Subcontractor Access</Button>}
            {loading&&<p role="status">Loading current subcontractor access…</p>}
            {inviteUrl ? (
              <Field label="Registration Link (shown for this new invitation)">
                <Input readOnly value={inviteUrl} onFocus={(event) => event.currentTarget.select()} />
              </Field>
            ) : null}

            <AdministrationSection title="Subcontractor Requesters" locked={ownerToken!==null}>
            <AdministrationRecords scrollable label="subcontractor requesters" rows={overview.requesters} id={r=>r.userId} columns={[{key:'name',label:'Name',text:r=>r.name},{key:'email',label:'Email',text:r=>r.email},{key:'company',label:'Company',text:r=>r.companyName},{key:'view',label:'Company view',text:r=>r.authorityGrantId?'Granted':'Own requests'}]} selected={selected} onSelection={setSelected} disabled={loading||busy!==null||ownerToken!==null} eligible={()=>true} actions={r=><Button disabled={loading||busy!==null||ownerToken!==null||archived||!!batch} onClick={()=>setBatch([{url:r.authorityGrantId?`/api/projects/${projectId}/company-authority/${r.authorityGrantId}`:`/api/projects/${projectId}/company-authority`,method:r.authorityGrantId?'DELETE':'POST',body:r.authorityGrantId?{}:{userId:r.userId},label:`${r.authorityGrantId?'Revoke':'Grant'} ${r.companyName} view for ${r.name} (${r.email})`}])}>{r.authorityGrantId?'Revoke Company View':'Grant Company View'}</Button>}/>
            <div className="row">{[true,false].map(enabled=><Button key={String(enabled)} variant="secondary" disabled={!selected.length||busy!==null||ownerToken!==null||archived||!!batch} onClick={()=>setBatch(overview.requesters.filter(r=>selected.includes(r.userId)&&!!r.authorityGrantId!==enabled).map(r=>({url:enabled?`/api/projects/${projectId}/company-authority`:`/api/projects/${projectId}/company-authority/${r.authorityGrantId}`,method:enabled?'POST':'DELETE',body:enabled?{userId:r.userId}:{},label:`${enabled?'Grant':'Revoke'} ${r.companyName} view for ${r.name} (${r.email})`})))}>{enabled?'Review selected Company View grants':'Review selected Company View revocations'}</Button>)}</div>
            {batch&&<AdministrationBatch actions={batch} owner={owner} reload={()=>load(true)} onDone={()=>void load()} onCancel={()=>{setBatch(undefined);setSelected([]);}}/>}
            </AdministrationSection>

            <AdministrationSection title="Pending Invitations" locked={ownerToken!==null}>
            {overview.pendingInvites.length === 0 ? <p className="muted">No active invitations.</p> : null}
            <RecordCollection label="pending invitations" records={<>{overview.pendingInvites.map((inviteRecord) => (
              <div key={inviteRecord.id}>
                <strong>{inviteRecord.email}</strong>
                <div className="muted">
                  {inviteRecord.companyName} · expires {new Date(inviteRecord.expiresAt).toLocaleDateString()}
                </div>
                {centralIT&&<InvitationCancellationReview projectId={projectId} inviteId={inviteRecord.id} email={inviteRecord.email} owner={owner} disabled={loading||busy!==null||archived||gate.locked||!!batch} onSaved={()=>{setSuccess('Invitation cancelled. Its record and history are retained.');void load();onInvitesChanged?.();}}/>}
              </div>
            ))}</>}/>
            </AdministrationSection>
          </>
        ) : null}
      </div>
    </Card>
  );
}
