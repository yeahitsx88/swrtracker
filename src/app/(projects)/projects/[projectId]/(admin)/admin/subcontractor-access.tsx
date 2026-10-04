'use client';

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

export function SubcontractorAccess({ projectId,owner,companiesRevision=0 }: { projectId: string;owner:CommandOwner;companiesRevision?:number }) {
  const ownerToken=useSyncExternalStore(owner.subscribe,owner.snapshot,owner.snapshot);
  const token='subcontractor-invite',gate=useRef(new FrozenCommand<{companyId:string;email:string}>()).current;
  const [,render]=useState(0);const blocked=owner.blocked(token);
  const [selected,setSelected]=useState<string[]>([]),[batch,setBatch]=useState<AdministrationAction[]>(),[archived,setArchived]=useState(false);
  const [overview, setOverview] = useState<ProjectCompanyAccessResponse | null>(null);
  const [companyId, setCompanyId] = useState('');
  const [email, setEmail] = useState('');
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const next = await apiClient.getProjectCompanyAccess(projectId);
      setOverview(next);
      const context=await apiRequest<{project:{status:string}}>(`/api/projects/${projectId}/template`);setArchived(context.project.status==='ARCHIVED');
      setCompanyId((current) => next.companies.some(c=>c.id===current)?current:next.companies[0]?.id || '');
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to load subcontractor access.'));
    }
  }, [projectId]);

  useEffect(() => { void load(); }, [load,companiesRevision]);

  async function invite() {
    if(archived||busy!==null||!owner.claim(token))return;
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
      await load();
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
        {!overview ? <p className="muted">Loading subcontractor access...</p> : null}
        {overview ? (
          <>
            <Field label="Subcontractor Company">
              <Select disabled={busy!==null||ownerToken!==null} value={companyId} onChange={(event) => setCompanyId(event.target.value)}>
                {overview.companies.map((company) => (
                  <option key={company.id} value={company.id}>{company.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Requester Email">
              <Input disabled={busy!==null||ownerToken!==null} type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
            </Field>
            <Button disabled={busy !== null || blocked || gate.stale || archived || !companyId || !email.trim()} onClick={() => void invite()}>
              {busy === 'invite' ? 'Creating...' : gate.command?'Retry Unchanged Invitation':'Create Invitation'}
            </Button>
            {gate.stale&&<Button variant="secondary" disabled={blocked||busy!==null} onClick={()=>{if(gate.reload()){owner.release(token);setError(null);void load();}}}>Reload Invitation</Button>}
            {inviteUrl ? (
              <Field label="Registration Link (shown for this new invitation)">
                <Input readOnly value={inviteUrl} onFocus={(event) => event.currentTarget.select()} />
              </Field>
            ) : null}

            <AdministrationSection title="Subcontractor Requesters" locked={ownerToken!==null}>
            <AdministrationRecords scrollable label="subcontractor requesters" rows={overview.requesters} id={r=>r.userId} columns={[{key:'name',label:'Name',text:r=>r.name},{key:'email',label:'Email',text:r=>r.email},{key:'company',label:'Company',text:r=>r.companyName},{key:'view',label:'Company view',text:r=>r.authorityGrantId?'Granted':'Own requests'}]} selected={selected} onSelection={setSelected} disabled={busy!==null||ownerToken!==null} eligible={()=>true} actions={r=><Button disabled={busy!==null||ownerToken!==null||archived||!!batch} onClick={()=>setBatch([{url:r.authorityGrantId?`/api/projects/${projectId}/company-authority/${r.authorityGrantId}`:`/api/projects/${projectId}/company-authority`,method:r.authorityGrantId?'DELETE':'POST',body:r.authorityGrantId?{}:{userId:r.userId},label:`${r.authorityGrantId?'Revoke':'Grant'} ${r.companyName} view for ${r.name} (${r.email})`}])}>{r.authorityGrantId?'Revoke Company View':'Grant Company View'}</Button>}/>
            <div className="row">{[true,false].map(enabled=><Button key={String(enabled)} variant="secondary" disabled={!selected.length||busy!==null||ownerToken!==null||archived||!!batch} onClick={()=>setBatch(overview.requesters.filter(r=>selected.includes(r.userId)&&!!r.authorityGrantId!==enabled).map(r=>({url:enabled?`/api/projects/${projectId}/company-authority`:`/api/projects/${projectId}/company-authority/${r.authorityGrantId}`,method:enabled?'POST':'DELETE',body:enabled?{userId:r.userId}:{},label:`${enabled?'Grant':'Revoke'} ${r.companyName} view for ${r.name} (${r.email})`})))}>{enabled?'Review selected Company View grants':'Review selected Company View revocations'}</Button>)}</div>
            {batch&&<AdministrationBatch actions={batch} owner={owner} onDone={()=>void load()} onCancel={()=>{setBatch(undefined);setSelected([]);void load();}}/>}
            </AdministrationSection>

            <AdministrationSection title="Pending Invitations" locked={ownerToken!==null}>
            {overview.pendingInvites.length === 0 ? <p className="muted">No active invitations.</p> : null}
            <RecordCollection label="pending invitations" records={<>{overview.pendingInvites.map((inviteRecord) => (
              <div key={inviteRecord.id}>
                <strong>{inviteRecord.email}</strong>
                <div className="muted">
                  {inviteRecord.companyName} · expires {new Date(inviteRecord.expiresAt).toLocaleDateString()}
                </div>
              </div>
            ))}</>}/>
            </AdministrationSection>
          </>
        ) : null}
      </div>
    </Card>
  );
}
