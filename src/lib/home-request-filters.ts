import { parseTicketListQuery } from './ticket-list-query';
import type { TicketQueryFilters } from '@/modules/ticket/application/query-filters';

/** URL filters narrow the existing server-authorized list; they never establish visibility. */
export function homeRequestFilters(query: string, defaultQueue: TicketQueryFilters['queue'] = 'all') {
  try {
    const {filters} = parseTicketListQuery(new URLSearchParams(query));
    return {filters: {queue: defaultQueue, ...filters} as TicketQueryFilters, error: null};
  } catch {
    return {filters: {queue: defaultQueue} as TicketQueryFilters, error: 'This request filter is invalid. Clear filters to reopen the authorized list.'};
  }
}
