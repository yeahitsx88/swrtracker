'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiClient, apiRequest } from '@/lib/apiClient';
import { ApiClientError, getErrorMessage } from '@/lib/errors';
import {FrozenCommand} from '@/lib/frozen-command';
import {useUnsavedProgress} from '@/lib/use-unsaved-progress';
import type {ProjectRequestConfig} from '@/modules/tenancy/domain/types';
import { Button, Card, ErrorBanner, Input, SuccessBanner } from '@/components/ui';
import { Field } from '@/components/forms';
import { SubcontractorAccess } from './subcontractor-access';
import { DraftRecovery } from './draft-recovery';
import { ProtectedSurveyObligations } from '@/components/ui/protected-survey-obligations';
import {ProjectAdministration} from '@/components/ui/project-administration';
import {AdministrationDialog} from '@/components/ui/administration-dialog';

export default function AdminProjectPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;

  const [leadTimeEnforcementEnabled, setLeadTimeEnforcementEnabled] = useState(true);
  const [leadTimeDays, setLeadTimeDays] = useState(2);
  const [maxAttachmentsPerTicket, setMaxAttachmentsPerTicket] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [archived,setArchived]=useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [configOpen,setConfigOpen]=useState(false);
  const [revision,setRevision]=useState(0);
  const command=useRef(new FrozenCommand<ProjectRequestConfig>());
  const locked=command.current.locked,uncertain=!!command.current.command&&!command.current.stale;
  useUnsavedProgress(locked);
  function closeConfig(){if(command.current.reload()){setConfigOpen(false);setRevision(n=>n+1);}}

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
  }, [projectId,revision]);

  async function saveConfig() {
    if(loading||saving||archived)return;
    const attempt=command.current.begin({leadTimeEnforcementEnabled,leadTimeDays,maxAttachmentsPerTicket},crypto.randomUUID());if(!attempt)return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await apiRequest<{config:ProjectRequestConfig}>(`/api/projects/${projectId}/request-config`,{method:'PATCH',body:attempt.body,headers:{'Idempotency-Key':attempt.key}});
      command.current.success();
      setLeadTimeEnforcementEnabled(response.config.leadTimeEnforcementEnabled);
      setLeadTimeDays(response.config.leadTimeDays);
      setMaxAttachmentsPerTicket(response.config.maxAttachmentsPerTicket ?? null);
      setSuccess('Project request configuration updated.');
    } catch (err) {
      command.current.fail(err instanceof ApiClientError?err.status:undefined);
      setError(getErrorMessage(err, 'Unable to update project request configuration.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="stack">
      <ProjectAdministration key={projectId} projectId={projectId}/>
      {!archived&&<Card
        title="Project Request Configuration"
        description="Manage per-project requester submission and attachment policy."
      >
        <div className="stack">
          <Button disabled={loading||archived} onClick={()=>{setConfigOpen(true);setSuccess(null);}}>Edit request configuration</Button>
          {configOpen&&<AdministrationDialog title="Project request configuration" closeDisabled={saving||uncertain} onClose={closeConfig}>
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
                  disabled={locked||archived}
                  onChange={(event) => setLeadTimeEnforcementEnabled(event.target.checked)}
                />
                <span>Enable lead-time enforcement for requester submit</span>
              </label>
              <Field label="Lead-Time Days">
                <Input
                  disabled={locked||archived}
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
                  disabled={locked||archived}
                  type="number"
                  min={1}
                  max={100}
                  value={maxAttachmentsPerTicket === null ? '' : String(maxAttachmentsPerTicket)}
                  onChange={(event) => setMaxAttachmentsPerTicket(event.target.value ? Number(event.target.value) : null)}
                />
              </Field>
              <Button disabled={saving||archived||command.current.stale} onClick={() => void saveConfig()}>
                {saving ? 'Saving…' : uncertain?'Retry unchanged configuration':'Save configuration'}
              </Button>
              {command.current.stale&&<><p role="alert">State changed. Reload current configuration before editing again.</p><Button variant="secondary" onClick={()=>{if(command.current.reload()){setSuccess(null);setRevision(n=>n+1);}}}>Reload configuration</Button></>}
            </>
          ) : null}
          </AdministrationDialog>}
        </div>
      </Card>}
      {archived&&error?<ErrorBanner message={error}/>:null}
      <Card title="Survey Reviewer handover" description="Resolve supported protected obligations with confirmed replacement coverage."><ProtectedSurveyObligations key={projectId} projectId={projectId} foreground/></Card>
      <SubcontractorAccess projectId={projectId} />
      <DraftRecovery projectId={projectId} />
    </div>
  );
}
