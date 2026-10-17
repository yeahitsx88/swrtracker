/**
 * Tenant-wide audit log for Tenant Admin: request events (ticket_events) and
 * administrative events in one filterable, paginated, newest-first list.
 * Read-only; the caller must have verified Tenant Admin authority.
 */
import { ValidationError } from '@/shared/errors';
import type { DbClient, UUID } from '@/shared/types';

export type AuditSource = 'REQUEST' | 'ADMIN';
export interface AuditLogFilters {
  projectId?: string; source?: AuditSource; eventType?: string; actor?: string; from?: string; to?: string;
}
export interface AuditLogRow {
  id: string; source: AuditSource; occurredAt: string; projectId: string | null; projectName: string | null;
  eventType: string; actorName: string | null; subject: string | null; ticketId: string | null; details: Record<string, unknown>;
}
export interface AuditLogPage { rows: AuditLogRow[]; hasMore: boolean }

const UUID_RE = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Validates untrusted query-string filters at the trust boundary. */
export function parseAuditLogFilters(search: URLSearchParams): AuditLogFilters {
  const filters: AuditLogFilters = {};
  const projectId = search.get('projectId');
  if (projectId) { if (!UUID_RE.test(projectId)) throw new ValidationError('Choose a valid project.'); filters.projectId = projectId; }
  const source = search.get('source');
  if (source) { if (source !== 'REQUEST' && source !== 'ADMIN') throw new ValidationError('Choose a valid source.'); filters.source = source; }
  const eventType = search.get('eventType')?.trim();
  if (eventType) { if (!/^[a-z_.]{2,80}$/.test(eventType)) throw new ValidationError('Event types look like ticket.approved.'); filters.eventType = eventType; }
  const actor = search.get('actor')?.trim();
  if (actor) { if (actor.length > 100) throw new ValidationError('Keep the actor search under 100 characters.'); filters.actor = actor; }
  for (const key of ['from', 'to'] as const) {
    const value = search.get(key);
    if (value) { if (!DATE_RE.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) throw new ValidationError('Dates must be YYYY-MM-DD.'); filters[key] = value; }
  }
  return filters;
}

export async function readTenantAuditLog(db: DbClient, tenantId: UUID, filters: AuditLogFilters, limit: number, offset: number): Promise<AuditLogPage> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 5000) throw new ValidationError('Choose a valid page size.');
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1_000_000) throw new ValidationError('Choose a valid page.');
  const params: unknown[] = [tenantId];
  const add = (value: unknown) => { params.push(value); return `$${params.length}`; };
  const where: string[] = [];
  if (filters.projectId) where.push(`e.project_id = ${add(filters.projectId)}::uuid`);
  if (filters.source) where.push(`e.source = ${add(filters.source)}`);
  if (filters.eventType) where.push(`e.event_type = ${add(filters.eventType)}`);
  if (filters.actor) where.push(`strpos(lower(coalesce(e.actor_name, '')), lower(${add(filters.actor)})) > 0`);
  if (filters.from) where.push(`e.occurred_at >= ${add(filters.from)}::date`);
  if (filters.to) where.push(`e.occurred_at < (${add(filters.to)}::date + INTERVAL '1 day')`);
  const limitParam = add(limit + 1), offsetParam = add(offset);
  const { rows } = await db.query<{
    id: string; source: AuditSource; occurred_at: Date; project_id: string | null; project_name: string | null; event_type: string;
    actor_name: string | null; subject: string | null; ticket_id: string | null; details: Record<string, unknown> | string | null;
  }>(
    `WITH events AS (
       SELECT te.id::text AS id, 'REQUEST'::text AS source, te.created_at AS occurred_at, t.project_id, te.event_type,
              au.name AS actor_name, t.ticket_number AS subject, t.id::text AS ticket_id, te.payload AS details
       FROM ticket_events te
       JOIN tickets t ON t.tenant_id = te.tenant_id AND t.id = te.ticket_id
       LEFT JOIN users au ON au.tenant_id = te.tenant_id AND au.id = te.actor_id
       WHERE te.tenant_id = $1
       UNION ALL
       SELECT ae.id::text, 'ADMIN', ae.occurred_at, ae.project_id, ae.event_type,
              au.name, su.name, NULL, jsonb_build_object('changes', ae.changes, 'authority', ae.authority_evidence)
       FROM administrative_events ae
       LEFT JOIN users au ON au.tenant_id = ae.tenant_id AND au.id = ae.actor_id
       LEFT JOIN users su ON su.tenant_id = ae.tenant_id AND su.id = ae.subject_user_id
       WHERE ae.tenant_id = $1
     )
     SELECT e.*, p.name AS project_name
     FROM events e LEFT JOIN projects p ON p.tenant_id = $1 AND p.id = e.project_id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY e.occurred_at DESC, e.id DESC
     LIMIT ${limitParam} OFFSET ${offsetParam}`,
    params,
  );
  return {
    rows: rows.slice(0, limit).map(row => ({
      id: row.id, source: row.source, occurredAt: new Date(row.occurred_at).toISOString(), projectId: row.project_id, projectName: row.project_name,
      eventType: row.event_type, actorName: row.actor_name, subject: row.subject, ticketId: row.ticket_id,
      details: typeof row.details === 'string' ? JSON.parse(row.details) as Record<string, unknown> : row.details ?? {},
    })),
    hasMore: rows.length > limit,
  };
}

/** CSV with every cell quoted; formula-leading values are neutralized for spreadsheet safety. */
export function auditLogCsv(rows: AuditLogRow[]): string {
  const cell = (value: unknown) => {
    let text = value === null || value === undefined ? '' : typeof value === 'string' ? value : JSON.stringify(value);
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  const header = ['occurred_at', 'source', 'project', 'event_type', 'actor', 'subject', 'details'];
  return [header.map(cell).join(','), ...rows.map(row => [row.occurredAt, row.source, row.projectName, row.eventType, row.actorName, row.subject, row.details].map(cell).join(','))].join('\r\n') + '\r\n';
}
