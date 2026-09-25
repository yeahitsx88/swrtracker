import type { ReactNode } from 'react';
import { ProjectNav } from '@/components/ui';
import { ProjectHeading } from './project-heading';

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
        <ProjectHeading projectId={projectId} />
        <ProjectNav projectId={projectId} />
      </section>
      {children}
    </div>
  );
}
