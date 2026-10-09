'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { apiRequest, createIdempotencyKey } from '@/lib/apiClient';
import { getErrorMessage } from '@/lib/errors';
import { Button } from './button';
import { ErrorBanner, SuccessBanner } from './feedback';

/** Your own name and password. The server re-checks your session for each change. */
export function AccountSelfService({ name, onNameChanged }: { name: string; onNameChanged: (name: string) => void }) {
  return <div className="settings-list">
    <NameForm name={name} onNameChanged={onNameChanged} />
    <PasswordForm />
  </div>;
}

function NameForm({ name, onNameChanged }: { name: string; onNameChanged: (name: string) => void }) {
  const [value, setValue] = useState(name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(undefined); setSuccess(undefined);
    try {
      const result = await apiRequest<{ name: string; changed: boolean }>('/api/account', { method: 'PATCH', body: { name: value }, headers: { 'Idempotency-Key': createIdempotencyKey() } });
      setValue(result.name);
      onNameChanged(result.name);
      setSuccess(result.changed ? 'Your name is updated.' : 'No change: that is already your name.');
    } catch (cause) { setError(getErrorMessage(cause, 'Unable to update your name. Try again.')); }
    finally { setBusy(false); }
  }
  return <form className="settings-item" onSubmit={submit} aria-labelledby="profile-name-heading">
    <div><h3 id="profile-name-heading">Name</h3><p className="muted">How your name appears on requests, history and team lists.</p></div>
    <div className="stack form-narrow">
      {error ? <ErrorBanner message={error} /> : null}
      {success ? <SuccessBanner message={success} /> : null}
      <label className="field"><span className="field-label">Display name</span>
        <input className="input" value={value} maxLength={120} autoComplete="name" onChange={event => setValue(event.target.value)} required /></label>
      <Button type="submit" disabled={busy || !value.trim() || value.trim() === name}>{busy ? 'Saving…' : 'Save name'}</Button>
    </div>
  </form>;
}

function PasswordForm() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();
  const mismatch = confirm.length > 0 && next !== confirm;
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || mismatch) return;
    setBusy(true); setError(undefined); setSuccess(undefined);
    try {
      await apiRequest('/api/account/password', { method: 'POST', body: { currentPassword: current, newPassword: next } });
      setCurrent(''); setNext(''); setConfirm('');
      setSuccess('Password changed. You stay signed in here; other devices and browsers have been signed out.');
    } catch (cause) { setError(getErrorMessage(cause, 'Unable to change your password. Try again.')); }
    finally { setBusy(false); }
  }
  return <form className="settings-item" onSubmit={submit} aria-labelledby="profile-password-heading">
    <div><h3 id="profile-password-heading">Password</h3><p className="muted">Changing your password signs you out everywhere else.</p></div>
    <div className="stack form-narrow">
      {error ? <ErrorBanner message={error} /> : null}
      {success ? <SuccessBanner message={success} /> : null}
      <label className="field"><span className="field-label">Current password</span>
        <input className="input" type="password" value={current} autoComplete="current-password" onChange={event => setCurrent(event.target.value)} required /></label>
      <label className="field"><span className="field-label">New password</span>
        <input className="input" type="password" value={next} minLength={8} autoComplete="new-password" aria-describedby="password-rule" onChange={event => setNext(event.target.value)} required />
        <span id="password-rule" className="muted field-help">At least 8 characters. A longer passphrase is stronger.</span></label>
      <label className="field"><span className="field-label">Confirm new password</span>
        <input className="input" type="password" value={confirm} autoComplete="new-password" aria-invalid={mismatch} onChange={event => setConfirm(event.target.value)} required />
        {mismatch ? <span className="field-help" role="alert" style={{ color: 'var(--danger)' }}>The new passwords do not match.</span> : null}</label>
      <div className="row">
        <Button type="submit" disabled={busy || !current || next.length < 8 || mismatch || !confirm}>{busy ? 'Changing…' : 'Change password'}</Button>
        <Link className="text-link" href="/forgot-password">Forgot your current password?</Link>
      </div>
    </div>
  </form>;
}
