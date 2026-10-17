import test from 'node:test';
import assert from 'node:assert/strict';
import { auditLogCsv, parseAuditLogFilters, readTenantAuditLog } from '@/modules/audit/application/tenant-audit-log';
import type { DbClient, UUID } from '@/shared/types';

const tenant = '10000000-0000-4000-8000-000000000001' as UUID;

test('audit filters accept only well-formed values', () => {
  assert.deepEqual(parseAuditLogFilters(new URLSearchParams('source=ADMIN&eventType=ticket.approved&from=2026-10-01&to=2026-10-09&actor=Lead')),
    { source: 'ADMIN', eventType: 'ticket.approved', from: '2026-10-01', to: '2026-10-09', actor: 'Lead' });
  for (const bad of ['projectId=nope', 'source=EMAIL', "eventType=x';drop", 'from=10/01/2026', `actor=${'a'.repeat(101)}`]) {
    assert.throws(() => parseAuditLogFilters(new URLSearchParams(bad)), { type: 'ValidationError' }, bad);
  }
});

test('audit reads are tenant-scoped, parameterized and fetch one extra row to detect more', async () => {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const db = { async query(sql: string, params: unknown[]) { calls.push({ sql, params }); return { rows: [
    { id: 'e1', source: 'REQUEST', occurred_at: new Date('2026-10-09T10:00:00Z'), project_id: 'p', project_name: 'Amelia', event_type: 'ticket.approved', actor_name: 'Lead', subject: 'FSS-1', ticket_id: 't', details: '{"a":1}' },
    { id: 'e2', source: 'ADMIN', occurred_at: new Date('2026-10-08T10:00:00Z'), project_id: null, project_name: null, event_type: 'password.changed', actor_name: 'Dana', subject: 'Dana', ticket_id: null, details: { changes: {} } },
  ] }; } } as unknown as DbClient;
  const page = await readTenantAuditLog(db, tenant, { eventType: "ticket.approved", actor: "Lead'; --" }, 1, 0);
  assert.equal(page.hasMore, true);
  assert.equal(page.rows.length, 1);
  assert.deepEqual(page.rows[0]!.details, { a: 1 });
  const { sql, params } = calls[0]!;
  assert.equal(params[0], tenant);
  assert.ok(params.includes("Lead'; --"), 'actor text travels as a bound parameter');
  assert.ok(!sql.includes("Lead'"), 'no filter text is interpolated into SQL');
  assert.match(sql, /te\.tenant_id = \$1/);
  assert.match(sql, /ae\.tenant_id = \$1/);
  assert.equal(params.at(-2), 2, 'limit + 1');
  await assert.rejects(readTenantAuditLog(db, tenant, {}, 0, 0), { type: 'ValidationError' });
  await assert.rejects(readTenantAuditLog(db, tenant, {}, 50, -1), { type: 'ValidationError' });
});

test('CSV export quotes every cell and neutralizes spreadsheet formulas', () => {
  const csv = auditLogCsv([{ id: '1', source: 'REQUEST', occurredAt: '2026-10-09T10:00:00.000Z', projectId: null, projectName: 'Amelia "North"',
    eventType: 'ticket.comment_added', actorName: '=HYPERLINK("x")', subject: null, ticketId: null, details: { reason: 'a,b' } }]);
  const [header, line] = csv.trim().split('\r\n');
  assert.equal(header, '"occurred_at","source","project","event_type","actor","subject","details"');
  assert.match(line!, /"Amelia ""North"""/);
  assert.match(line!, /"'=HYPERLINK\(""x""\)"/);
  assert.match(line!, /"\{""reason"":""a,b""\}"/);
});
