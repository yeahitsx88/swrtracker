'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiClient } from '@/lib/apiClient';
import { Button } from './button';

export function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    setLoading(true);
    try {
      await apiClient.logout();
      router.push('/login');
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button variant="secondary" onClick={() => void handleLogout()} disabled={loading}>
      {loading ? 'Signing Out...' : 'Sign Out'}
    </Button>
  );
}
