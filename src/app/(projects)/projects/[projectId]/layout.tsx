import type { ReactNode } from 'react';
import { ProjectShellHeader } from '@/components/ui';

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
      <ProjectShellHeader projectId={projectId} />
      {children}
    </div>
  );
}
