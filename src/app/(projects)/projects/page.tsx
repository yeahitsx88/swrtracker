'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button, Card, Input } from '@/components/ui';
import { Field } from '@/components/forms';
import { apiClient } from '@/lib/apiClient';
import { getErrorMessage } from '@/lib/errors';
import type { ProjectMembershipRecord } from '@/lib/contracts/projects';

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
    if (!projectId.trim()) return;
    router.push(`/projects/${projectId.trim()}/my-requests`);
  }

  return (
    <div className="stack">
      <Card
        title="Project Launcher"
        description="Choose a project to open its requests and work queues."
      >
        <div className="stack">
          {loading ? <p className="muted">Loading your projects…</p> : null}
          {error ? <p className="error-banner">{error}</p> : null}
          {!loading && !error && projects.length === 0 ? (
            <p className="muted">You do not have an active project membership.</p>
          ) : null}
          {projects.length > 0 ? (
            <div className="ticket-grid">
              {projects.map((project) => (
                <Link
                  className="ticket-card"
                  href={`/projects/${project.id}/my-requests`}
                  key={project.id}
                >
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <h3 className="ticket-headline">{project.name}</h3>
                    <span className="badge badge-success">{project.status}</span>
                  </div>
                  <p className="muted">Role: {project.role.replaceAll('_', ' ')}</p>
                  <span className="app-link">Open Project</span>
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      </Card>

      <Card
        title="Open by project ID"
        description="Use a known project ID for troubleshooting or direct navigation."
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
