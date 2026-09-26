import { requireTenantAdmin } from '@/lib/get-tenant-role';
import { ValidationError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';

export interface AuditFilterQuery {
  tenantId: UUID; userId: UUID; kind: 'projects' | 'actors' | 'events';
  search: string; limit: number; offset: number;
}
export interface AuditFilterOption { value: string; label: string }
export interface AuditFilterPort {
  list(db: DbClient, query: AuditFilterQuery): Promise<AuditFilterOption[]>;
}
export async function listAuditFilters(repo: AuditFilterPort, db: DbClient, query: AuditFilterQuery) {
  await requireTenantAdmin(db, query.tenantId, query.userId);
  if (!['projects','actors','events'].includes(query.kind) || query.search.length > 200 ||
      !Number.isSafeInteger(query.limit) || query.limit < 1 || query.limit > 100 ||
      !Number.isSafeInteger(query.offset) || query.offset < 0 || query.offset > 100000) {
    throw new ValidationError('Invalid audit filter query');
  }
  const options = await repo.list(db, { ...query, search: query.search.trim(), limit: query.limit + 1 });
  return { options: options.slice(0, query.limit), hasMore: options.length > query.limit };
}
