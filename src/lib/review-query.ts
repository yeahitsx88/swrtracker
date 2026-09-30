import { parseTicketListQuery } from './ticket-list-query';
import { ValidationError } from '@/shared/errors';
import type { ReviewFilters, ReviewOptions } from '@/modules/ticket/application/review-tickets';

export function parseReviewQuery(search: URLSearchParams): Pick<ReviewOptions, 'filters' | 'limit' | 'offset' | 'sort'> {
  for (const key of ['projectId', 'crewId', 'dateFrom', 'dateTo', 'dateBasis', 'order']) {
    if (search.getAll(key).length > 1) throw new ValidationError(`Duplicate ${key}`);
  }
  const { filters: base, limit, offset } = parseTicketListQuery(search);
  const filters: ReviewFilters = { ...base };
  const crewId = search.get('crewId');
  if (crewId !== null) {
    if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(crewId)) throw new ValidationError('Invalid crewId');
    filters.crewId = crewId;
  }
  for (const key of ['dateFrom', 'dateTo'] as const) {
    const date = search.get(key);
    if (date !== null) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw new ValidationError(`Invalid ${key}`);
      filters[key] = date;
    }
  }
  if (filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo) throw new ValidationError('Start date must be on or before end date');
  const basis = search.get('dateBasis') ?? 'needBy';
  if (basis !== 'needBy' && basis !== 'submitted' && basis !== 'completed') throw new ValidationError('Invalid date basis');
  filters.dateBasis = basis;
  const sort = search.get('order') ?? 'newest';
  if (sort !== 'newest' && sort !== 'oldest' && sort !== 'needBy') throw new ValidationError('Invalid order');
  return { filters, limit, offset, sort };
}
