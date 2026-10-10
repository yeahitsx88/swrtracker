'use client';

import { useParams } from 'next/navigation';
import { RequestDetails } from '@/components/tickets/request-details';

export default function TicketDetailPage() {
  const { projectId, ticketId } = useParams<{ projectId: string; ticketId: string }>();
  return <RequestDetails projectId={projectId} ticketId={ticketId} />;
}
