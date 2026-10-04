'use client';

import { useEffect, useState } from 'react';
import { useParams, usePathname } from 'next/navigation';
import { apiClient, apiRequest } from '@/lib/apiClient';
import { getErrorMessage } from '@/lib/errors';
import { Button, Card, ErrorBanner, Input, SuccessBanner } from '@/components/ui';
import { Field } from '@/components/forms';
import { SubcontractorAccess } from './subcontractor-access';
import { DraftRecovery } from './draft-recovery';
import { ProtectedSurveyObligations } from '@/components/ui/protected-survey-obligations';
import {AdministrationArea,AdministrationWorkspace} from '@/components/ui/administration-workspace';
import {ProjectAdministration} from '@/components/ui/project-administration';

export function AdminProjectWorkspace() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const pathname = usePathname();
  const base = `/projects/${projectId}/admin`;
  const tabs = [{id:'admin-personnel',label:'Personnel',href:base},{id:'admin-administrators',label:'Project Admins',href:base+'/administrators'},{id:'admin-companies',label:'Companies',href:base+'/companies'},{id:'admin-settings',label:'Settings',href:base+'/settings'},{id:'admin-request-policy',label:'Request Policy',href:base+'/request-policy'},{id:'admin-access-recovery',label:'Access and Recovery',href:base+'/access-recovery'},{id:'admin-diagnostics',label:'Diagnostics',href:base+'/diagnostics'}];
  const activeId = tabs.find(tab=>tab.href===pathname)?.id??'admin-personnel';

  const [leadTimeEnforcementEnabled, setLeadTimeEnforcementEnabled] = useState(true);
  const [leadTimeDays, setLeadTimeDays] = useState(2);
  const [maxAttachmentsPerTicket, setMaxAttachmentsPerTicket] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [archived,setArchived]=useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function loadConfig() {
      setLoading(true);
      setError(null);
      try {
        const [response,context]=await Promise.all([apiClient.getProjectRequestConfig(projectId),apiRequest<{project:{status:string}}>(`/api/projects/${projectId}/template`)]);
        if (!active) return;
        setArchived(context.project.status==='ARCHIVED');
        setLeadTimeEnforcementEnabled(response.config.leadTimeEnforcementEnabled);
        setLeadTimeDays(response.config.leadTimeDays);
        setMaxAttachmentsPerTicket(response.config.maxAttachmentsPerTicket);
      } catch (err) {
        if (!active) return;
        setError(getErrorMessage(err, 'Unable to load project request configuration.'));
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadConfig();
    return () => {
      active = false;
    };
  }, [projectId]);

  async function saveConfig() {
    if(loading||saving||archived)return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await apiClient.updateProjectRequestConfig(projectId, {
        leadTimeEnforcementEnabled,
        leadTimeDays,
        maxAttachmentsPerTicket,
      });
      setLeadTimeEnforcementEnabled(response.config.leadTimeEnforcementEnabled);
      setLeadTimeDays(response.config.leadTimeDays);
      setMaxAttachmentsPerTicket(response.config.maxAttachmentsPerTicket);
      setSuccess('Project request configuration updated.');
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to update project request configuration.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdministrationWorkspace title="Project Administration" description="Manage this project's personnel, companies, settings and recovery. Operational roles and independent administration remain separate." sections={tabs} activeId={activeId}>
      <ProjectAdministration key={projectId} projectId={projectId}/>
      {<AdministrationArea id="admin-request-policy"><Card
        title="Project Request Configuration"
        description="Manage per-project requester submission and attachment policy."
      >
        <div className="stack">
          {error ? <ErrorBanner message={error} /> : null}
          {success ? <SuccessBanner message={success} /> : null}
          {loading ? <p className="muted">Loading project configuration...</p> : null}
          {!loading ? (
            <>
              {archived?<p className="muted">Archived project — request configuration is read-only.</p>:null}
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={leadTimeEnforcementEnabled}
                  disabled={saving||archived}
                  onChange={(event) => setLeadTimeEnforcementEnabled(event.target.checked)}
                />
                <span>Enable lead-time enforcement for requester submit</span>
              </label>
              <Field label="Lead-Time Days">
                <Input
                  disabled={saving||archived}
                  type="number"
                  min={1}
                  max={30}
                  value={String(leadTimeDays)}
                  onChange={(event) => setLeadTimeDays(Number(event.target.value || 0))}
                />
                <span className="muted field-help">When enabled, requested date must be at least this many days from submit time.</span>
              </Field>
              <Field label="Maximum Files per SWR (blank for no count cap)">
                <Input
                  disabled={saving||archived}
                  type="number"
                  min={1}
                  max={100}
                  value={maxAttachmentsPerTicket === null ? '' : String(maxAttachmentsPerTicket)}
                  onChange={(event) => setMaxAttachmentsPerTicket(event.target.value ? Number(event.target.value) : null)}
                />
              </Field>
              <Button disabled={saving||archived} onClick={() => void saveConfig()}>
                {saving ? 'Saving...' : 'Save Configuration'}
              </Button>
            </>
          ) : null}
        </div>
      </Card></AdministrationArea>}
      {archived&&error?<ErrorBanner message={error}/>:null}
      <AdministrationArea id="admin-access-recovery" className="stack"><Card title="Survey Reviewer Handover" description="Resolve supported protected obligations with confirmed replacement coverage."><ProtectedSurveyObligations key={projectId} projectId={projectId}/></Card>
      <SubcontractorAccess projectId={projectId} />
      <DraftRecovery projectId={projectId} /></AdministrationArea>
    </AdministrationWorkspace>
  );
}
