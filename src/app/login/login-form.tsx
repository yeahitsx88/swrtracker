'use client';

import { useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { api, errorMessage, jsonBody } from '../ui/api';
import { Shell } from '../ui/shell';

export function LoginForm({ tenantId, next }: { tenantId: string; next: string }) {
  const router = useRouter();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError('');
    const data = new FormData(event.currentTarget);
    try {
      await api('/api/auth/login', jsonBody({
        tenantId: data.get('tenantId'), email: data.get('email'), password: data.get('password'),
      }));
      router.replace(next); router.refresh();
    } catch (cause) { setError(errorMessage(cause)); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <Shell><div className="narrow"><p className="eyebrow">Welcome back</p><h1>Sign in</h1>
    <p className="muted">Use your work account to access your survey requests.</p>
    <form className="panel" onSubmit={login}>
      <label className="field">Organization ID<input name="tenantId" defaultValue={tenantId} required
        pattern="[a-fA-F0-9\-]{36}" autoComplete="off" spellCheck={false} />
        <small>Provided in your project link or by your administrator.</small></label>
      <label className="field">Work email<input name="email" type="email" required autoComplete="username" /></label>
      <label className="field">Password<input name="password" type="password" required autoComplete="current-password" /></label>
      {error && <p className="notice error" role="alert">{error}</p>}
      <button disabled={busy} type="submit">{busy ? 'Signing in…' : 'Sign in'}</button>
    </form></div></Shell>;
}
