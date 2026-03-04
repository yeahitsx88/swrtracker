/**
 * TicketRepository — pg implementation of ITicketRepository.
 * All queries scoped by tenant_id. No updates or deletes on ticket_events.
 *
 * Visibility scoping (CLAUDE.md §7A) is enforced in this layer — not in routes.
 */
import { randomUUID } from 'crypto';
import type { DbClient, UUID, Page } from '@/shared/types';
import type { PendingPcOutcome, Ticket, TicketPriority, TicketStatus, TicketType, WorkflowVariant } from '../domain/types';
import type { ProjectStatus } from '@/modules/tenancy/domain/types';
import type {
  ITicketRepository,
  TicketStatusPatch,
  ListTicketsOptions,
  VisibilityScope,
} from '../application/ports';

// ---------------------------------------------------------------------------
// Row mapper
// ---------------------------------------------------------------------------

interface TicketRow {
  id: string;
  tenant_id: string;
  project_id: string;
  aor_node_id: string;
  department_id: string | null;
  company_id: string;
  ticket_number: string | null;
  ticket_type: string;
  requester_id: string;
  assigned_party_chief_id: string | null;
  assigned_instrument_man_id: string | null;
  survey_lead_id: string | null;
  workflow_variant: string;
  status: string;
  craft: string;
  description: string;
  requested_date: Date;
  submitted_at: Date | null;
  approved_at: Date | null;
  assigned_at: Date | null;
  started_at: Date | null;
  pending_pc_outcome: string | null;
  pending_pc_reason: string | null;
  survey_cancel_requested_by: string | null;
  survey_cancel_requested_role: string | null;
  survey_cancel_reason: string | null;
  survey_cancel_requested_at: Date | null;
  completed_at: Date | null;
  closed_at: Date | null;
  rejection_reason: string | null;
  parent_ticket_id: string | null;
  priority: string;
  priority_set_by: string | null;
  priority_set_reason: string | null;
  created_at: Date;
  updated_at: Date;
}

function rowToTicket(r: TicketRow): Ticket {
  return {
    id:                      r.id as UUID,
    tenantId:                r.tenant_id as UUID,
    projectId:               r.project_id as UUID,
    aorNodeId:               r.aor_node_id as UUID,
    departmentId:            r.department_id as UUID | null,
    companyId:               r.company_id as UUID,
    ticketNumber:            r.ticket_number,
    ticketType:              r.ticket_type as TicketType,
    requesterId:             r.requester_id as UUID,
    assignedPartyChiefId:    r.assigned_party_chief_id as UUID | null,
    assignedInstrumentManId: r.assigned_instrument_man_id as UUID | null,
    surveyLeadId:            r.survey_lead_id as UUID | null,
    workflowVariant:         r.workflow_variant as WorkflowVariant,
    status:                  r.status as TicketStatus,
    craft:                   r.craft,
    description:             r.description,
    requestedDate:           r.requested_date,
    submittedAt:             r.submitted_at,
    approvedAt:              r.approved_at,
    assignedAt:              r.assigned_at,
    startedAt:               r.started_at,
    pendingPcOutcome:        r.pending_pc_outcome as PendingPcOutcome | null,
    pendingPcReason:         r.pending_pc_reason,
    surveyCancelRequestedBy: r.survey_cancel_requested_by as UUID | null,
    surveyCancelRequestedRole: r.survey_cancel_requested_role,
    surveyCancelReason:      r.survey_cancel_reason,
    surveyCancelRequestedAt: r.survey_cancel_requested_at,
    completedAt:             r.completed_at,
    closedAt:                r.closed_at,
    rejectionReason:         r.rejection_reason,
    parentTicketId:          r.parent_ticket_id as UUID | null,
    priority:                r.priority as Ticket['priority'],
    prioritySetBy:           r.priority_set_by as UUID | null,
    prioritySetReason:       r.priority_set_reason,
    createdAt:               r.created_at,
    updatedAt:               r.updated_at,
  };
}

