'use client';

import Link from 'next/link';
import { useState } from 'react';
import { apiClient } from '@/lib/apiClient';
import { getErrorMessage } from '@/lib/errors';
import { Button, Card, ErrorBanner, Input, SuccessBanner } from '@/components/ui';
import { Field } from '@/components/forms';

export default function ForgotPasswordPage() {
  const [tenantId, setTenantId] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [debugResetToken, setDebugResetToken] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tenantId.trim() || !email.trim()) {
      setError('Tenant ID and email are required.');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);
    setDebugResetToken(null);

    try {
      const response = await apiClient.forgotPassword({
        tenantId: tenantId.trim(),
        email: email.trim().toLowerCase(),
      });
      setSuccess('If an eligible account exists, a reset link has been generated.');
      setDebugResetToken(response.debugResetToken ?? null);
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to process password reset request right now.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card
      title="Forgot Password"
      description="Enter your tenant ID and account email to request a password reset."
    >
      <form className="stack" onSubmit={handleSubmit}>
        {error ? <ErrorBanner message={error} /> : null}
        {success ? <SuccessBanner message={success} /> : null}
        <Field label="Tenant ID">
          <Input value={tenantId} onChange={(event) => setTenantId(event.target.value)} required />
        </Field>
        <Field label="Email">
          <Input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
          />
        </Field>
        <Button type="submit" disabled={loading}>
          {loading ? 'Submitting...' : 'Request Reset'}
        </Button>
      </form>

      {debugResetToken ? (
        <p className="muted" style={{ marginTop: '0.8rem' }}>
          Dev link:{' '}
          <Link className="app-link" href={`/reset-password?token=${encodeURIComponent(debugResetToken)}`}>
            Continue to Reset Password
          </Link>
        </p>
      ) : null}

      <div className="row" style={{ marginTop: '0.8rem' }}>
        <Link href="/login" className="app-link">Back to Login</Link>
      </div>
    </Card>
  );
}
