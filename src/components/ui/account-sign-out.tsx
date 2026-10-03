'use client';

import { useState } from 'react';
import { apiClient } from '@/lib/apiClient';
import { getErrorMessage } from '@/lib/errors';

/** Both navigation surfaces use the established logout/session contract. */
export function AccountSignOut() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  async function signOut() {
    setBusy(true); setError(undefined);
    try { await apiClient.logout(); window.location.replace('/login'); }
    catch (cause) { setError(getErrorMessage(cause, 'Unable to sign out. Please try again.')); setBusy(false); }
  }
  return <><button type="button" disabled={busy} onClick={() => void signOut()}>{busy ? 'Signing out…' : 'Sign out'}</button>{error && <p role="alert" className="error-banner">{error}</p>}</>;
}
