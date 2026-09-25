import bcrypt from 'bcrypt';
import { Pool } from 'pg';
import { TicketRepository } from '@/modules/ticket/infrastructure/ticket.repository';
import { createTicket } from '@/modules/ticket/application/create-ticket';
import { submitTicket } from '@/modules/ticket/application/submit-ticket';
import { approveTicket } from '@/modules/ticket/application/approve-ticket';
import { assignTicket } from '@/modules/ticket/application/assign-ticket';
import { startTicket } from '@/modules/ticket/application/start-ticket';
import { completeTicket } from '@/modules/ticket/application/complete-ticket';
import { returnTicketForCorrection } from '@/modules/ticket/application/return-ticket-for-correction';
import type { UUID } from '@/shared/types';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('DATABASE_URL is required');

const uuid = (value: string): UUID => value as UUID;
const ids = {
  tenant: uuid('10000000-0000-4000-8000-000000000001'), project: uuid('10000000-0000-4000-8000-000000000002'),
  gc: uuid('10000000-0000-4000-8000-000000000003'), subco: uuid('10000000-0000-4000-8000-000000000004'),
  admin: uuid('10000000-0000-4000-8000-000000000010'), lead: uuid('10000000-0000-4000-8000-000000000011'),
  chief: uuid('10000000-0000-4000-8000-000000000012'), instrument: uuid('10000000-0000-4000-8000-000000000013'),
  requester: uuid('10000000-0000-4000-8000-000000000014'), authority: uuid('10000000-0000-4000-8000-000000000015'),
  level: uuid('10000000-0000-4000-8000-000000000020'), areaNorth: uuid('10000000-0000-4000-8000-000000000021'),
  areaSouth: uuid('10000000-0000-4000-8000-000000000022'), department: uuid('10000000-0000-4000-8000-000000000023'),
} as const;

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    await db.query('SELECT pg_advisory_xact_lock($1)', [260924001]);
    const existing = await db.query('SELECT 1 FROM tenants WHERE id = $1', [ids.tenant]);
    if (existing.rowCount) {
      await db.query('COMMIT');
      console.log('Amelia sample data already present; seed skipped.');
      return;
    }
    const passwordHash = await bcrypt.hash('AmeliaBeta!2026', 12);
    await db.query("INSERT INTO tenants (id, name) VALUES ($1, 'Entergy Amelia Private Beta')", [ids.tenant]);
    await db.query("INSERT INTO companies (id, tenant_id, name, type) VALUES ($1, $2, 'Project Survey', 'GC'), ($3, $2, 'Amelia Civil Subcontractor', 'SUBCONTRACTOR')", [ids.gc, ids.tenant, ids.subco]);
    await db.query("INSERT INTO projects (id, tenant_id, name, status, lead_time_enforcement_enabled, lead_time_days) VALUES ($1, $2, 'Entergy Amelia', 'ACTIVE', TRUE, 2)", [ids.project, ids.tenant]);
    const users = [
      [ids.admin, ids.gc, 'admin@amelia.local', 'Project IT'], [ids.lead, ids.gc, 'lead@amelia.local', 'Survey Lead'],
      [ids.chief, ids.gc, 'chief@amelia.local', 'Party Chief'], [ids.instrument, ids.gc, 'instrument@amelia.local', 'Instrument Man'],
      [ids.requester, ids.subco, 'requester@amelia.local', 'Subcontractor Requester'],
      [ids.authority, ids.subco, 'authority@amelia.local', 'Subcontractor Authority'],
    ] as const;
    for (const [id, companyId, email, name] of users) {
      await db.query(`INSERT INTO users (id, tenant_id, company_id, email, password_hash, name, auth_method)
        VALUES ($1, $2, $3, $4, $5, $6, 'LOCAL')`, [id, ids.tenant, companyId, email, passwordHash, name]);
    }
    await db.query("INSERT INTO tenant_memberships (tenant_id, user_id, role) VALUES ($1, $2, 'TENANT_ADMIN')", [ids.tenant, ids.admin]);
    const memberships = [[ids.admin, 'PROJECT_ADMIN'], [ids.lead, 'SURVEY_MANAGER'], [ids.chief, 'PARTY_CHIEF'],
      [ids.instrument, 'INSTRUMENT_MAN'], [ids.requester, 'REQUESTER'], [ids.authority, 'REQUESTER']] as const;
    for (const [userId, role] of memberships) {
      await db.query('INSERT INTO project_memberships (project_id, user_id, role) VALUES ($1, $2, $3)', [ids.project, userId, role]);
    }
    await db.query("INSERT INTO aor_levels (id, project_id, tenant_id, depth, label) VALUES ($1, $2, $3, 0, 'Area')", [ids.level, ids.project, ids.tenant]);
    await db.query("INSERT INTO aor_nodes (id, project_id, tenant_id, level_id, name, code) VALUES ($1, $2, $3, $4, 'North Area', 'NORTH'), ($5, $2, $3, $4, 'South Area', 'SOUTH')",
      [ids.areaNorth, ids.project, ids.tenant, ids.level, ids.areaSouth]);
    await db.query("INSERT INTO departments (id, tenant_id, project_id, name, manager_title, created_by) VALUES ($1, $2, $3, 'Construction', 'Construction Manager', $4)", [ids.department, ids.tenant, ids.project, ids.admin]);
    await db.query(`INSERT INTO company_authority_grants (tenant_id, project_id, company_id, user_id, granted_by)
      VALUES ($1, $2, $3, $4, $5)`, [ids.tenant, ids.project, ids.subco, ids.authority, ids.admin]);

    const repo = new TicketRepository();
    async function newSubmitted(description: string, areaId: UUID, requesterId: UUID, daysAhead: number) {
      const draft = await createTicket(repo, db, {
        tenantId: ids.tenant, projectId: ids.project, aorNodeId: areaId, departmentId: ids.department,
        companyId: ids.subco, requesterId, ticketType: 'LAYOUT', workflowVariant: 'STANDARD_APPROVAL',
        craft: 'Civil', fieldContact: 'Amelia field trailer', fieldChannel: 'Radio 4', description,
        requestedDate: new Date(Date.now() + daysAhead * 86400000),
      });
      return submitTicket(repo, db, {
        tenantId: ids.tenant, ticketId: draft.id, actorId: requesterId, actorRole: 'REQUESTER',
        departmentId: ids.department, urgentReason: daysAhead < 2 ? 'Private-beta urgent request example' : undefined,
      });
    }
    await newSubmitted('Submitted request awaiting Survey review', ids.areaNorth, ids.requester, 4);
    const approved = await newSubmitted('Approved request awaiting Instrument Man assignment', ids.areaNorth, ids.authority, -1);
    await approveTicket(repo, db, { tenantId: ids.tenant, ticketId: approved.id, actorId: ids.lead, actorRole: 'SURVEY_MANAGER' });
    const active = await newSubmitted('Active field layout with assigned crew', ids.areaSouth, ids.requester, 3);
    await approveTicket(repo, db, { tenantId: ids.tenant, ticketId: active.id, actorId: ids.lead, actorRole: 'SURVEY_MANAGER' });
    await assignTicket(repo, db, { tenantId: ids.tenant, ticketId: active.id, actorId: ids.lead, actorRole: 'SURVEY_MANAGER', assignedPartyChiefId: ids.chief, assignedInstrumentManId: ids.instrument, surveyLeadId: ids.lead });
    await startTicket(repo, db, { tenantId: ids.tenant, ticketId: active.id, actorId: ids.instrument, actorRole: 'INSTRUMENT_MAN' });
    const completed = await newSubmitted('Completed request for cycle-time review', ids.areaSouth, ids.authority, 5);
    await approveTicket(repo, db, { tenantId: ids.tenant, ticketId: completed.id, actorId: ids.lead, actorRole: 'SURVEY_MANAGER' });
    await assignTicket(repo, db, { tenantId: ids.tenant, ticketId: completed.id, actorId: ids.lead, actorRole: 'SURVEY_MANAGER', assignedPartyChiefId: null, assignedInstrumentManId: ids.instrument, surveyLeadId: ids.lead });
    await startTicket(repo, db, { tenantId: ids.tenant, ticketId: completed.id, actorId: ids.instrument, actorRole: 'INSTRUMENT_MAN' });
    await completeTicket(repo, db, { tenantId: ids.tenant, ticketId: completed.id, actorId: ids.instrument, actorRole: 'INSTRUMENT_MAN' });
    const returned = await newSubmitted('Returned request ready for requester correction', ids.areaNorth, ids.requester, 4);
    await returnTicketForCorrection(repo, db, { tenantId: ids.tenant, ticketId: returned.id, actorId: ids.lead, actorRole: 'SURVEY_MANAGER', reason: 'Add the latest control drawing', origin: 'INITIAL_REVIEW' });
    await db.query('COMMIT');
    console.log('Seeded Entergy Amelia sample roles and five representative SWRs.');
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally {
    db.release();
    await pool.end();
  }
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
