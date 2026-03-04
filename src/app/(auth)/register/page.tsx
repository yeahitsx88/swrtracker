'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { apiClient } from '@/lib/apiClient';
import { ApiClientError } from '@/lib/errors';
import { Button, Card, ErrorBanner, Input, SuccessBanner } from '@/components/ui';
import { Field } from '@/components/forms';

export default function RegisterPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tenantId, setTenantId] = useState(searchParams.get('tenantId') ?? '');
  const [companyId, setCompanyId] = useState(searchParams.get('companyId') ?? '');
  const [name, setName] = useState('');
  const [email, setEmail] = useState(searchParams.get('email') ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      await apiClient.register({ tenantId, companyId, name, email, password });
      setSuccess('Registration complete. Sign in with your new credentials.');
      router.push(`/login?tenantId=${encodeURIComponent(tenantId)}&email=${encodeURIComponent(email)}`);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('Unable to register right now.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card title="Create Account" description="Use your tenant and company IDs to register your requester account.">
      <form className="stack" onSubmit={handleSubmit}>
        {error ? <ErrorBanner message={error} /> : null}
        {success ? <SuccessBanner message={success} /> : null}
        <Field label="Tenant ID">
          <Input value={tenantId} onChange={(event) => setTenantId(event.target.value)} required />
        </Field>
        <Field label="Company ID">
          <Input value={companyId} onChange={(event) => setCompanyId(event.target.value)} required />
        </Field>
        <Field label="Full Name">
          <Input value={name} onChange={(event) => setName(event.target.value)} required />
        </Field>
        <Field label="Email">
          <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
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
