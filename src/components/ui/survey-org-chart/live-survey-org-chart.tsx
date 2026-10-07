'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/apiClient';
import type { SurveyOrganization } from '@/modules/tenancy/application/read-survey-organization';
import { Button } from '../button';
import { ErrorBanner } from '@/components/ui';
import { SurveyOrgChartWorkspace } from './survey-org-chart-workspace';

/** No fixture fallback. Retire responses from closed/reloaded/different project views. */
export function LiveSurveyOrgChart({ projectId }: { projectId: string }) {
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<SurveyOrganization>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    let active = true;
    apiClient.getSurveyOrganization(projectId).then(result => {
      if (active) {
        if (result.projectId !== projectId.toLowerCase()) setError('The returned hierarchy belongs to another project. Reload to check your access.');
        else setData(result);
      }
    }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Could not load the project hierarchy.'); });
    return () => { active = false; };
  }, [projectId, revision]);
  const reload = () => { setData(undefined); setError(undefined); setRevision(value => value + 1); };
  if (error) return <div className="org-workspace stack"><ErrorBanner message={error} /><Button variant="secondary" onClick={reload}>Reload hierarchy</Button></div>;
  if (!data) return <p className="org-workspace" role="status">Loading authorized project hierarchy…</p>;
  return <SurveyOrgChartWorkspace key={`${projectId}:${revision}`} organization={data} onReload={reload} />;
}
