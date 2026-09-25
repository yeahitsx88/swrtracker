import { notFound } from 'next/navigation';
import { RequestList } from './request-list';

export default async function RequestsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(projectId)) notFound();
  return <RequestList projectId={projectId} />;
}
