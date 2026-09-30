'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/apiClient';
import { getErrorMessage } from '@/lib/errors';
import type { MyAccount } from '@/modules/tenancy/application/my-account';

export function AccountDetails({ assignments = false }: { assignments?: boolean }) {
  const [account, setAccount] = useState<MyAccount>();
  const [projectId, setProjectId] = useState<string>();
  const [error, setError] = useState<string>();
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    const id = new URLSearchParams(window.location.search).get('projectId') ?? undefined;
    setProjectId(id); setAccount(undefined); setError(undefined);
    apiClient.getMyAccount(assignments ? id : undefined).then(result => { if (active) setAccount(result); })
      .catch(cause => { if (active) setError(getErrorMessage(cause, 'Unable to load your account. Please retry.')); });
    return () => { active = false; };
  }, [assignments, revision]);
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
          <div><dt>Assigned Areas</dt><dd>{assignment.areas.length ? assignment.areas.join(', ') : 'No explicit Area assignments recorded.'}</dd></div>
          <div><dt>Crew relationships</dt><dd>{assignment.crew.length ? <ul>{assignment.crew.map((person, index) => <li key={index}>{person.name} — {person.role}</li>)}</ul> : 'No direct Party Chief / Instrument Man roster relationships recorded.'}</dd></div>
        </dl>
        <p className="muted">These are recorded assignments, not a complete permissions summary. Contact your Survey Manager for staffing changes.</p>
      </>}
    <div className="row"><Link className="app-link" href={projectId ? `/projects/${encodeURIComponent(projectId)}` : '/projects'}>{projectId ? 'Back to Home' : 'Open Projects'}</Link></div>
  </section>;
}
