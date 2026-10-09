import { DirectAssignmentForm } from '@/components/tickets/direct-assignment-form';
export default async function DirectAssignmentPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return <DirectAssignmentForm projectId={projectId} />;
}
