'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { apiClient } from '@/lib/apiClient';
import { getErrorMessage } from '@/lib/errors';
import { Button, Card, ErrorBanner, Input, SuccessBanner } from '@/components/ui';
import { Field } from '@/components/forms';

export default function RegisterPage() {
  return (
    <Suspense fallback={<div>Loading registration form...</div>}>
      <RegisterForm />
    </Suspense>
  );
}

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get('inviteToken');
  const [tenantId, setTenantId] = useState(searchParams.get('tenantId') ?? '');
  const [name, setName] = useState('');
  const [email, setEmail] = useState(searchParams.get('email') ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const tenantLocked = Boolean(inviteToken && tenantId);
  const emailLocked = Boolean(inviteToken && email);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tenantId.trim() || !name.trim() || !email.trim() || !password || !inviteToken?.trim()) {
      setError('All registration fields are required.');
      return;
    }
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      await apiClient.register({
        tenantId: tenantId.trim(),
        name: name.trim(),
        email: email.trim(),
        password,
        inviteToken: inviteToken.trim(),
      });
      setSuccess('Registration complete. Sign in with your new credentials.');
      router.push(`/login?tenantId=${encodeURIComponent(tenantId.trim())}&email=${encodeURIComponent(email.trim())}`);
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to register right now.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card title="Create Account" description="Register using a project invitation. The invitation determines your company and project access.">
      <form className="stack" onSubmit={handleSubmit}>
        {error ? <ErrorBanner message={error} /> : null}
        {success ? <SuccessBanner message={success} /> : null}
        {inviteToken ? <p className="muted">Your invitation determines company and project access.</p> : <p className="muted">Ask your project administrator for an invitation link.</p>}
        <Field label="Tenant ID">
          <Input
            value={tenantId}
            onChange={(event) => setTenantId(event.target.value)}
            readOnly={tenantLocked}
            required
          />
        </Field>
        <Field label="Full Name">
          <Input value={name} onChange={(event) => setName(event.target.value)} required />
        </Field>
        <Field label="Email">
          <Input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            readOnly={emailLocked}
            required
          />
        </Field>
        <Field label="Password">
          <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        </Field>
        <Button type="submit" disabled={loading}>
          {loading ? 'Creating Account...' : 'Create Account'}
        </Button>
      </form>
      <div className="row" style={{ marginTop: '0.8rem' }}>
        <Link href="/login" className="app-link">Back to Login</Link>
      </div>
    </Card>
  );
}
