import type { ReactNode } from 'react';
import Link from 'next/link';

export default async function ProjectLayout(
  {
    children,
    params,
  }: {
    children: ReactNode;
    params: Promise<{ projectId: string }>;
  },
) {
  const { projectId } = await params;

  return (
    <div className="stack">
      <section className="panel">
        <h1 className="panel-title">Project {projectId}</h1>
        <p className="muted">Mobile-first field request and crew execution surfaces.</p>
        <nav className="app-links" style={{ marginTop: '0.45rem' }}>
          <Link className="app-link" href={`/projects/${projectId}/request/new`}>New Request</Link>
          <Link className="app-link" href={`/projects/${projectId}/my-requests`}>My Requests</Link>
          <Link className="app-link" href={`/projects/${projectId}/drafts`}>Drafts</Link>
          <Link className="app-link" href={`/projects/${projectId}/crew/work`}>Crew Work</Link>
          <Link className="app-link" href={`/projects/${projectId}/crew/approvals`}>PC Approvals</Link>
          <Link className="app-link" href={`/projects/${projectId}/admin`}>Admin</Link>
        </nav>
      </section>
      {children}
    </div>
  );
}
