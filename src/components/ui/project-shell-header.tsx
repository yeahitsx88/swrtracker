'use client';

import { useEffect, useState } from 'react';
import type { ProjectMembershipRecord } from '@/lib/contracts/projects';
import { apiClient,apiRequest } from '@/lib/apiClient';
import { roleLabel } from '@/lib/display-labels';
import { ProjectNav } from './project-nav';

export function ProjectShellHeader({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<ProjectMembershipRecord | null>(null);
  const [canAdminister,setCanAdminister]=useState(false);

  useEffect(() => {
    let active = true;
    setCanAdminister(false);
    apiRequest<{capabilities:{canAdminister:boolean}}>(`/api/projects/${projectId}/capabilities`).then(value=>{if(active)setCanAdminister(value.capabilities.canAdminister);}).catch(()=>{});
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
    <section className="project-header" aria-label="Project">
      <div className="project-heading">
        <h1 className="project-name">{project?.name ?? 'Project'}</h1>
        {project ? <span className="project-role">{roleLabel(project.role)}</span> : null}
      </div>
      {project ? <ProjectNav projectId={projectId} role={project.role} canAdminister={canAdminister}/> : canAdminister?<ProjectNav projectId={projectId} role="PROJECT_ADMIN"/>:null}
    </section>
  );
}
