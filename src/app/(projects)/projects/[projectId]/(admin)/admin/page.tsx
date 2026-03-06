'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiClient } from '@/lib/apiClient';
import { getErrorMessage } from '@/lib/errors';
import { Button, Card, ErrorBanner, Input, SuccessBanner } from '@/components/ui';
import { Field } from '@/components/forms';

export default function AdminProjectPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;

  const [leadTimeEnforcementEnabled, setLeadTimeEnforcementEnabled] = useState(true);
  const [leadTimeDays, setLeadTimeDays] = useState(2);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function loadConfig() {
      setLoading(true);
      setError(null);
      try {
        const response = await apiClient.getProjectRequestConfig(projectId);
        if (!active) return;
        setLeadTimeEnforcementEnabled(response.config.leadTimeEnforcementEnabled);
        setLeadTimeDays(response.config.leadTimeDays);
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
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await apiClient.updateProjectRequestConfig(projectId, {
        leadTimeEnforcementEnabled,
        leadTimeDays,
      });
      setLeadTimeEnforcementEnabled(response.config.leadTimeEnforcementEnabled);
      setLeadTimeDays(response.config.leadTimeDays);
      setSuccess('Project request configuration updated.');
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to update project request configuration.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card
      title="Project Request Configuration"
      description="Manage per-project lead-time policy for requester submissions."
    >
      <div className="stack">
        {error ? <ErrorBanner message={error} /> : null}
        {success ? <SuccessBanner message={success} /> : null}
        {loading ? <p className="muted">Loading project configuration...</p> : null}
        {!loading ? (
          <>
            <label className="row" style={{ alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="checkbox"
                checked={leadTimeEnforcementEnabled}
                onChange={(event) => setLeadTimeEnforcementEnabled(event.target.checked)}
              />
              <span>Enable lead-time enforcement for requester submit</span>
            </label>
            <Field label="Lead-Time Days">
              <Input
                type="number"
                min={1}
                max={30}
                value={String(leadTimeDays)}
                onChange={(event) => setLeadTimeDays(Number(event.target.value || 0))}
              />
            </Field>
            <p className="muted">When enabled, requested date must be at least this many days from submit time.</p>
            <Button disabled={saving} onClick={() => void saveConfig()}>
              {saving ? 'Saving...' : 'Save Configuration'}
            </Button>
          </>
        ) : null}
      </div>
    </Card>
  );
}
