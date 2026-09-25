import { ProjectEntryRedirect } from '@/components/ui';

export default async function ProjectIndexPage(
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  return <ProjectEntryRedirect projectId={projectId} />;
}
