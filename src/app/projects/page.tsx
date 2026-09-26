'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, ApiError, errorMessage } from '../ui/api';
import { Shell } from '../ui/shell';

interface ProjectPage {
  projects: Array<{ id: string; name: string; status: string; roles: string[];
    canRequest: boolean; canViewRequests: boolean }>;
  hasMore: boolean;
  canViewAudit: boolean;
  canViewTenantHealth: boolean;
}

export default function ProjectsPage() {
  const [page, setPage] = useState<ProjectPage | null>(null);
  const [offset, setOffset] = useState(0);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState('');
  const [authNeeded, setAuthNeeded] = useState(false);
  useEffect(() => {
    let current = true; setPage(null); setError('');
    api<ProjectPage>(`/api/projects?limit=20&offset=${offset}`).then(result => {
      if (current) { setPage(result); setAuthNeeded(false); }
    }).catch(cause => {
      if (current) { setError(errorMessage(cause)); setAuthNeeded(cause instanceof ApiError && cause.status === 401); }
    });
    return () => { current = false; };
  }, [offset, revision]);
  return <Shell signedIn={Boolean(page)}><p className="eyebrow">Your workspace</p><h1>Projects</h1>
    <p className="muted">Open a project to view requests or start new work.</p>
    {error && <div className="notice error" role="alert">{error}{authNeeded && <p><Link href="/login?next=%2Fprojects">Sign in to see your projects</Link></p>}</div>}
    {!page && !error && <p role="status">Loading projects…</p>}
    <button className="secondary" onClick={() => setRevision(value => value + 1)}>Refresh projects</button>
    {page?.canViewAudit && <p className="actions"><Link className="button secondary" href="/audit">Tenant audit log</Link></p>}
    {page?.canViewTenantHealth && <p className="actions"><Link className="button secondary" href="/tenant-health">Project health dashboard</Link></p>}
    {page && <section className="panel" aria-label="Accessible projects">
      {!page.projects.length && <><h2>No projects found</h2><p>Ask your administrator for a project invitation.</p></>}
      {page.projects.map(project => <article className="record" key={project.id}>
        <span className="pill">{project.status === 'ARCHIVED' ? 'Archived · Read only' : project.status === 'SETUP' ? 'Being set up' : 'Active'}</span>
        <h2>{project.name}</h2>
        {project.status === 'SETUP' && <p className="muted">Requests will be available after project activation.</p>}
        <div className="actions">{project.canViewRequests && <Link className="button secondary" href={`/project/${project.id}/requests`}>View requests</Link>}
          {project.canViewRequests && <Link href={`/project/${project.id}/reports`}>Operational reports</Link>}
          {project.canRequest && <Link className="button" href={`/project/${project.id}/request`}>New request</Link>}</div>
      </article>)}
      {(offset > 0 || page.hasMore) && <div className="actions"><button className="secondary" disabled={offset === 0} onClick={() => setOffset(offset - 20)}>Previous</button>
        <span>Page {offset / 20 + 1}</span><button className="secondary" disabled={!page.hasMore} onClick={() => setOffset(offset + 20)}>Next</button></div>}
    </section>}
  </Shell>;
}
