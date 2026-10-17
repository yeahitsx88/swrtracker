import type { MetricsFilters } from '@/modules/reporting/application/metrics-filters';

export type CommandFilters = Pick<MetricsFilters,
  'areaId' | 'ticketType' | 'status' | 'crewId' | 'dateFrom' | 'dateTo'>;
type RequestDimension = Pick<CommandFilters, 'areaId' | 'ticketType' | 'status' | 'crewId'>;

/** Dashboard date controls describe event activity, never the all-time request cohort. */
export function commandReviewHref(projectId: string, filters: CommandFilters, selected: RequestDimension = {}): string {
  const search = new URLSearchParams({ view: 'requests' });
  for (const key of ['areaId', 'ticketType', 'status', 'crewId'] as const) {
    const value = selected[key] ?? filters[key];
    if (value) search.set(key, value);
  }
  return `/projects/${encodeURIComponent(projectId)}/requests?${search}`;
}
