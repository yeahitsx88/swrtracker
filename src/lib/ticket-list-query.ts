import { ValidationError } from '@/shared/errors';
import type { TicketQueryFilters } from '@/modules/ticket/application/query-filters';

const choices = {
  cohort: ['areaWorkload', 'linkedCrews'],
  queue: ['all', 'open', 'assignment', 'completed', 'overdue', 'fieldWork', 'pcApprovals'],
  status: ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'ASSIGNED', 'IN_PROGRESS', 'PENDING_PC_APPROVAL', 'DELAYED', 'COMPLETED', 'REQUESTER_CANCELED', 'FIELD_CANCELED', 'SURVEY_CANCELED', 'RETURNED_FOR_CORRECTION', 'PENDING_FIELD_VALIDATION'],
  priority: ['NORMAL', 'MEDIUM', 'MED_HIGH', 'HIGH'],
  ticketType: ['LAYOUT', 'CHECK_OUT', 'AS_BUILT', 'TOPO', 'PERMIT'],
} as const satisfies { [K in 'cohort' | 'queue' | 'status' | 'priority' | 'ticketType']: readonly NonNullable<TicketQueryFilters[K]>[] };

export function parseTicketListQuery(search: URLSearchParams): { filters: TicketQueryFilters; sort: 'created' | 'operations'; limit: number; offset: number } {
  for (const key of ['cohort', 'limit', 'offset', 'queue', 'status', 'priority', 'ticketType', 'areaId', 'query', 'sort', 'crewId', 'instrumentManId', 'dateBasis', 'dateFrom', 'dateTo']) {
    if (search.getAll(key).length > 1) throw new ValidationError(`Duplicate ${key} filter`);
  }
  const integer = (key: string, initial: number, min: number, max: number) => {
    const raw = search.get(key);
    if (raw === null) return initial;
    const value = Number(raw);
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < min || value > max) throw new ValidationError(`Invalid ${key}`);
    return value;
  };
  const filters: TicketQueryFilters = {};
  for (const key of Object.keys(choices) as Array<keyof typeof choices>) {
    const value = search.get(key);
    if (value !== null) {
      if (!(choices[key] as readonly string[]).includes(value)) throw new ValidationError(`Invalid ${key}`);
      Object.assign(filters, { [key]: value });
    }
  }
  const areaId = search.get('areaId');
  if (areaId !== null) {
    if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(areaId)) throw new ValidationError('Invalid areaId');
    filters.areaId = areaId;
  }
  const query = search.get('query')?.trim();
  for (const key of ['crewId', 'instrumentManId'] as const) {
    const value = search.get(key);
    if (value !== null) {
      if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value)) throw new ValidationError(`Invalid ${key}`);
      filters[key] = value;
    }
  }
  const basis = search.get('dateBasis');
  if (basis !== null) {
    if (basis !== 'needBy' && basis !== 'submitted' && basis !== 'completed') throw new ValidationError('Invalid date basis');
    filters.dateBasis = basis;
  }
  for (const key of ['dateFrom', 'dateTo'] as const) {
    const value = search.get(key);
    if (value !== null) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000') || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0,10) !== value) throw new ValidationError(`Invalid ${key}`);
      filters[key] = value;
    }
  }
  if (filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo) throw new ValidationError('Start date must be on or before end date');
  if (query && query.length > 200) throw new ValidationError('Search must be 200 characters or fewer');
  if (query) filters.query = query;
  const sort = search.get('sort') ?? 'created';
  if (sort !== 'created' && sort !== 'operations') throw new ValidationError('Invalid sort');
  return { filters, sort, limit: integer('limit', 50, 1, 200), offset: integer('offset', 0, 0, 2147483647) };
}
