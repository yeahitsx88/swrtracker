import { notFound } from 'next/navigation';
import { SurveyOrgChartLauncher } from '@/components/ui/survey-org-chart/survey-org-chart-launcher';
import { TeamManagementEntry } from '@/components/ui/team-management-entry';

export const dynamic = 'force-dynamic';

export default async function SurveyOrgChartWorkspacePreview({ searchParams }: { searchParams: Promise<{ entry?: string }> }) {
  if (process.env.NODE_ENV !== 'development') notFound();
  // Browser tests intercept reads in this fixture harness; real APIs still authenticate.
  if ((await searchParams).entry === '1') return <main><TeamManagementEntry projectId="fixture-project" /></main>;
  return <main className="stack"><h1>Team Management chart launcher preview</h1><p>Fixture-only workspace preview. No operational staffing is loaded.</p><SurveyOrgChartLauncher /></main>;
}
