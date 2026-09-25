'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/apiClient';

export function ProjectHeading({ projectId }: { projectId: string }) {
  const [projectName, setProjectName] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    apiClient.listProjects()
      .then(({ projects }) => {
        if (active) {
          setProjectName(projects.find((project) => project.id === projectId)?.name ?? null);
        }
      })
      .catch(() => {
        // The project pages retain their normal authorization and error handling.
        // A failed label lookup should not replace their content with a second error.
      });

    return () => { active = false; };
  }, [projectId]);

  return (
    <>
      <h1 className="panel-title">{projectName ?? 'Project'}</h1>
      <p className="muted">Mobile-first field request and crew execution surfaces.</p>
    </>
  );
}