// ---------------------------------------------------------------------------
// Visibility WHERE clause builder (CLAUDE.md §7A)
// ---------------------------------------------------------------------------

/**
 * Builds the additional SQL condition fragment that enforces role-based visibility.
 * baseIdx is the next positional $N parameter index to use.
 * Returns empty sql+params for full-visibility roles.
 */
function buildVisibilityClause(
  scope: VisibilityScope,
  baseIdx: number,
): { sql: string; params: unknown[] } {
  const { actorId, actorRole, departmentId, aorNodeIds, partyChiefId, companyId, companyType } = scope;

  const withSubcontractorIsolation = (
    clause: { sql: string; params: unknown[] },
  ): { sql: string; params: unknown[] } => {
    if (companyType !== 'SUBCONTRACTOR') return clause;

    const placeholder = `$${baseIdx + clause.params.length}`;
    const isolationSql = `AND t.company_id = ${placeholder}`;

    return {
      sql: clause.sql ? `${clause.sql} ${isolationSql}` : isolationSql,
      params: [...clause.params, companyId],
    };
  };

  switch (actorRole) {
    // Full project visibility — no additional WHERE clause
    case 'SURVEY_MANAGER':
    case 'CAD_LEAD':
    case 'CAD_TECHNICIAN':
    case 'VIEWER':
      return withSubcontractorIsolation({ sql: '', params: [] });

    case 'SUBCONTRACTS_COORDINATOR':
      return withSubcontractorIsolation({
        sql: "AND EXISTS (SELECT 1 FROM companies c WHERE c.id = t.company_id AND c.type = 'SUBCONTRACTOR')",
        params: [],
      });

    case 'REQUESTER':
      return withSubcontractorIsolation({
        sql:    `AND t.requester_id = $${baseIdx}`,
        params: [actorId],
      });

    case 'DEPARTMENT_MANAGER': {
      if (!departmentId) {
        return withSubcontractorIsolation({ sql: 'AND 1 = 0', params: [] });
      }
      return withSubcontractorIsolation({
        sql:    `AND t.department_id = $${baseIdx}`,
        params: [departmentId],
      });
    }

    case 'DEPARTMENT_LEAD': {
      if (!departmentId || !aorNodeIds || aorNodeIds.length === 0) {
        return withSubcontractorIsolation({ sql: 'AND 1 = 0', params: [] });
      }
      const aorPlaceholders = aorNodeIds.map((_, i) => `$${baseIdx + i + 1}`).join(', ');
      return withSubcontractorIsolation({
        sql:    `AND t.department_id = $${baseIdx} AND t.aor_node_id IN (${aorPlaceholders})`,
        params: [departmentId, ...aorNodeIds],
      });
    }

    case 'PARTY_CHIEF':
      return withSubcontractorIsolation({
        sql:    `AND t.assigned_party_chief_id = $${baseIdx}`,
        params: [actorId],
      });

    case 'INSTRUMENT_MAN': {
      // Sees: Party Chief's tickets + tickets where they are explicitly assigned_instrument_man
      const pcId = partyChiefId ?? actorId; // partyChiefId resolved by caller from crew_rosters
      return withSubcontractorIsolation({
        sql:    `AND (t.assigned_party_chief_id = $${baseIdx} OR t.assigned_instrument_man_id = $${baseIdx + 1})`,
        params: [pcId, actorId],
      });
    }

    case 'SURVEY_SUPERINTENDENT':
    case 'AREA_VIEWER': {
      if (!aorNodeIds || aorNodeIds.length === 0) {
        // No AOR assignments — sees nothing
        return withSubcontractorIsolation({ sql: 'AND 1 = 0', params: [] });
      }
      const placeholders = aorNodeIds.map((_, i) => `$${baseIdx + i}`).join(', ');
      return withSubcontractorIsolation({
        sql:    `AND t.aor_node_id IN (${placeholders})`,
        params: aorNodeIds,
      });
    }

    default:
      return withSubcontractorIsolation({ sql: 'AND 1 = 0', params: [] });
  }
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export class TicketRepository implements ITicketRepository {
  async findById(
    db: DbClient,
    tenantId: UUID,
    ticketId: UUID,
    visibility: VisibilityScope,
  ): Promise<Ticket | null> {
    const { sql: visSql, params: visParams } = buildVisibilityClause(visibility, 3);

    const { rows } = await db.query<TicketRow>(
      `SELECT t.* FROM tickets t
       WHERE t.id = $1 AND t.tenant_id = $2
       ${visSql}
       LIMIT 1`,
      [ticketId, tenantId, ...visParams],
    );
    return rows[0] ? rowToTicket(rows[0]) : null;
  }

  async findByIdInternal(
    db: DbClient,
    tenantId: UUID,
    ticketId: UUID,
  ): Promise<Ticket | null> {
    const { rows } = await db.query<TicketRow>(
      `SELECT t.* FROM tickets t WHERE t.id = $1 AND t.tenant_id = $2 LIMIT 1`,
      [ticketId, tenantId],
    );
    return rows[0] ? rowToTicket(rows[0]) : null;
  }

  async save(db: DbClient, ticket: Ticket): Promise<void> {
    await db.query(
      `INSERT INTO tickets (
        id, tenant_id, project_id, aor_node_id, department_id, company_id,
        ticket_number, ticket_type,
        requester_id, assigned_party_chief_id, assigned_instrument_man_id, survey_lead_id,
        workflow_variant, status, craft, description, requested_date,
        submitted_at, approved_at, assigned_at, started_at,
        pending_pc_outcome, pending_pc_reason,
        survey_cancel_requested_by, survey_cancel_requested_role, survey_cancel_reason, survey_cancel_requested_at,
        completed_at, closed_at, rejection_reason, parent_ticket_id,
        priority, priority_set_by, priority_set_reason,
        created_at, updated_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
        $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,
        $24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36
      )`,
      [
        ticket.id, ticket.tenantId, ticket.projectId, ticket.aorNodeId,
        ticket.departmentId, ticket.companyId, ticket.ticketNumber, ticket.ticketType,
        ticket.requesterId, ticket.assignedPartyChiefId, ticket.assignedInstrumentManId,
        ticket.surveyLeadId,
        ticket.workflowVariant, ticket.status, ticket.craft, ticket.description,
        ticket.requestedDate,
        ticket.submittedAt, ticket.approvedAt, ticket.assignedAt,
        ticket.startedAt, ticket.pendingPcOutcome, ticket.pendingPcReason,
        ticket.surveyCancelRequestedBy, ticket.surveyCancelRequestedRole, ticket.surveyCancelReason, ticket.surveyCancelRequestedAt,
        ticket.completedAt, ticket.closedAt, ticket.rejectionReason, ticket.parentTicketId,
        ticket.priority, ticket.prioritySetBy, ticket.prioritySetReason,
        ticket.createdAt, ticket.updatedAt,
      ],
    );
  }

  async saveCadWork(db: DbClient, ticketId: UUID, tenantId: UUID): Promise<void> {
    await db.query(
      `INSERT INTO cad_work (id, ticket_id, tenant_id, cad_status)
       VALUES ($1, $2, $3, 'NOT_REQUIRED')`,
      [randomUUID(), ticketId, tenantId],
    );
  }

  async nextSequence(db: DbClient, projectId: UUID): Promise<number> {
    const { rows } = await db.query<{ last_seq: number }>(
      `INSERT INTO ticket_sequences (project_id, last_seq)
       VALUES ($1, 1)
       ON CONFLICT (project_id)
       DO UPDATE SET last_seq = ticket_sequences.last_seq + 1
       RETURNING last_seq`,
      [projectId],
    );
    const row = rows[0];
    if (!row) throw new Error('nextSequence returned no rows');
    return row.last_seq;
  }

  async findAorNodeCode(db: DbClient, tenantId: UUID, aorNodeId: UUID): Promise<string | null> {
    const { rows } = await db.query<{ code: string }>(
      `SELECT code FROM aor_nodes WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
      [aorNodeId, tenantId],
    );
    return rows[0]?.code ?? null;
  }

  async findDepartmentById(
    db: DbClient,
    tenantId: UUID,
    projectId: UUID,
    departmentId: UUID,
  ): Promise<{ id: UUID } | null> {
    const { rows } = await db.query<{ id: string }>(
      `SELECT id
       FROM departments
       WHERE id = $1
         AND tenant_id = $2
         AND project_id = $3
       LIMIT 1`,
      [departmentId, tenantId, projectId],
    );
    return rows[0] ? { id: rows[0].id as UUID } : null;
  }

  async findRequesterDepartmentMembership(
    db: DbClient,
    tenantId: UUID,
    projectId: UUID,
    requesterId: UUID,
  ): Promise<{ departmentId: UUID; title: string | null } | null> {
    const { rows } = await db.query<{ department_id: string; title: string | null }>(
      `SELECT department_id, title
       FROM department_memberships
       WHERE tenant_id = $1
         AND project_id = $2
         AND user_id = $3
         AND deactivated_at IS NULL
       LIMIT 1`,
      [tenantId, projectId, requesterId],
    );
    if (!rows[0]) return null;
    return {
      departmentId: rows[0].department_id as UUID,
      title: rows[0].title,
    };
  }

  async findDepartmentTitlePriority(
    db: DbClient,
    tenantId: UUID,
    departmentId: UUID,
    title: string,
  ): Promise<TicketPriority | null> {
    const { rows } = await db.query<{ default_priority: TicketPriority }>(
      `SELECT default_priority
       FROM department_titles
       WHERE tenant_id = $1
         AND department_id = $2
         AND title = $3
       LIMIT 1`,
      [tenantId, departmentId, title],
    );
    return rows[0]?.default_priority ?? null;
  }

  async isEmailWhitelisted(
    db: DbClient,
    tenantId: UUID,
    projectId: UUID,
    email: string,
  ): Promise<boolean> {
    const { rows } = await db.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM priority_whitelist
         WHERE tenant_id = $1 AND project_id = $2 AND email = $3
       ) AS exists`,
      [tenantId, projectId, email.toLowerCase()],
    );
    return rows[0]?.exists === true;
  }

  async patchTicket(
    db: DbClient,
    tenantId: UUID,
    ticketId: UUID,
    patch: TicketStatusPatch,
  ): Promise<void> {
    const cols: string[] = ['status = $3', 'updated_at = NOW()'];
    const vals: unknown[] = [ticketId, tenantId, patch.status];
    let idx = 4;

    const maybe = (col: string, val: unknown) => {
      if (val !== undefined) { cols.push(`${col} = $${idx++}`); vals.push(val); }
    };

    maybe('department_id',              patch.departmentId);
    maybe('ticket_number',              patch.ticketNumber);
    maybe('submitted_at',               patch.submittedAt);
    maybe('approved_at',                patch.approvedAt);
    maybe('assigned_at',                patch.assignedAt);
    maybe('started_at',                 patch.startedAt);
    maybe('pending_pc_outcome',         patch.pendingPcOutcome);
    maybe('pending_pc_reason',          patch.pendingPcReason);
    maybe('survey_cancel_requested_by', patch.surveyCancelRequestedBy);
    maybe('survey_cancel_requested_role', patch.surveyCancelRequestedRole);
    maybe('survey_cancel_reason',       patch.surveyCancelReason);
    maybe('survey_cancel_requested_at', patch.surveyCancelRequestedAt);
    maybe('completed_at',               patch.completedAt);
    maybe('closed_at',                  patch.closedAt);
    maybe('rejection_reason',           patch.rejectionReason);
    maybe('assigned_party_chief_id',    patch.assignedPartyChiefId);
    maybe('assigned_instrument_man_id', patch.assignedInstrumentManId);
    maybe('survey_lead_id',             patch.surveyLeadId);
    maybe('priority',                   patch.priority);
    maybe('priority_set_by',            patch.prioritySetBy);
    maybe('priority_set_reason',        patch.prioritySetReason);

    await db.query(
      `UPDATE tickets SET ${cols.join(', ')} WHERE id = $1 AND tenant_id = $2`,
      vals,
    );
  }

  async list(db: DbClient, tenantId: UUID, opts: ListTicketsOptions): Promise<Page<Ticket>> {
    const baseVals: unknown[] = [tenantId, opts.projectId];
    const conditions: string[] = ['t.tenant_id = $1', 't.project_id = $2'];

    const { sql: visSql, params: visParams } = buildVisibilityClause(
      opts.visibility,
      baseVals.length + 1,
    );
    if (visSql) {
      conditions.push(visSql.replace(/^AND /, ''));
      baseVals.push(...visParams);
    }

    const where = conditions.join(' AND ');

    const { rows: countRows } = await db.query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM tickets t WHERE ${where}`,
      baseVals,
    );
    const total = parseInt(countRows[0]?.total ?? '0', 10);

    const limitIdx  = baseVals.length + 1;
    const offsetIdx = baseVals.length + 2;

    const { rows } = await db.query<TicketRow>(
      `SELECT t.* FROM tickets t
       WHERE ${where}
       ORDER BY t.created_at DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      [...baseVals, opts.limit, opts.offset],
    );

    return { data: rows.map(rowToTicket), total, limit: opts.limit, offset: opts.offset };
  }

  async findUserCompanyInfo(
    db: DbClient, tenantId: UUID, userId: UUID,
  ): Promise<{ companyId: UUID; companyType: string } | null> {
    const { rows } = await db.query<{ company_id: string; type: string }>(
      `SELECT u.company_id, c.type
       FROM users u JOIN companies c ON c.id = u.company_id
       WHERE u.id = $1 AND u.tenant_id = $2
       LIMIT 1`,
      [userId, tenantId],
    );
    if (!rows[0]) return null;
    return { companyId: rows[0].company_id as UUID, companyType: rows[0].type };
  }

  async findUserEmail(db: DbClient, tenantId: UUID, userId: UUID): Promise<string | null> {
    const { rows } = await db.query<{ email: string }>(
      `SELECT email FROM users WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
      [userId, tenantId],
    );
    return rows[0]?.email ?? null;
  }

  async findPartyChiefForInstrumentMan(
    db: DbClient, tenantId: UUID, projectId: UUID, instrumentManId: UUID,
  ): Promise<UUID | null> {
    const { rows } = await db.query<{ party_chief_id: string }>(
      `SELECT party_chief_id FROM crew_rosters
       WHERE tenant_id = $1 AND project_id = $2 AND instrument_man_id = $3
       LIMIT 1`,
      [tenantId, projectId, instrumentManId],
    );
    return (rows[0]?.party_chief_id as UUID) ?? null;
  }

  async findAorNodeIdsForUser(
    db: DbClient, projectId: UUID, userId: UUID,
  ): Promise<UUID[]> {
    const { rows } = await db.query<{ aor_node_id: string }>(
      `WITH RECURSIVE scoped_nodes AS (
         SELECT aa.aor_node_id
         FROM aor_assignments aa
         WHERE aa.project_id = $1
           AND aa.user_id = $2
           AND aa.deactivated_at IS NULL
         UNION
         SELECT child.id
         FROM aor_nodes child
         JOIN scoped_nodes parent_nodes
           ON child.parent_id = parent_nodes.aor_node_id
       )
       SELECT DISTINCT aor_node_id FROM scoped_nodes`,
      [projectId, userId],
    );
    return rows.map(r => r.aor_node_id as UUID);
  }

  async findProjectStatus(
    db: DbClient,
    tenantId: UUID,
    projectId: UUID,
  ): Promise<ProjectStatus | null> {
    const { rows } = await db.query<{ status: ProjectStatus }>(
      `SELECT status
       FROM projects
       WHERE tenant_id = $1
         AND id = $2
       LIMIT 1`,
      [tenantId, projectId],
    );
    return rows[0]?.status ?? null;
  }
}
