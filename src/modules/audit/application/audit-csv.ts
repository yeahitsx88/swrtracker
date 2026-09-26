import { requireTenantAdmin } from '@/lib/get-tenant-role';
import type { DbClient } from '@/shared/types';
import { validateAuditLogQuery, type AuditLogPort, type AuditLogQuery } from './audit-log';

export type AuditExportQuery = Omit<AuditLogQuery, 'limit' | 'offset'>;

function cell(value: string | null): string {
  const text = value ?? '';
  // Quoting protects CSV structure; the apostrophe also prevents spreadsheet formulas.
  const safe = /^[\t\r\n]|^\s*[=+@-]/.test(text) ? "'" + text : text;
  return '"' + safe.replaceAll('"', '""') + '"';
}

/** Caller holds a consistent read-only transaction for the entire iteration. */
export async function* exportAuditCsv(repo: AuditLogPort, db: DbClient, query: AuditExportQuery): AsyncGenerator<string> {
  await requireTenantAdmin(db, query.tenantId, query.userId);
  validateAuditLogQuery({ ...query, limit: 100, offset: 0 });
  const size = 500;
  for (let offset = 0; ; offset += size) {
    const rows = await repo.list(db, { ...query, eventType: query.eventType?.trim(), limit: size, offset });
    let chunk = offset === 0
      ? '\uFEFF' + ['Event ID','Source','Timestamp (UTC)','Event type','Project ID','Project','Ticket ID','Request number','Actor ID','Actor','Payload'].map(cell).join(',') + '\r\n'
      : '';
    for (const row of rows) {
      chunk += [row.id,row.source,row.createdAt.toISOString(),row.eventType,row.projectId,row.projectName,
        row.ticketId,row.ticketNumber,row.actorId,row.actorName,JSON.stringify(row.payload)].map(cell).join(',') + '\r\n';
    }
    if (chunk) yield chunk;
    if (rows.length < size) return;
  }
}
