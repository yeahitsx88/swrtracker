'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, ApiError, errorMessage, jsonBody } from '@/app/ui/api';
import { Shell } from '@/app/ui/shell';

interface Invitation {
  tenantId: string; projectId: string; email: string; role: string;
  status: 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'CANCELED' | 'UNBOUND'; expiresAt: string;
}
const unavailable = {
  ACCEPTED: 'This invitation has already been accepted. Sign in with your work account.',
  EXPIRED: 'This invitation has expired. Ask your administrator for a new invitation.',
  CANCELED: 'This invitation was canceled. Contact your administrator for access.',
  UNBOUND: 'This invitation needs to be replaced. Ask your administrator for a new invitation.',
};

export function InviteForm({ token }: { token: string | null }) {
  const [invite, setInvite] = useState<Invitation | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [accepted, setAccepted] = useState(false);
  const inFlight = useRef(false);
  useEffect(() => {
    if (!token) return;
    let current = true; setError(''); setInvite(null);
    api<{ invite: Invitation; signedIn: boolean }>(`/api/invites?token=${token}`)
      .then(result => { if (current) { setInvite(result.invite); setSignedIn(result.signedIn); setSessionExpired(false); } })
      .catch(cause => { if (current) { setError(errorMessage(cause)); setSessionExpired(cause instanceof ApiError && cause.status === 401); } });
    return () => { current = false; };
  }, [token, revision]);

  const destination = invite?.role === 'REQUESTER' ? `/project/${invite.projectId}/request` : '/';
  const login = invite ? `/login?tenantId=${invite.tenantId}&next=${encodeURIComponent(accepted || invite.status === 'ACCEPTED'
    ? destination : `/invites/accept?token=${token}`)}` : '/login';

  async function accept(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    const data = new FormData(event.currentTarget);
    inFlight.current = true; setBusy(true); setError('');
    try {
      await api('/api/invites', { ...jsonBody({ token,
        ...(!signedIn ? { name: data.get('name'), password: data.get('password') } : {}),
      }), method: 'PUT' });
      setAccepted(true);
    } catch (cause) { setError(errorMessage(cause)); }
    finally { inFlight.current = false; setBusy(false); }
  }

  async function switchAccount() {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError('');
    try { await api('/api/auth/logout', jsonBody({})); setRevision(value => value + 1); }
    catch (cause) { setError(errorMessage(cause)); }
    finally { inFlight.current = false; setBusy(false); }
  }

  return <Shell><div className="narrow"><p className="eyebrow">Project invitation</p><h1>{accepted ? 'Invitation accepted' : 'Join your project'}</h1>
    {!token ? <p className="notice error" role="alert">This invitation link is incomplete or invalid. Open the full link from your invitation email.</p> : <>
      {error && <p className="notice error" role="alert">{error}</p>}
      {sessionExpired && <button disabled={busy} onClick={() => void switchAccount()}>Clear expired session</button>}
      {!invite && !error && <p role="status">Checking invitation…</p>}
      {accepted ? <section className="panel" role="status"><p>Your project access is ready.</p>
        {signedIn ? <Link className="button" href={destination}>Continue</Link> : <Link className="button" href={login}>Sign in to continue</Link>}
      </section> : invite && <>
        <p className="description">This invitation is for <strong>{invite.email}</strong>.</p>
        {invite.status !== 'PENDING' ? <section className="notice"><p>{unavailable[invite.status]}</p>
          {invite.status === 'ACCEPTED' && <Link href={login}>Sign in</Link>}</section> : <form className="panel" onSubmit={accept}>
          <p className="muted">Accept before {new Date(invite.expiresAt).toLocaleString()}.</p>
          {!signedIn && <>
            <h2>Create your account</h2>
            <label className="field">Your name<input name="name" required maxLength={200} autoComplete="name" /></label>
            <label className="field">Password<input name="password" type="password" required minLength={8} maxLength={72} autoComplete="new-password" />
              <small>Use at least 8 characters. Maximum 72 bytes.</small></label>
          </>}
          {signedIn && <p>Accept using your signed-in account. Its email and company must match this invitation.</p>}
          <button disabled={busy} type="submit">{busy ? 'Accepting…' : signedIn ? 'Accept invitation' : 'Create account and accept'}</button>
          <div className="actions">{signedIn
            ? <button className="nav-button" type="button" disabled={busy} onClick={() => void switchAccount()}>Use another account</button>
            : <Link href={login}>Already have an account? Sign in</Link>}</div>
        </form>}
      </>}
    </>}
  </div></Shell>;
}
