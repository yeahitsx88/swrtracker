'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/lib/apiClient';
import type { ProjectCompanyAccessResponse } from '@/lib/contracts/projects';
import { getErrorMessage } from '@/lib/errors';
import { Button, Card, ErrorBanner, SuccessBanner } from '@/components/ui';

export function SubcontractorAccess({ projectId }: { projectId: string }) {
  const [overview, setOverview] = useState<ProjectCompanyAccessResponse | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const next = await apiClient.getProjectCompanyAccess(projectId);
      setOverview(next);
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to load subcontractor access.'));
    }
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

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
      description="Manage company-wide request visibility for subcontractor requesters. Create invitations in Invite a new requester above."
    >
      <div className="stack">
        {error ? <ErrorBanner message={error} /> : null}
        {success ? <SuccessBanner message={success} /> : null}
        {!overview ? <p className="muted">Loading subcontractor access...</p> : null}
        {overview ? (
          <>
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
