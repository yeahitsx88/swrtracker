import { redirect } from 'next/navigation';
/** Survey notices now live in the shared project inbox. */
export default async function SurveyNotificationsRedirect({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  redirect(`/projects/${projectId}/notifications`);
}
