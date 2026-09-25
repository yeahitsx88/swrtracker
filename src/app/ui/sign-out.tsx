'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, errorMessage, jsonBody } from './api';

export function SignOut() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function signOut() {
    setBusy(true); setError('');
    try { await api('/api/auth/logout', jsonBody({})); router.replace('/login'); router.refresh(); }
    catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  }
  return <span><button className="nav-button" disabled={busy} onClick={() => void signOut()}>{busy ? 'Signing out…' : 'Sign out'}</button>
    {error && <span role="alert">{error}</span>}</span>;
}
