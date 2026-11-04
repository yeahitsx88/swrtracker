'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { apiClient } from '@/lib/apiClient';
import type { OrganizationChoice } from '@/lib/contracts';
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
  const [email, setEmail] = useState(searchParams.get('email') ?? '');
  const [password, setPassword] = useState('');
  const [organizations, setOrganizations] = useState<OrganizationChoice[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function signIn(tenantId?: string) {
    setError(null);
    setLoading(true);
    try {
      const result = await apiClient.login({ email: email.trim(), password, ...(tenantId ? { tenantId } : {}) });
      if ('organizations' in result) {
        setOrganizations(result.organizations);
        return;
      }
      router.push(getSafeReturnPath(searchParams.get('returnTo')));
      router.refresh();
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to sign in at this time.'));
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim() || !password) {
      setError('Email and password are required.');
      return;
    }
    await signIn();
  }

  function startOver() {
    setOrganizations(null);
    setPassword('');
    setError(null);
  }

  if (organizations) {
    return (
      <Card title="Choose Organization" description={`${email.trim()} has an account in more than one organization. Choose where to sign in.`}>
        <div className="stack">
          {error ? <ErrorBanner message={error} /> : null}
          <ul className="stack" aria-label="Organizations" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {organizations.map((organization) => (
              <li key={organization.tenantId}>
                <Button type="button" disabled={loading} onClick={() => void signIn(organization.tenantId)} style={{ width: '100%' }}>
                  {organization.name}
                </Button>
              </li>
            ))}
          </ul>
          <Button type="button" variant="secondary" disabled={loading} onClick={startOver}>
            Use a different account
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card title="Sign In" description="Submit and track survey work requests for your project.">
      <form className="stack" onSubmit={handleSubmit}>
        {error ? <ErrorBanner message={error} /> : null}
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
