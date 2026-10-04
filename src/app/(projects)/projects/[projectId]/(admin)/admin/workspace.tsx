'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useParams, usePathname } from 'next/navigation';
import { apiClient, apiRequest } from '@/lib/apiClient';
import { ApiClientError, getErrorMessage } from '@/lib/errors';
import { Button, Card, ErrorBanner, Input, SuccessBanner } from '@/components/ui';
import { Field } from '@/components/forms';
import { SubcontractorAccess } from './subcontractor-access';
import { DraftRecovery } from './draft-recovery';
import { ProtectedSurveyObligations } from '@/components/ui/protected-survey-obligations';
import {AdministrationArea,AdministrationWorkspace} from '@/components/ui/administration-workspace';
import {CommandOwner,FrozenCommand} from '@/lib/frozen-command';
import {useAdministrationProgress} from '@/lib/use-administration-progress';
import type {ProjectRequestConfig,ProjectRequestConfigResponse} from '@/lib/contracts/projects';
import {ProjectAdministration} from '@/components/ui/project-administration';
import {HelpDesk} from '@/components/ui/help-desk';
import {MemberAccessRecovery} from '@/components/ui/member-access-recovery';

export function AdminProjectWorkspace() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const owner=useRef(new CommandOwner()).current;
  const ownerToken=useSyncExternalStore(owner.subscribe,owner.snapshot,owner.snapshot);
  const policyToken='request-policy',policy=useRef(new FrozenCommand<ProjectRequestConfig>()).current;
  const [,renderPolicy]=useState(0);
  const pathname = usePathname();
  const base = `/projects/${projectId}/admin`;
  useAdministrationProgress(owner,base);
  const policyBlocked=owner.blocked(policyToken),policyLocked=policy.locked||policyBlocked;
  void ownerToken;
  const tabs = [{id:'admin-personnel',label:'Personnel',href:base},{id:'admin-help-desk',label:'Help Desk',href:base+'/help-desk'},{id:'admin-companies',label:'Companies',href:base+'/companies'},{id:'admin-settings',label:'Project Settings',href:base+'/settings'},{id:'admin-access-recovery',label:'Access and Recovery',href:base+'/access-recovery'},{id:'admin-diagnostics',label:'Diagnostics',href:base+'/diagnostics'}];
  const activeId = pathname===base+'/administrators'?'admin-help-desk':pathname===base+'/request-policy'?'admin-settings':tabs.find(tab=>tab.href===pathname)?.id??'admin-personnel';

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
    if(loading||saving||archived||!owner.claim(policyToken))return;
    const command=policy.begin({leadTimeEnforcementEnabled,leadTimeDays,maxAttachmentsPerTicket},crypto.randomUUID());
    if(!command){if(!policy.locked)owner.release(policyToken);return;}
    setSaving(true);setError(null);setSuccess(null);renderPolicy(n=>n+1);
    try {
      const response=await apiRequest<ProjectRequestConfigResponse>(`/api/projects/${projectId}/request-config`,{method:'PATCH',body:command.body,headers:{'Idempotency-Key':command.key}});
      policy.success();owner.release(policyToken);
      setLeadTimeEnforcementEnabled(response.config.leadTimeEnforcementEnabled);setLeadTimeDays(response.config.leadTimeDays);setMaxAttachmentsPerTicket(response.config.maxAttachmentsPerTicket);
      setSuccess('Project request configuration updated.');
    }catch(err){policy.fail(err instanceof ApiClientError?err.status:undefined);if(!policy.locked)owner.release(policyToken);setError(getErrorMessage(err,'Outcome uncertain. Retry the unchanged configuration.'));}
    finally{setSaving(false);renderPolicy(n=>n+1);}
  }

  return (
    <AdministrationWorkspace title="Project Administration" description="Manage this project's personnel, companies, settings and recovery. Operational roles and independent administration remain separate." sections={tabs} activeId={activeId}>
      <AdministrationArea id="admin-help-desk"><HelpDesk projectId={projectId} owner={owner}/></AdministrationArea>
      <ProjectAdministration key={projectId} projectId={projectId} owner={owner}/>
      {<AdministrationArea id="admin-settings"><Card
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
                  disabled={policyLocked||saving||archived}
                  onChange={(event) => setLeadTimeEnforcementEnabled(event.target.checked)}
                />
                <span>Enable lead-time enforcement for requester submit</span>
              </label>
              <Field label="Lead-Time Days">
                <Input
                  disabled={policyLocked||saving||archived}
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
                  disabled={policyLocked||saving||archived}
                  type="number"
                  min={1}
                  max={100}
                  value={maxAttachmentsPerTicket === null ? '' : String(maxAttachmentsPerTicket)}
                  onChange={(event) => setMaxAttachmentsPerTicket(event.target.value ? Number(event.target.value) : null)}
                />
              </Field>
              <Button disabled={policyBlocked||saving||archived||policy.stale} onClick={() => void saveConfig()}>
                {saving ? 'Saving...' : policy.command?'Retry Unchanged Configuration':'Save Configuration'}
              </Button>
              {policy.stale&&<><p role="alert">Configuration changed. Reload before confirming again.</p><Button variant="secondary" disabled={policyBlocked||saving} onClick={()=>{if(policy.reload()){owner.release(policyToken);setError(null);setSuccess(null);void apiClient.getProjectRequestConfig(projectId).then(r=>{setLeadTimeEnforcementEnabled(r.config.leadTimeEnforcementEnabled);setLeadTimeDays(r.config.leadTimeDays);setMaxAttachmentsPerTicket(r.config.maxAttachmentsPerTicket);}).catch(e=>setError(getErrorMessage(e,'Unable to reload configuration.')));}}}>Reload Configuration</Button></>}
            </>
          ) : null}
        </div>
      </Card></AdministrationArea>}
      {archived&&error?<ErrorBanner message={error}/>:null}
      <AdministrationArea id="admin-access-recovery" className="stack"><Card title="Transfer Area Review Responsibility" description="Before removing or changing a Superintendent, transfer their Area review responsibility to a replacement. This keeps unfinished requests covered; it does not transfer crew membership or remove access."><ProtectedSurveyObligations key={projectId} projectId={projectId} owner={owner}/></Card>
      <DraftRecovery projectId={projectId} owner={owner} /></AdministrationArea>
      <AdministrationArea id="admin-access-recovery"><MemberAccessRecovery projectId={projectId} owner={owner} readOnly={loading||archived}/></AdministrationArea>
      <AdministrationArea id="admin-companies"><SubcontractorAccess projectId={projectId} owner={owner}/></AdministrationArea>
    </AdministrationWorkspace>
  );
}
