'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { ProjectHome } from '@/components/ui/project-home';
import { useRequestDetailsDialog } from '@/components/tickets/request-details-dialog';

export default function HomePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [refresh, setRefresh] = useState(0);
  const details = useRequestDetailsDialog(projectId, () => setRefresh(current => current + 1));
  return <>{details.dialog}<ProjectHome openRequest={details.open} refresh={refresh} /></>;
}
