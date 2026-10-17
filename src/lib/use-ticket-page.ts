'use client';

import { useEffect, useState } from 'react';
import { apiClient } from './apiClient';
import type { TicketListResponse } from './contracts';
import type { TicketQueryFilters } from '@/modules/ticket/application/query-filters';
import { getErrorMessage } from './errors';

/** A stale response may never replace the current filter/page selection. */
export function useTicketPage(projectId: string, page: number, size: number, filters: TicketQueryFilters, enabled: boolean, revision = 0) {
  const key = JSON.stringify({ projectId, page, size, filters, revision });
  const [snapshot, setSnapshot] = useState<{ key: string; data?: TicketListResponse; error?: string }>();
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const input = JSON.parse(key) as { projectId: string; page: number; size: number; filters: TicketQueryFilters };
    const timer = setTimeout(() => {
      apiClient.listTickets(input.projectId, input.size, (input.page - 1) * input.size, { ...input.filters, sort: 'operations' })
        .then(data => { if (active) setSnapshot({ key, data }); })
        .catch(error => { if (active) setSnapshot({ key, error: getErrorMessage(error, 'Unable to load requests. Refresh to retry.') }); });
    }, input.filters.query ? 250 : 0);
    return () => { active = false; clearTimeout(timer); };
  }, [key, enabled]);
  const current = enabled && snapshot?.key === key ? snapshot : undefined;
  return { data: current?.data, error: current?.error, loading: enabled && !current };
}
