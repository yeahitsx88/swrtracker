import { ProjectInboxPage } from '@/components/ui/project-inbox';
export default async function NotificationsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return <ProjectInboxPage projectId={projectId} />;
}
