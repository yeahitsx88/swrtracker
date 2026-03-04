import type { ReactNode } from 'react';
import { ProjectNav } from '@/components/ui';

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
        <ProjectNav projectId={projectId} />
      </section>
      {children}
    </div>
  );
}
