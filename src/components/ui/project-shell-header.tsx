'use client';

import { useEffect, useState } from 'react';
import type { ProjectMembershipRecord } from '@/lib/contracts/projects';
import { apiClient } from '@/lib/apiClient';
import { ProjectNav } from './project-nav';

export function ProjectShellHeader({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<ProjectMembershipRecord | null>(null);

  useEffect(() => {
    let active = true;
    apiClient.listProjects()
      .then(({ projects }) => {
        if (active) setProject(projects.find((candidate) => candidate.id === projectId) ?? null);
      })
      .catch(() => {
        // Page APIs remain the source of truth for authorization and error handling.
      });

    return () => { active = false; };
  }, [projectId]);

  return (
    <section className="panel">
      <h1 className="panel-title">{project?.name ?? 'Project'}</h1>
      <p className="muted">Mobile-first field request and crew execution surfaces.</p>
      {project ? <ProjectNav projectId={projectId} role={project.role} /> : null}
    </section>
  );
}
