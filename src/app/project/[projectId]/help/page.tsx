import { notFound } from 'next/navigation';
import { HelpBoard } from './help-board';
export default async function HelpPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(projectId)) notFound();
  return <HelpBoard projectId={projectId} />;
}
