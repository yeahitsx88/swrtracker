'use client';

import { useEffect, useState } from 'react';
import { apiRequest } from '@/lib/apiClient';

export const INBOX_SEEN_EVENT = 'swr-inbox-seen';

/** Unread notice count for the navigation badge; refreshes on navigation and when the inbox marks notices seen. */
export function useUnreadNotices(projectId: string | undefined, pathname: string): number {
  const [unread, setUnread] = useState(0);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const refresh = () => setTick(value => value + 1);
    window.addEventListener(INBOX_SEEN_EVENT, refresh);
    return () => window.removeEventListener(INBOX_SEEN_EVENT, refresh);
  }, []);
  useEffect(() => {
    if (!projectId) { setUnread(0); return; }
    let active = true;
    apiRequest<{ unread: number }>(`/api/projects/${projectId}/inbox/unread`)
      .then(result => { if (active) setUnread(result.unread); })
      .catch(() => { if (active) setUnread(0); });
    return () => { active = false; };
  }, [projectId, pathname, tick]);
  return unread;
}
