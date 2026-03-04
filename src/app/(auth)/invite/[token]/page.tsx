'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/apiClient';
import { ApiClientError } from '@/lib/errors';
import type { InviteValidationResponse } from '@/lib/contracts';
import { Card, ErrorBanner } from '@/components/ui';

export default function InvitePage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [invite, setInvite] = useState<InviteValidationResponse['invite'] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function loadInvite() {
      try {
        const result = await apiClient.validateInvite(token);
        if (active) {
          setInvite(result.invite);
        }
      } catch (err) {
        if (!active) return;
        if (err instanceof ApiClientError) {
          setError(err.message);
        } else {
          setError('Unable to validate invite token.');
        }
      }
    }
    void loadInvite();
    return () => {
      active = false;
    };
  }, [token]);

  return (
    <Card title="Invite Validation" description="Review invite details before account registration.">
      {error ? <ErrorBanner message={error} /> : null}
      {invite ? (
        <div className="stack">
          <p className="muted">Email: {invite.email}</p>
          <p className="muted">Role: {invite.role}</p>
          <p className="muted">Tenant: {invite.tenantId}</p>
          <p className="muted">Project: {invite.projectId}</p>
          <p className="muted">Expires: {new Date(invite.expiresAt).toLocaleString()}</p>
          <Link
            className="app-link"
            href={`/register?tenantId=${encodeURIComponent(invite.tenantId)}&email=${encodeURIComponent(invite.email)}`}
          >
            Continue to Registration
          </Link>
        </div>
      ) : (
        <p className="muted">Checking invite token...</p>
      )}
      <div className="row" style={{ marginTop: '0.8rem' }}>
        <Link href="/login" className="app-link">Back to Login</Link>
      </div>
    </Card>
  );
}
