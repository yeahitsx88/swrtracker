import { requireTenantAdmin } from '@/lib/get-tenant-role';
import { ValidationError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';

export interface AuditLogEntry {
  id: UUID; source: 'ticket' | 'tenant'; eventType: string;
  ticketId: UUID | null; ticketNumber: string | null;
  projectId: UUID | null; projectName: string | null;
  actorId: UUID | null; actorName: string | null;
  payload: Record<string, unknown>; createdAt: Date;
}
export interface AuditLogQuery {
  tenantId: UUID; userId: UUID; projectId?: UUID; actorId?: UUID;
  eventType?: string; from?: string; until?: string; limit: number; offset: number;
}
export interface AuditLogPort {
  list(db: DbClient, query: AuditLogQuery): Promise<AuditLogEntry[]>;
}

/** The upper time bound is exclusive so adjacent export windows do not overlap. */
export async function listAuditLog(repo: AuditLogPort, db: DbClient, query: AuditLogQuery) {
  await requireTenantAdmin(db, query.tenantId, query.userId);
  validateAuditLogQuery(query);
  const rows = await repo.list(db, { ...query, eventType: query.eventType?.trim(), limit: query.limit + 1 });
  return { events: rows.slice(0, query.limit), hasMore: rows.length > query.limit };
}

export function validateAuditLogQuery(query: AuditLogQuery): void {
  if (!Number.isSafeInteger(query.limit) || query.limit < 1 || query.limit > 100 ||
      !Number.isSafeInteger(query.offset) || query.offset < 0 || query.offset > 100000) {
    throw new ValidationError('Invalid pagination');
  }
  if (query.eventType !== undefined && (!query.eventType.trim() || query.eventType.length > 120)) {
    throw new ValidationError('eventType must contain 1 to 120 characters');
  }
  for (const value of [query.from, query.until]) {
    if (value !== undefined && (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) ||
        !Number.isFinite(Date.parse(value)) ||
        new Date(value).toISOString() !== value.replace(/(?<=:\d{2})Z$/, '.000Z'))) {
      throw new ValidationError('Date filters must be valid UTC ISO timestamps');
    }
  }
  if (query.from && query.until && Date.parse(query.from) >= Date.parse(query.until)) {
    throw new ValidationError('from must precede until');
  }
}
