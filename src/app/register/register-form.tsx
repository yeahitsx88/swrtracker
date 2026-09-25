'use client';

import Link from 'next/link';
import { useRef, useState, type FormEvent } from 'react';
import { api, errorMessage, jsonBody } from '@/app/ui/api';
import { Shell } from '@/app/ui/shell';

export function RegisterForm({ tenantId, projectId }: { tenantId: string; projectId: string }) {
  const [organizationId, setOrganizationId] = useState(tenantId);
  const [created, setCreated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const login = `/login?tenantId=${encodeURIComponent(organizationId)}&next=${encodeURIComponent(`/project/${projectId}/request`)}`;
  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    const data = new FormData(event.currentTarget);
    inFlight.current = true; setBusy(true); setError('');
    try {
      await api('/api/auth/register', jsonBody({ tenantId: organizationId, projectId,
        name: data.get('name'), email: data.get('email'), password: data.get('password') }));
      setCreated(true);
    } catch (cause) { setError(errorMessage(cause)); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <Shell><div className="narrow"><p className="eyebrow">Project access</p><h1>{created ? 'Account created' : 'Create your account'}</h1>
    {created ? <section className="panel" role="status"><p>Your account is ready to submit requests for this project.</p><Link className="button" href={login}>Sign in to continue</Link></section> : <>
      <p className="muted">Use your work email. Your organization’s approved email domain determines your company. If your domain is not approved, ask your administrator for an invitation.</p>
      <form className="panel" onSubmit={register}><fieldset disabled={busy} style={{ border: 0, margin: 0, padding: 0 }}>
        <label className="field">Organization ID<input required pattern="[a-fA-F0-9\-]{36}" autoComplete="off" spellCheck={false}
          value={organizationId} onChange={event => setOrganizationId(event.target.value)} />
          <small>Provided in your project link or by your administrator.</small></label>
        <label className="field">Your name<input name="name" required maxLength={200} autoComplete="name" /></label>
        <label className="field">Work email<input name="email" type="email" required maxLength={254} autoComplete="username" /></label>
        <label className="field">Password<input name="password" type="password" required minLength={8} maxLength={72} autoComplete="new-password" />
          <small>Use at least 8 characters. Maximum 72 bytes.</small></label>
        {error && <p className="notice error" role="alert">{error}</p>}
        <button type="submit">{busy ? 'Creating account…' : 'Create account'}</button>
        <p style={{ marginTop: 20, marginBottom: 0 }}><Link href={login}>Already registered? Sign in</Link></p>
      </fieldset></form>
    </>}
  </div></Shell>;
}
