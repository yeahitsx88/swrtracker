import { notFound } from 'next/navigation';
import { RequestForm } from './request-form';

export default async function RequestPage({ params, searchParams }: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ draft?: string; tenantId?: string }>;
}) {
  const { projectId } = await params;
  const query = await searchParams;
  const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  if (!uuid.test(projectId) || (query.draft !== undefined &&
      (typeof query.draft !== 'string' || !uuid.test(query.draft)))) notFound();
  return <RequestForm projectId={projectId} draftId={query.draft}
    tenantId={typeof query.tenantId === 'string' ? query.tenantId : undefined} />;
}
