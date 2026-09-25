'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/lib/apiClient';
import type { ProjectCompanyAccessResponse } from '@/lib/contracts/projects';
import { getErrorMessage } from '@/lib/errors';
import { Button, Card, ErrorBanner, Input, Select, SuccessBanner } from '@/components/ui';
import { Field } from '@/components/forms';

export function SubcontractorAccess({ projectId }: { projectId: string }) {
  const [overview, setOverview] = useState<ProjectCompanyAccessResponse | null>(null);
  const [companyId, setCompanyId] = useState('');
  const [email, setEmail] = useState('');
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const next = await apiClient.getProjectCompanyAccess(projectId);
      setOverview(next);
      setCompanyId((current) => current || next.companies[0]?.id || '');
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to load subcontractor access.'));
    }
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  async function invite() {
    setBusy('invite');
    setError(null);
    setSuccess(null);
    setInviteUrl(null);
    try {
      const response = await apiClient.createRequesterInvite(projectId, { companyId, email });
      setInviteUrl(`${window.location.origin}/invite/${response.inviteToken}`);
      setEmail('');
      setSuccess('Requester invitation created. Share the registration link with the intended recipient.');
      await load();
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to create requester invitation.'));
    } finally {
      setBusy(null);
    }
  }

  async function setAuthority(userId: string, grantId: string | null) {
    setBusy(userId);
    setError(null);
    setSuccess(null);
    try {
      if (grantId) {
        await apiClient.revokeCompanyAuthority(projectId, grantId);
        setSuccess('Company authority revoked.');
      } else {
        await apiClient.grantCompanyAuthority(projectId, userId);
        setSuccess('Company authority granted.');
      }
      await load();
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to update company authority.'));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card
      title="Subcontractor Access"
      description="Invite subcontractor requesters and designate who may view all requests from their company on this project."
    >
      <div className="stack">
        {error ? <ErrorBanner message={error} /> : null}
        {success ? <SuccessBanner message={success} /> : null}
        {!overview ? <p className="muted">Loading subcontractor access...</p> : null}
        {overview ? (
          <>
            <Field label="Subcontractor Company">
              <Select value={companyId} onChange={(event) => setCompanyId(event.target.value)}>
                {overview.companies.map((company) => (
                  <option key={company.id} value={company.id}>{company.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Requester Email">
              <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
            </Field>
            <Button disabled={busy !== null || !companyId || !email.trim()} onClick={() => void invite()}>
              {busy === 'invite' ? 'Creating...' : 'Create Invitation'}
            </Button>
            {inviteUrl ? (
              <Field label="Registration Link (shown for this new invitation)">
                <Input readOnly value={inviteUrl} onFocus={(event) => event.currentTarget.select()} />
              </Field>
            ) : null}

            <h3>Subcontractor Requesters</h3>
            {overview.requesters.length === 0 ? <p className="muted">No subcontractor requesters have joined this project.</p> : null}
            {overview.requesters.map((requester) => (
              <div className="row" key={requester.userId} style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <strong>{requester.name}</strong>
                  <div className="muted">{requester.email} · {requester.companyName}</div>
                </div>
                <Button
                  disabled={busy !== null}
                  onClick={() => void setAuthority(requester.userId, requester.authorityGrantId)}
                >
                  {busy === requester.userId
                    ? 'Updating...'
                    : requester.authorityGrantId ? 'Revoke Company View' : 'Grant Company View'}
                </Button>
              </div>
            ))}

            <h3>Pending Invitations</h3>
            {overview.pendingInvites.length === 0 ? <p className="muted">No active invitations.</p> : null}
            {overview.pendingInvites.map((inviteRecord) => (
              <div key={inviteRecord.id}>
                <strong>{inviteRecord.email}</strong>
                <div className="muted">
                  {inviteRecord.companyName} · expires {new Date(inviteRecord.expiresAt).toLocaleDateString()}
                </div>
              </div>
            ))}
          </>
        ) : null}
      </div>
    </Card>
  );
}
