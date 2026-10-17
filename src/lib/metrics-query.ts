import { ValidationError } from '@/shared/errors';
import type { MetricsFilters } from '@/modules/reporting/application/metrics-filters';
import { parseTicketListQuery } from './ticket-list-query';

const keys = ['cohort', 'areaId', 'ticketType', 'status', 'crewId', 'instrumentManId', 'population', 'dateBasis', 'dateFrom', 'dateTo'];
export function parseMetricsQuery(search: URLSearchParams): MetricsFilters {
  for (const key of search.keys()) {
    if (!keys.includes(key)) throw new ValidationError(`Unsupported analytics filter: ${key}`);
    if (search.getAll(key).length !== 1) throw new ValidationError(`Duplicate analytics filter: ${key}`);
  }
  const base = parseTicketListQuery(search).filters;
  const filters: MetricsFilters = { areaId: base.areaId, ticketType: base.ticketType, status: base.status, ...(base.cohort ? { cohort: base.cohort } : {}) };
  if (filters.status === 'DRAFT') throw new ValidationError('Drafts are not operational analytics');
  for (const key of ['crewId', 'instrumentManId'] as const) {
    const value = search.get(key);
    if (value !== null) {
      if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value)) throw new ValidationError(`Invalid ${key}`);
      filters[key] = value;
    }
  }
  const population = search.get('population') ?? 'all';
  if (!['all', 'open', 'completed', 'assignment', 'overdue'].includes(population)) throw new ValidationError('Invalid population');
  filters.population = population as MetricsFilters['population'];
  const basis = search.get('dateBasis') ?? 'needBy';
  if (basis !== 'needBy' && basis !== 'submitted' && basis !== 'completed') throw new ValidationError('Invalid date basis');
  filters.dateBasis = basis;
  for (const key of ['dateFrom', 'dateTo'] as const) {
    const value = search.get(key);
    if (value !== null) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000') || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0,10) !== value) throw new ValidationError(`Invalid ${key}`);
      filters[key] = value;
    }
  }
  if (filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo) throw new ValidationError('Start date must be on or before end date');
  return filters;
}
