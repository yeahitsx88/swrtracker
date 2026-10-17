'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/apiClient';
import { getErrorMessage } from '@/lib/errors';
import { findProjectLandingHref } from './project-navigation';

export function ProjectEntryRedirect({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    apiClient.listProjects()
      .then(({ projects }) => {
        if (!active) return;
        const destination = findProjectLandingHref(projects, projectId);
        if (destination) router.replace(destination);
        else setError('You do not have an active membership for this project.');
      })
      .catch((err: unknown) => {
        if (active) setError(getErrorMessage(err, 'Unable to open this project.'));
      });

    return () => { active = false; };
  }, [projectId, router]);

  if (error) {
    return (
      <section className="panel stack">
        <p className="error-banner">{error}</p>
        <Link className="app-link" href="/projects">Return to Project Launcher</Link>
      </section>
    );
  }

  return <p className="muted">Opening your project workspace…</p>;
}
