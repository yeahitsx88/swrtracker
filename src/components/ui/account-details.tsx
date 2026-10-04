'use client';
import {AdministrationRecords,AdministrationSection} from '@/components/ui/administration-records';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/apiClient';
import { getErrorMessage } from '@/lib/errors';
import type { MyAccount } from '@/modules/tenancy/application/my-account';
import {useProjectWorkspace} from './project-shell-header';

export function AccountDetails({ assignments = false }: { assignments?: boolean }) {
  const workspace = useProjectWorkspace();
  const [account, setAccount] = useState<MyAccount>();
  const [projectId, setProjectId] = useState<string>();
  const [error, setError] = useState<string>();
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    const id = new URLSearchParams(window.location.search).get('projectId') ?? workspace?.project.id;
    setProjectId(id); setAccount(undefined); setError(undefined);
    apiClient.getMyAccount(assignments ? id : undefined).then(result => { if (active) setAccount(result); })
      .catch(cause => { if (active) setError(getErrorMessage(cause, 'Unable to load your account. Please retry.')); });
    return () => { active = false; };
  }, [assignments, revision, workspace?.project.id]);
  const assignment = account?.assignment;
  return <section className="panel stack">
    <h1 className="panel-title">{assignments ? 'Assignment Details' : 'Profile'}</h1>
    {error ? <><p role="alert" className="error-banner">{error}</p><button className="button button-secondary" onClick={() => setRevision(revision + 1)}>Retry</button></>
      : !account ? <p role="status" className="muted">Loading your details…</p>
      : !assignments ? <>
        <dl className="account-facts"><div><dt>Name</dt><dd>{account.name}</dd></div><div><dt>Email</dt><dd>{account.email}</dd></div><div><dt>Company</dt><dd>{account.company}</dd></div></dl>
        <p className="muted">Contact your administrator to correct your account details.</p>
        <Link className="app-link" href="/forgot-password">Reset password</Link>
      </> : !assignment ? <p className="muted">Open a project, then choose Assignment Details to see your role, Areas and crew.</p> : <>
        <dl className="account-facts">
          <div><dt>Project role</dt><dd>{assignment.role.toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase())}</dd></div>
          <div><dt>Assigned Areas</dt><dd>{assignment.areas.length ? <AdministrationRecords label="assigned Areas" rows={assignment.areas.map((name,id)=>({name,id:String(id)}))} id={a=>a.id} columns={[{key:'name',label:'Area',text:a=>a.name}]}/> : 'No explicit Area assignments recorded.'}</dd></div>
          <div><dt>Crew relationships</dt><dd>{assignment.crew.length ? <AdministrationSection title="Recorded crew relationships" open><AdministrationRecords label="crew relationships" rows={assignment.crew.map((p,index)=>({...p,id:String(index)}))} id={p=>p.id} columns={[{key:'name',label:'Name',text:p=>p.name},{key:'role',label:'Role',text:p=>p.role}]}/></AdministrationSection> : 'No direct Party Chief / Instrument Man roster relationships recorded.'}</dd></div>
        </dl>
        <p className="muted">These are recorded assignments, not a complete permissions summary. Contact your Survey Manager for staffing changes.</p>
      </>}
    <div className="row"><Link className="app-link" href={projectId ? `/projects/${encodeURIComponent(projectId)}` : '/projects'}>{projectId ? 'Back to Home' : 'Open Projects'}</Link></div>
  </section>;
}
