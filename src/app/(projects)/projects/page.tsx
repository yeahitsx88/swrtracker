'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Card, Input } from '@/components/ui';
import { Field } from '@/components/forms';

export default function ProjectsLauncherPage() {
  const router = useRouter();
  const [projectId, setProjectId] = useState('');

  function openProject() {
    if (!projectId.trim()) return;
    router.push(`/projects/${projectId.trim()}/my-requests`);
  }

  return (
    <Card
      title="Project Launcher"
      description="Enter a project ID to open requester, crew, and approval mobile surfaces."
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
  );
}
