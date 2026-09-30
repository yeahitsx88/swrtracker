'use client';

import { useParams } from 'next/navigation';
import { TeamManagement } from '@/components/ui/team-management';

export default function TeamManagementPage() {
  const { projectId } = useParams<{ projectId: string }>();
  return <TeamManagement key={projectId} projectId={projectId} />;
}
