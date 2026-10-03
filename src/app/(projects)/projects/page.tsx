'use client';

import Link from 'next/link';
import { ProjectCreation } from '@/components/ui/project-creation';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button, Card, Input } from '@/components/ui';
import { Field } from '@/components/forms';
import { apiClient } from '@/lib/apiClient';
import { getErrorMessage } from '@/lib/errors';
import type { ProjectMembershipRecord } from '@/lib/contracts/projects';
import { findProjectLandingHref, getMembershipLandingHref } from '@/components/ui/project-navigation';
import { Icon } from '@/components/ui/icon';
import { PROJECT_STATUS_LABELS, roleLabel } from '@/lib/display-labels';

export default function ProjectsLauncherPage() {
  const router = useRouter();
  const [projectId, setProjectId] = useState('');
  const [projects, setProjects] = useState<ProjectMembershipRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    apiClient.listProjects()
      .then((response) => {
        if (active) setProjects(response.projects);
      })
      .catch((err: unknown) => {
        if (active) setError(getErrorMessage(err, 'Unable to load your projects.'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, []);

  function openProject() {
    const destination = findProjectLandingHref(projects, projectId);
    if (!destination) {
      setError('Choose a project from your active memberships or enter its exact project ID.');
      return;
    }
    setError(null);
    router.push(destination);
  }

  return (
    <div className="stack">
      <ProjectCreation />
      <Card
        title="Project Launcher"
        description="Choose a project to open its requests and work queues."
      >
        <div className="stack">
          {loading ? <p className="muted">Loading your projects…</p> : null}
          {error ? <p className="error-banner">{error}</p> : null}
          {!loading && !error && projects.length === 0 ? (
            <p className="muted">You do not have access to an active or archived project.</p>
          ) : null}
          {projects.length > 0 ? (
            <div className="project-grid">
              {projects.map((project) => (
                <Link
                  className="ticket-card request-card project-card"
                  href={getMembershipLandingHref(project)}
                  key={project.id}
                >
                  <div className="request-card-top">
                    <h3 className="ticket-headline">{project.name}</h3>
                    <span className={`badge status-badge ${project.status === 'ARCHIVED' ? 'tone-neutral' : 'tone-success'}`}>{PROJECT_STATUS_LABELS[project.status] ?? project.status}</span>
                  </div>
                  <p className="meta-row"><span className="meta-item"><Icon name="user" size={15} />{roleLabel(project.role)}{project.canAdminister&&project.role!=='PROJECT_ADMIN'?' · Project Admin':''}</span></p>
                  <span className="project-card-open">{project.status === 'ARCHIVED' ? 'View project history' : 'Open project'} <Icon name="chevron" size={16} /></span>
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      </Card>

      <Card
        title="Open by project ID"
        description="Use the ID of one of your accessible projects for troubleshooting."
      >
        <div className="stack">
          <Field label="Project ID">
            <Input
              placeholder="project UUID"
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
            />
          </Field>
          <Button onClick={openProject}>Open Project</Button>
        </div>
      </Card>
    </div>
  );
}
