'use client';

import { useParams } from 'next/navigation';
import { TeamManagementEntry } from '@/components/ui/team-management-entry';

export default function TeamManagementPage() {
  const { projectId } = useParams<{ projectId: string }>();
  return <TeamManagementEntry key={projectId} projectId={projectId} />;
}
