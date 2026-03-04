'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { apiClient } from '@/lib/apiClient';
import { getErrorMessage } from '@/lib/errors';
import { Button, Card, ErrorBanner, Input, SuccessBanner } from '@/components/ui';
import { Field } from '@/components/forms';

export default function ResetPasswordPage() {
  const searchParams = useSearchParams();
  const [token, setToken] = useState(searchParams.get('token') ?? '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token.trim() || !newPassword || !confirmPassword) {
      setError('Reset token, new password, and confirmation are required.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Password confirmation does not match.');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      await apiClient.resetPassword({
        token: token.trim(),
        newPassword,
      });
      setSuccess('Password reset complete. You can now sign in with your new password.');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to reset password right now.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card title="Reset Password" description="Enter your reset token and choose a new password.">
      <form className="stack" onSubmit={handleSubmit}>
        {error ? <ErrorBanner message={error} /> : null}
        {success ? <SuccessBanner message={success} /> : null}
        <Field label="Reset Token">
          <Input value={token} onChange={(event) => setToken(event.target.value)} required />
        </Field>
        <Field label="New Password">
          <Input
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
          />
        </Field>
        <Field label="Confirm Password">
          <Input
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
          />
        </Field>
        <Button type="submit" disabled={loading}>
          {loading ? 'Resetting...' : 'Reset Password'}
        </Button>
      </form>
      <div className="row" style={{ marginTop: '0.8rem' }}>
        <Link href="/login" className="app-link">Back to Login</Link>
      </div>
    </Card>
  );
}
