'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { ProjectMembershipRecord } from '@/lib/contracts/projects';
import type { ProjectCapabilities } from '@/lib/contracts/account-offboarding';
import { apiClient, apiRequest } from '@/lib/apiClient';
import { getErrorMessage } from '@/lib/errors';
import { roleLabel } from '@/lib/display-labels';
import { ProjectNav } from './project-nav';
import { PageTransition } from './page-transition';
import './project-workspace.css';

interface WorkspaceContext {
  actorId:string;
  refresh:()=>void;
  project: Pick<ProjectMembershipRecord, 'id' | 'name' | 'status'>;
  capabilities: ProjectCapabilities;
}
const ProjectContext = createContext<WorkspaceContext | null>(null);
export const useProjectWorkspace = () => useContext(ProjectContext);

/** Presentation follows current capabilities; destination APIs authorize every read and action. */
export function ProjectShellHeader({ projectId, requireProject = true, canCreateProject = false, children }: { projectId?: string; requireProject?: boolean; canCreateProject?: boolean; children?: ReactNode }) {
  const pathname = usePathname();
  const [revision, setRevision] = useState(0);
  const [snapshot, setSnapshot] = useState<{ key: string; context?: WorkspaceContext; error?: string }>();
  const key = JSON.stringify([projectId, pathname, revision]);
  const current = snapshot?.key === key ? snapshot : undefined;
  useEffect(() => {
    let active = true;
    if (!projectId) return;
    async function load() {
      const [{ projects }, { capabilities,actorId }] = await Promise.all([
        apiClient.listProjects(), apiRequest<{ capabilities: ProjectCapabilities;actorId:string }>(`/api/projects/${projectId}/capabilities`),
      ]);
      let project: WorkspaceContext['project'] | undefined = projects.find(candidate => candidate.id === projectId);
      if (!project && capabilities.canAdminister) {
        project = (await apiClient.projectAdministration()).projects.find(candidate => candidate.id === projectId);
      }
      if (!project || (!capabilities.operationalRole && !capabilities.canAdminister)) {
        throw new Error('Current access to this project is unavailable. Return to Projects to review your access.');
      }
      if (active) {
        setSnapshot({ key, context: { project, capabilities,actorId,refresh:()=>setRevision(value=>value+1) } });
        try { window.sessionStorage.setItem('swr-workspace-project', project.id); } catch { /* Explicit navigation links retain context. */ }
      }
    }
    load().catch(error => { if (active) setSnapshot(previous => ({ key, context: previous?.context?.project.id === projectId ? previous.context : undefined, error: getErrorMessage(error, 'Unable to load project navigation. Retry to check current access.') })); });
    return () => { active = false; };
  }, [projectId, key]);

  const context = current?.error ? undefined : current?.context;
  // Keep same-project editors mounted while current access is checked; hidden
  // retained state supplies no navigation or visible action authority.
  const priorContext = snapshot?.context;
  const retainedContext = priorContext?.project.id === projectId ? priorContext : undefined;
  const project = context?.project;
  const capabilities = context?.capabilities;
  const administrationRoot = `/projects/${projectId}/admin`;
  const administrationUnavailable = !!context && (pathname === administrationRoot || pathname.startsWith(administrationRoot + '/')) && !capabilities?.canAdminister;
  return <ProjectContext.Provider value={context ?? retainedContext ?? null}>
    <div className="project-workspace">
      <ProjectNav projectId={context ? projectId : undefined} role={capabilities?.operationalRole ?? null} canAdminister={capabilities?.canAdminister} canCreateProject={canCreateProject} status={project?.status ?? 'ACTIVE'} projectName={project?.name ?? 'SWRTracker'} />
      <div className="project-content">
        {project && capabilities && <header className="project-context"><div><span className="project-context-name">{project.name}</span><span className="project-context-role">{capabilities.operationalRole ? roleLabel(capabilities.operationalRole) : 'Project administration'}{capabilities.canAdminister && capabilities.operationalRole && capabilities.operationalRole !== 'PROJECT_ADMIN' ? ' · Project administration' : ''}</span></div><span className="badge badge-neutral">{project.status === 'ACTIVE' ? 'Active project' : project.status === 'ARCHIVED' ? 'Archived · history available' : 'Setup · workflow restricted'}</span></header>}
        {project && project.status !== 'ACTIVE' && <p className="workspace-state-note">{project.status === 'ARCHIVED' ? 'This project is archived. Authorized history remains available; ordinary work commands are restricted.' : 'This project is in setup or recommissioning preparation. Use the existing administration and work-resolution controls where authorized.'}</p>}
        {projectId && !current && <p className="muted" role="status">Loading your project workspace…</p>}
        {current?.error && <section className="panel stack"><p className="error-banner" role="alert">{current.error}</p><div className="row"><button className="button button-secondary" onClick={() => setRevision(value => value + 1)}>Retry project access</button><Link className="app-link" href="/projects">Return to Projects</Link></div></section>}
        {administrationUnavailable && <section className="panel stack"><h1>Project Administration Unavailable</h1><p>Your account does not have Project Admin access. Return to your project to continue your work.</p><div className="row"><button className="button button-secondary" onClick={() => setRevision(value => value + 1)}>Retry project access</button><Link className="app-link" href={`/projects/${projectId}/home`}>Return to Project</Link></div></section>}
        {(!requireProject || retainedContext) && <PageTransition hidden={requireProject && (!context || administrationUnavailable)}>{children}</PageTransition>}
      </div>
    </div>
  </ProjectContext.Provider>;
}
