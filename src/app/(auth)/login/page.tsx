'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { apiClient } from '@/lib/apiClient';
import { getErrorMessage } from '@/lib/errors';
import { getSafeReturnPath } from '@/lib/safe-return-path';
import { Button, Card, ErrorBanner, Input } from '@/components/ui';
import { Field } from '@/components/forms';

export default function LoginPage() {
  return (
    <Suspense fallback={<div>Loading login form...</div>}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tenantId, setTenantId] = useState(searchParams.get('tenantId') ?? '');
  const [email, setEmail] = useState(searchParams.get('email') ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tenantId.trim() || !email.trim() || !password) {
      setError('Tenant ID, email, and password are required.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await apiClient.login({ tenantId: tenantId.trim(), email: email.trim(), password });
      const returnTo = getSafeReturnPath(searchParams.get('returnTo'));
      router.push(returnTo);
      router.refresh();
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to sign in at this time.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card title="Sign In" description="Submit and track survey work requests for your project.">
      <form className="stack" onSubmit={handleSubmit}>
        {error ? <ErrorBanner message={error} /> : null}
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
        <Field label="Password">
          <Input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
        </Field>
        <Button type="submit" disabled={loading}>
          {loading ? 'Signing In...' : 'Sign In'}
        </Button>
      </form>
      <div className="auth-links">
        <Link href="/forgot-password" className="text-link">Forgot Password</Link>
        <Link href="/register" className="text-link">Create Account</Link>
      </div>
    </Card>
  );
}
