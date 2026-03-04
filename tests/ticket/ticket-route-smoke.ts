import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { NextRequest } from 'next/server';
import * as authModule from '@/lib/auth';
import * as createRouteModule from '@/app/api/tickets/route';
import * as submitRouteModule from '@/app/api/tickets/[ticketId]/submit/route';
import * as approveRouteModule from '@/app/api/tickets/[ticketId]/approve/route';
import * as assignRouteModule from '@/app/api/tickets/[ticketId]/assign/route';
import type { UUID } from '@/shared/types';

type JsonObject = Record<string, unknown>;

const {
  signToken,
  COOKIE_NAME,
} = authModule;

const createTicketRoute = createRouteModule.POST;
const submitTicketRoute = submitRouteModule.POST;
const approveTicketRoute = approveRouteModule.POST;
const assignTicketRoute = assignRouteModule.POST;

function getRequiredEnv(name: 'DATABASE_URL' | 'JWT_SECRET'): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required to run pnpm smoke:ticket`);
  }
  return value;
}

function makeRequest(url: string, token: string, body?: JsonObject): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: {
      cookie: `${COOKIE_NAME}=${token}`,
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

async function parseResponse(label: string, response: Response): Promise<JsonObject> {
  const text = await response.text();

  let json: JsonObject | null = null;
  try {
    json = text ? JSON.parse(text) as JsonObject : null;
  } catch {
    json = { raw: text };
  }

  if (!response.ok) {
    throw new Error(`${label} failed (${response.status}): ${JSON.stringify(json)}`);
  }

  return json ?? {};
}

async function cleanupSmokeData(pool: Pool): Promise<void> {
  const { rows: tenantRows } = await pool.query<{ id: string }>(
    `SELECT id FROM tenants WHERE name LIKE 'Smoke Tenant smoke-%'`,
  );
  const { rows: projectRows } = await pool.query<{ id: string }>(
    `SELECT id FROM projects WHERE name LIKE 'Smoke Project smoke-%'`,
  );

  const tenantIds = tenantRows.map((row) => row.id);
  const projectIds = projectRows.map((row) => row.id);

  if (tenantIds.length === 0 && projectIds.length === 0) {
    return;
  }

  await pool.query('BEGIN');
  try {
    if (tenantIds.length > 0) {
      await pool.query('DELETE FROM ticket_events WHERE tenant_id = ANY($1::uuid[])', [tenantIds]);
      await pool.query('DELETE FROM cad_work WHERE tenant_id = ANY($1::uuid[])', [tenantIds]);
      await pool.query('DELETE FROM tickets WHERE tenant_id = ANY($1::uuid[])', [tenantIds]);
      await pool.query('DELETE FROM aor_assignments WHERE tenant_id = ANY($1::uuid[])', [tenantIds]);
      await pool.query('DELETE FROM aor_nodes WHERE tenant_id = ANY($1::uuid[])', [tenantIds]);
      await pool.query('DELETE FROM aor_levels WHERE tenant_id = ANY($1::uuid[])', [tenantIds]);
    }

    if (projectIds.length > 0) {
      await pool.query('DELETE FROM project_memberships WHERE project_id = ANY($1::uuid[])', [projectIds]);
      await pool.query('DELETE FROM ticket_sequences WHERE project_id = ANY($1::uuid[])', [projectIds]);
    }

    if (tenantIds.length > 0) {
      await pool.query('DELETE FROM users WHERE tenant_id = ANY($1::uuid[])', [tenantIds]);
      await pool.query('DELETE FROM companies WHERE tenant_id = ANY($1::uuid[])', [tenantIds]);
    }

    if (projectIds.length > 0) {
      await pool.query('DELETE FROM projects WHERE id = ANY($1::uuid[])', [projectIds]);
    }

    if (tenantIds.length > 0) {
      await pool.query('DELETE FROM tenants WHERE id = ANY($1::uuid[])', [tenantIds]);
    }

    await pool.query('COMMIT');
  } catch (error) {
    await pool.query('ROLLBACK');
    throw error;
  }
}

async function main(): Promise<void> {
  getRequiredEnv('DATABASE_URL');
  getRequiredEnv('JWT_SECRET');

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const suffix = `smoke-${Date.now()}`;
  const ids = {
    tenant: randomUUID(),
    company: randomUUID(),
    project: randomUUID(),
    requester: randomUUID(),
    manager: randomUUID(),
    partyChief: randomUUID(),
    aorLevel: randomUUID(),
    aorNode: randomUUID(),
  };

  try {
    await cleanupSmokeData(pool);

    await pool.query('BEGIN');
    await pool.query(
      'INSERT INTO tenants (id, name) VALUES ($1, $2)',
      [ids.tenant, `Smoke Tenant ${suffix}`],
    );
    await pool.query(
      'INSERT INTO companies (id, tenant_id, name, type) VALUES ($1, $2, $3, $4)',
      [ids.company, ids.tenant, `Smoke GC ${suffix}`, 'GC'],
    );
    await pool.query(
      'INSERT INTO users (id, tenant_id, company_id, email, name, auth_method) VALUES ($1, $2, $3, $4, $5, $6)',
      [ids.requester, ids.tenant, ids.company, `requester-${suffix}@example.com`, 'Smoke Requester', 'LOCAL'],
    );
    await pool.query(
      'INSERT INTO users (id, tenant_id, company_id, email, name, auth_method) VALUES ($1, $2, $3, $4, $5, $6)',
      [ids.manager, ids.tenant, ids.company, `manager-${suffix}@example.com`, 'Smoke Manager', 'LOCAL'],
    );
    await pool.query(
      'INSERT INTO users (id, tenant_id, company_id, email, name, auth_method) VALUES ($1, $2, $3, $4, $5, $6)',
      [ids.partyChief, ids.tenant, ids.company, `pc-${suffix}@example.com`, 'Smoke Party Chief', 'LOCAL'],
    );
    await pool.query(
      'INSERT INTO projects (id, tenant_id, name, status) VALUES ($1, $2, $3, $4)',
      [ids.project, ids.tenant, `Smoke Project ${suffix}`, 'ACTIVE'],
    );
    await pool.query(
      'INSERT INTO project_memberships (project_id, user_id, role) VALUES ($1, $2, $3), ($1, $4, $5), ($1, $6, $7)',
      [ids.project, ids.requester, 'REQUESTER', ids.manager, 'SURVEY_MANAGER', ids.partyChief, 'PARTY_CHIEF'],
    );
    await pool.query(
      'INSERT INTO aor_levels (id, project_id, tenant_id, depth, label) VALUES ($1, $2, $3, $4, $5)',
      [ids.aorLevel, ids.project, ids.tenant, 0, 'AREA'],
    );
    await pool.query(
      'INSERT INTO aor_nodes (id, project_id, tenant_id, level_id, parent_id, name, code) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [ids.aorNode, ids.project, ids.tenant, ids.aorLevel, null, 'Smoke AOR', 'SMK'],
    );
    await pool.query('COMMIT');

    const requesterToken = signToken(ids.requester as UUID, ids.tenant as UUID);
    const managerToken = signToken(ids.manager as UUID, ids.tenant as UUID);

    const createRes = await createTicketRoute(makeRequest('http://localhost/api/tickets', requesterToken, {
      projectId: ids.project,
      aorNodeId: ids.aorNode,
      ticketType: 'LAYOUT',
      craft: 'Civil',
      description: 'Smoke test ticket',
      requestedDate: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
    }));
    const created = await parseResponse('create', createRes);
    const createdTicket = created.ticket as JsonObject;
    const ticketId = createdTicket.id as string;

    const submitRes = await submitTicketRoute(
      makeRequest(`http://localhost/api/tickets/${ticketId}/submit`, requesterToken),
      { params: Promise.resolve({ ticketId }) },
    );
    const submitted = await parseResponse('submit', submitRes);

    const approveRes = await approveTicketRoute(
      makeRequest(`http://localhost/api/tickets/${ticketId}/approve`, managerToken),
      { params: Promise.resolve({ ticketId }) },
    );
    const approved = await parseResponse('approve', approveRes);

    const assignRes = await assignTicketRoute(
      makeRequest(`http://localhost/api/tickets/${ticketId}/assign`, managerToken, {
        assignedPartyChiefId: ids.partyChief,
      }),
      { params: Promise.resolve({ ticketId }) },
    );
    const assigned = await parseResponse('assign', assignRes);

    const { rows: ticketRows } = await pool.query<{
      status: string;
      ticket_number: string | null;
      assigned_party_chief_id: string | null;
    }>(
      'SELECT status, ticket_number, assigned_party_chief_id FROM tickets WHERE id = $1',
      [ticketId],
    );
    const { rows: eventRows } = await pool.query<{ event_type: string }>(
      'SELECT event_type FROM ticket_events WHERE ticket_id = $1 ORDER BY created_at, id',
      [ticketId],
    );

    console.log(JSON.stringify({
      create: {
        statusCode: createRes.status,
        ticketStatus: createdTicket.status,
        ticketNumber: createdTicket.ticketNumber,
      },
      submit: {
        statusCode: submitRes.status,
        ticketStatus: (submitted.ticket as JsonObject).status,
        ticketNumber: (submitted.ticket as JsonObject).ticketNumber,
      },
      approve: {
        statusCode: approveRes.status,
        ticketStatus: (approved.ticket as JsonObject).status,
      },
      assign: {
        statusCode: assignRes.status,
        ticketStatus: (assigned.ticket as JsonObject).status,
        assignedPartyChiefId: (assigned.ticket as JsonObject).assignedPartyChiefId,
      },
      persisted: ticketRows[0],
      events: eventRows.map((row) => row.event_type),
    }, null, 2));
  } finally {
    try {
      await cleanupSmokeData(pool);
    } finally {
      await pool.end();
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
