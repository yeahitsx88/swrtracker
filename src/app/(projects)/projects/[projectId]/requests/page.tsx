'use client';

import { useParams } from 'next/navigation';
import { ProjectReview } from '@/components/tickets/project-review';

export default function ProjectRequestsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  return <ProjectReview key={projectId} projectId={projectId} />;
}
