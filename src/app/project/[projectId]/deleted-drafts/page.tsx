import { notFound } from 'next/navigation';
import { DeletedDrafts } from './deleted-drafts';

export default async function DeletedDraftsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(projectId)) notFound();
  return <DeletedDrafts projectId={projectId} />;
}
