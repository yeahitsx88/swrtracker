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

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tenantId.trim() || !email.trim()) {
      setError('Tenant ID and email are required.');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      await apiClient.forgotPassword({
        tenantId: tenantId.trim(),
        email: email.trim().toLowerCase(),
      });
      setSuccess('If an eligible account exists, a reset link will be sent to its email address.');
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

      <div className="row" style={{ marginTop: '0.8rem' }}>
        <Link href="/login" className="app-link">Back to Login</Link>
      </div>
    </Card>
  );
}
