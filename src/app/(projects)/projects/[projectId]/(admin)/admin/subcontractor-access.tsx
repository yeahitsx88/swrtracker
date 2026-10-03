'use client';

import {RecordCollection} from '@/components/ui/record-collection';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { apiClient } from '@/lib/apiClient';
import type { ProjectCompanyAccessResponse } from '@/lib/contracts/projects';
import { ApiClientError, getErrorMessage } from '@/lib/errors';
import { Button, Card, ErrorBanner, Input, Select, SuccessBanner } from '@/components/ui';
import {AdministrationSection,AdministrationRecords} from '@/components/ui/administration-records';
import {AdministrationBatch,type AdministrationAction} from '@/components/ui/administration-batch';
import {CommandOwner,FrozenCommand} from '@/lib/frozen-command';
import {AdministrationDialog} from '@/components/ui/administration-dialog';
import {useUnsavedProgress} from '@/lib/use-unsaved-progress';
import {apiRequest} from '@/lib/apiClient';
import { Field } from '@/components/forms';

export function SubcontractorAccess({ projectId }: { projectId: string }) {
  const owner=useRef(new CommandOwner()).current,ownerToken=useSyncExternalStore(owner.subscribe,owner.snapshot,owner.snapshot);
  const [selected,setSelected]=useState<string[]>([]),[batch,setBatch]=useState<AdministrationAction[]>(),[archived,setArchived]=useState(false);
  const [overview, setOverview] = useState<ProjectCompanyAccessResponse | null>(null);
  const [companyId, setCompanyId] = useState('');
  const [email, setEmail] = useState('');
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [inviteOpen,setInviteOpen]=useState(false),[step,setStep]=useState(0),[confirmed,setConfirmed]=useState(false);
  const command=useRef(new FrozenCommand<{companyId:string;email:string}>());
  const locked=command.current.locked,uncertain=!!command.current.command&&!command.current.stale;
  useUnsavedProgress(locked);
  function closeInvite(){if(command.current.reload()){owner.release('invite');setInviteOpen(false);void load();}}

  const load = useCallback(async () => {
    setError(null);
    try {
      const next = await apiClient.getProjectCompanyAccess(projectId);
      setOverview(next);
      const context=await apiRequest<{project:{status:string}}>(`/api/projects/${projectId}/template`);setArchived(context.project.status==='ARCHIVED');
      setCompanyId((current) => current || next.companies[0]?.id || '');
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to load subcontractor access.'));
    }
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  async function invite() {
    if(!confirmed||!owner.claim('invite'))return;
    const attempt=command.current.begin({companyId,email:email.trim().toLowerCase()},crypto.randomUUID());if(!attempt)return;
    setBusy('invite');
    setError(null);
    setSuccess(null);
    setInviteUrl(null);
    try {
      const response = await apiRequest<{inviteToken:string}>(`/api/projects/${projectId}/invites`,{method:'POST',body:attempt.body,headers:{'Idempotency-Key':attempt.key}});
      command.current.success();setStep(3);
      setInviteUrl(`${window.location.origin}/invite/${response.inviteToken}`);
      setSuccess('Requester invitation created. Share the registration link with the intended recipient.');
    } catch (err) {
      command.current.fail(err instanceof ApiClientError?err.status:undefined);
      setError(getErrorMessage(err, 'Unable to create requester invitation.'));
    } finally {
      setBusy(null);
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
            <Button disabled={busy!==null||ownerToken!==null||archived||!!batch} onClick={()=>{if(owner.claim('invite')){setInviteOpen(true);setStep(0);setEmail('');setConfirmed(false);setInviteUrl(null);setSuccess(null);setError(null);}}}>Invite a subcontractor requester</Button>
            {inviteOpen&&<AdministrationDialog title={inviteUrl?'Invitation created':'Invite a subcontractor requester'} step={{current:step+1,total:4,label:['Email','Company','Review','Complete'][step]!}} onClose={closeInvite} closeDisabled={busy!==null||uncertain}
              footer={inviteUrl?<Button onClick={closeInvite}>Close</Button>:<><Button variant="secondary" disabled={busy!==null||uncertain} onClick={()=>{if(command.current.stale){command.current.reload();setStep(0);setConfirmed(false);void load();}else closeInvite();}}>{command.current.stale?'Reload current access':'Cancel'}</Button><div className="row">{step>0&&<Button variant="secondary" disabled={locked} onClick={()=>{setStep(step-1);setConfirmed(false);}}>Back</Button>}{step<2?<Button disabled={locked||(step===0?!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()):!overview.companies.some(c=>c.id===companyId))} onClick={()=>setStep(step+1)}>Next</Button>:<Button disabled={busy!==null||command.current.stale||!confirmed} onClick={()=>void invite()}>{busy?'Creating…':uncertain?'Retry unchanged invitation':'Create invitation'}</Button>}</div></>}>
            {error&&<ErrorBanner message={error}/>} {command.current.stale&&<p role="alert">State changed. Reload and review again.</p>}
            {step===0&&<Field label="Requester email"><Input type="email" maxLength={254} value={email} disabled={locked} onChange={e=>setEmail(e.target.value)}/></Field>}
            {step===1&&<><Field label="Subcontractor company">
              <Select value={companyId} disabled={locked} onChange={(event) => setCompanyId(event.target.value)}>
                <option value="">Choose a company</option>
                {overview.companies.map((company) => (
                  <option key={company.id} value={company.id}>{company.name}</option>
                ))}
              </Select>
            </Field>
            {!overview.companies.length&&<p>No associated subcontractor companies. Close this flow and register or associate a company first.</p>}</>}
            {step===2&&<><dl className="administration-dialog-summary"><div><dt>Email</dt><dd>{email.trim()}</dd></div><div><dt>Company</dt><dd>{overview.companies.find(c=>c.id===companyId)?.name}</dd></div></dl><p>The recipient creates their profile using a link valid for seven days. They receive Requester access on this project; company-wide view is granted separately.</p><label className="checkbox-row"><input type="checkbox" checked={confirmed} disabled={locked} onChange={e=>setConfirmed(e.target.checked)}/><span>I confirm this recipient and company.</span></label></>}
            {inviteUrl ? (
              <><SuccessBanner message="Invitation created. Share this link with the intended recipient."/>
              <Field label="Registration Link (shown for this new invitation)">
                <Input readOnly value={inviteUrl} onFocus={(event) => event.currentTarget.select()} />
              </Field>
              <Button variant="secondary" onClick={()=>{void navigator.clipboard.writeText(inviteUrl).then(()=>setSuccess('Registration link copied.')).catch(()=>setError('Copy failed. Select and copy the displayed link.'));}}>Copy registration link</Button>{success&&<p role="status">{success}</p>}</>
            ) : null}
            </AdministrationDialog>}

            <AdministrationSection title="Subcontractor Requesters" locked={ownerToken!==null}>
            <AdministrationRecords label="subcontractor requesters" rows={overview.requesters} id={r=>r.userId} columns={[{key:'name',label:'Name',text:r=>r.name},{key:'email',label:'Email',text:r=>r.email},{key:'company',label:'Company',text:r=>r.companyName},{key:'view',label:'Company view',text:r=>r.authorityGrantId?'Granted':'Own requests'}]} selected={selected} onSelection={setSelected} disabled={busy!==null||ownerToken!==null} eligible={()=>true} actions={r=><Button disabled={busy!==null||ownerToken!==null||archived||!!batch} onClick={()=>setBatch([{url:r.authorityGrantId?`/api/projects/${projectId}/company-authority/${r.authorityGrantId}`:`/api/projects/${projectId}/company-authority`,method:r.authorityGrantId?'DELETE':'POST',body:r.authorityGrantId?{}:{userId:r.userId},label:`${r.authorityGrantId?'Revoke':'Grant'} ${r.companyName} view for ${r.name} (${r.email})`}])}>{r.authorityGrantId?'Revoke Company View':'Grant Company View'}</Button>}/>
            <div className="row">{[true,false].map(enabled=><Button key={String(enabled)} variant="secondary" disabled={!selected.length||busy!==null||ownerToken!==null||archived||!!batch} onClick={()=>setBatch(overview.requesters.filter(r=>selected.includes(r.userId)&&!!r.authorityGrantId!==enabled).map(r=>({url:enabled?`/api/projects/${projectId}/company-authority`:`/api/projects/${projectId}/company-authority/${r.authorityGrantId}`,method:enabled?'POST':'DELETE',body:enabled?{userId:r.userId}:{},label:`${enabled?'Grant':'Revoke'} ${r.companyName} view for ${r.name} (${r.email})`})))}>{enabled?'Review selected Company View grants':'Review selected Company View revocations'}</Button>)}</div>
            {batch&&<AdministrationBatch actions={batch} owner={owner} onDone={()=>void load()} onCancel={()=>{setBatch(undefined);setSelected([]);void load();}}/>}
            </AdministrationSection>

            <h3>Pending Invitations</h3>
            {overview.pendingInvites.length === 0 ? <p className="muted">No active invitations.</p> : null}
            <RecordCollection label="pending invitations" records={<>{overview.pendingInvites.map((inviteRecord) => (
              <div key={inviteRecord.id}>
                <strong>{inviteRecord.email}</strong>
                <div className="muted">
                  {inviteRecord.companyName} · expires {new Date(inviteRecord.expiresAt).toLocaleDateString()}
                </div>
              </div>
            ))}</>}/>
          </>
        ) : null}
      </div>
    </Card>
  );
}
