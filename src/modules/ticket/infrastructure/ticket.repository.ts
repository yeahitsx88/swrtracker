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
import type { ProjectRole } from '@/modules/identity/domain/types';
import type { ProjectLeadTimeConfig } from '../domain/lead-time-policy';
import type {
  ITicketRepository,
  PatchTicketOptions,
  TicketStatusPatch,
  ListTicketsOptions,
  VisibilityScope,
} from '../application/ports';
import { ConflictError } from '@/shared/errors';
import { ticketFilterClause } from './ticket-filter-clause';
import { assertVisibilityCohort, buildVisibilityClause } from '@/lib/ticket-visibility-clause';
import { buildReviewQuery } from './review-query';
import type { ReviewOptions, ReviewResult } from '../application/review-tickets';

// ---------------------------------------------------------------------------
// Row mapper
// ---------------------------------------------------------------------------

interface TicketRow {
  id: string;
  tenant_id: string;
  project_id: string;
  aor_node_id: string | null;
  department_id: string | null;
  company_id: string;
  ticket_number: string | null;
  ticket_type: string | null;
  requester_id: string;
  assigned_party_chief_id: string | null;
  assigned_instrument_man_id: string | null;
  survey_lead_id: string | null;
  workflow_variant: string;
  status: string;
  craft: string;
  field_contact: string | null;
  field_channel: string | null;
  description: string;
  requested_date: Date | string | null;
  draft_last_saved_at: Date | null;
  draft_deleted_at: Date | null;
  draft_deleted_reason: 'REQUESTER_DELETED' | null;
  original_requested_date: Date | string | null;
  first_submitted_at: Date | null;
  return_cycle: number;
  field_validation_reviewer_id: string | null;
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
  row_version?: number;
  created_at: Date;
  updated_at: Date;
}

function rowToTicket(r: TicketRow): Ticket {
  return {
    id:                      r.id as UUID,
    tenantId:                r.tenant_id as UUID,
    projectId:               r.project_id as UUID,
    aorNodeId:               r.aor_node_id as UUID | null,
    departmentId:            r.department_id as UUID | null,
    companyId:               r.company_id as UUID,
    ticketNumber:            r.ticket_number,
    ticketType:              r.ticket_type as TicketType | null,
    requesterId:             r.requester_id as UUID,
    assignedPartyChiefId:    r.assigned_party_chief_id as UUID | null,
    assignedInstrumentManId: r.assigned_instrument_man_id as UUID | null,
    surveyLeadId:            r.survey_lead_id as UUID | null,
    workflowVariant:         r.workflow_variant as WorkflowVariant,
    status:                  r.status as TicketStatus,
    craft:                   r.craft,
    fieldContact:            r.field_contact,
    fieldChannel:            r.field_channel,
    description:             r.description,
    requestedDate:           calendarDate(r.requested_date),
    draftLastSavedAt:        r.draft_last_saved_at,
    draftDeletedAt:          r.draft_deleted_at,
    draftDeletedReason:      r.draft_deleted_reason,
    originalRequestedDate:   calendarDate(r.original_requested_date),
    firstSubmittedAt:        r.first_submitted_at,
    returnCycle:             r.return_cycle ?? 0,
    fieldValidationReviewerId: r.field_validation_reviewer_id as UUID | null,
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
    rowVersion:              r.row_version ?? 0,
    createdAt:               r.created_at,
    updatedAt:               r.updated_at,
  };
}

function calendarDate(value: Date | string | null): Date | null {
  if (value === null) return null;
  const day = typeof value === 'string' ? value.slice(0, 10) : value.toISOString().slice(0, 10);
  return new Date(`${day}T00:00:00.000Z`);
}

// Visibility is shared with reporting; no chart owns a separate access policy.

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export class TicketRepository implements ITicketRepository {
  async review(db: DbClient, tenantId: UUID, options: ReviewOptions): Promise<ReviewResult> {
    const query = buildReviewQuery(tenantId, options, buildVisibilityClause(options.visibility, 3));
    const { rows } = await db.query<{ result: ReviewResult }>(query.sql, query.params);
    if (!rows[0]) throw new Error('Review aggregate query returned no result');
    return rows[0].result;
  }

  async findById(
    db: DbClient,
    tenantId: UUID,
    ticketId: UUID,
    visibility: VisibilityScope,
  ): Promise<Ticket | null> {
    const { sql: visSql, params: visParams } = buildVisibilityClause(visibility, 3);

    const { rows } = await db.query<TicketRow>(
      `SELECT t.*, t.requested_date::text AS requested_date, t.original_requested_date::text AS original_requested_date FROM tickets t
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
      `SELECT t.*, t.requested_date::text AS requested_date, t.original_requested_date::text AS original_requested_date
       FROM tickets t WHERE t.id = $1 AND t.tenant_id = $2 AND t.draft_deleted_at IS NULL LIMIT 1`,
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
        workflow_variant, status, craft, field_contact, field_channel, description, requested_date,
        submitted_at, approved_at, assigned_at, started_at,
        pending_pc_outcome, pending_pc_reason,
        survey_cancel_requested_by, survey_cancel_requested_role, survey_cancel_reason, survey_cancel_requested_at,
        completed_at, closed_at, rejection_reason, parent_ticket_id,
        priority, priority_set_by, priority_set_reason,
        created_at, updated_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
        $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,
        $26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38
      )`,
      [
        ticket.id, ticket.tenantId, ticket.projectId, ticket.aorNodeId,
        ticket.departmentId, ticket.companyId, ticket.ticketNumber, ticket.ticketType,
        ticket.requesterId, ticket.assignedPartyChiefId, ticket.assignedInstrumentManId,
        ticket.surveyLeadId,
        ticket.workflowVariant, ticket.status, ticket.craft, ticket.fieldContact, ticket.fieldChannel, ticket.description,
        ticket.requestedDate?.toISOString().slice(0, 10) ?? null,
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

  async findAorNodeCode(db: DbClient, tenantId: UUID, projectId: UUID, aorNodeId: UUID): Promise<string | null> {
    const { rows } = await db.query<{ code: string }>(
      `SELECT code FROM aor_nodes WHERE id = $1 AND tenant_id = $2 AND project_id = $3 AND retired_at IS NULL LIMIT 1`,
      [aorNodeId, tenantId, projectId],
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
    options?: PatchTicketOptions,
  ): Promise<void> {
    const cols: string[] = ['status = $3', 'updated_at = NOW()', 'row_version = COALESCE(row_version, 0) + 1'];
    const vals: unknown[] = [ticketId, tenantId, patch.status];
    let idx = 4;

    const maybe = (col: string, val: unknown) => {
      if (val !== undefined) { cols.push(`${col} = $${idx++}`); vals.push(val); }
    };

    maybe('department_id',              patch.departmentId);
    maybe('ticket_number',              patch.ticketNumber);
    maybe('submitted_at',               patch.submittedAt);
    maybe('first_submitted_at',         patch.firstSubmittedAt);
    maybe('original_requested_date',    patch.originalRequestedDate === undefined ? undefined : patch.originalRequestedDate?.toISOString().slice(0, 10) ?? null);
    maybe('requested_date',             patch.requestedDate === undefined ? undefined : patch.requestedDate.toISOString().slice(0, 10));
    maybe('return_cycle',               patch.returnCycle);
    maybe('field_validation_reviewer_id', patch.fieldValidationReviewerId);
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

    let where = 'id = $1 AND tenant_id = $2';

    if (options?.expectedStatus) {
      where += ` AND status = $${idx++}`;
      vals.push(options.expectedStatus);
    }
    if (options?.expectedRowVersion !== undefined) {
      where += ` AND COALESCE(row_version, 0) = $${idx++}`;
      vals.push(options.expectedRowVersion);
    }

    const { rows } = await db.query<{ id: string }>(
      `UPDATE tickets SET ${cols.join(', ')} WHERE ${where} RETURNING id`,
      vals,
    );

    if (rows.length === 0 && (options?.expectedStatus || options?.expectedRowVersion !== undefined)) {
      throw new ConflictError(
        'Ticket changed since it was loaded. Refresh and retry your action.',
        'WORKFLOW_STALE_STATE',
      );
    }
  }

  async list(db: DbClient, tenantId: UUID, opts: ListTicketsOptions): Promise<Page<Ticket>> {
    assertVisibilityCohort(opts.visibility, opts.filters?.cohort);
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

    const filter = ticketFilterClause(opts.filters ?? {}, baseVals.length + 1);
    if (filter.sql) conditions.push(filter.sql);
    baseVals.push(...filter.params);
    const where = conditions.join(' AND ');

    const { rows: countRows } = await db.query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM tickets t WHERE ${where}`,
      baseVals,
    );
    const total = parseInt(countRows[0]?.total ?? '0', 10);

    const limitIdx  = baseVals.length + 1;
    const offsetIdx = baseVals.length + 2;

    const { rows } = await db.query<TicketRow>(
      `SELECT t.*, t.requested_date::text AS requested_date, t.original_requested_date::text AS original_requested_date FROM tickets t
       WHERE ${where}
       ORDER BY ${opts.sort === 'operations' ? "(t.priority = 'HIGH') DESC, t.requested_date ASC, t.id ASC" : 't.created_at DESC, t.id DESC'}
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

  async isActiveProjectMemberWithRole(
    db: DbClient,
    tenantId: UUID,
    projectId: UUID,
    userId: UUID,
    roles: readonly ProjectRole[],
  ): Promise<boolean> {
    const { rows } = await db.query<{ eligible: boolean }>(
      `SELECT EXISTS (
         SELECT 1
         FROM project_memberships pm
         JOIN projects p ON p.id = pm.project_id AND p.tenant_id = $1
         JOIN users u ON u.id = pm.user_id AND u.tenant_id = p.tenant_id
         JOIN companies c ON c.id = u.company_id AND c.tenant_id = u.tenant_id
         WHERE pm.project_id = $2 AND pm.user_id = $3
           AND pm.role = ANY($4::text[]) AND (u.deactivated_at IS NULL AND pm.access_disabled_at IS NULL)
           AND (c.type <> 'SUBCONTRACTOR' OR pm.role = 'REQUESTER')
       ) AS eligible`,
      [tenantId, projectId, userId, roles],
    );
    return rows[0]?.eligible === true;
  }

  async hasCompanyAuthority(
    db: DbClient, tenantId: UUID, projectId: UUID, userId: UUID, companyId: UUID,
  ): Promise<boolean> {
    const { rows } = await db.query<{ granted: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM company_authority_grants g
         JOIN project_memberships pm
           ON pm.project_id = g.project_id AND pm.user_id = g.user_id
         JOIN users u ON u.id = g.user_id AND u.tenant_id = g.tenant_id
         WHERE g.tenant_id = $1 AND g.project_id = $2
           AND g.user_id = $3 AND g.company_id = $4
           AND g.revoked_at IS NULL AND (u.deactivated_at IS NULL AND pm.access_disabled_at IS NULL)
           AND pm.role = 'REQUESTER'
       ) AS granted`,
      [tenantId, projectId, userId, companyId],
    );
    return rows[0]?.granted === true;
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
         AND deactivated_at IS NULL
       LIMIT 1`,
      [tenantId, projectId, instrumentManId],
    );
    return (rows[0]?.party_chief_id as UUID) ?? null;
  }

  async lockDirectAssignmentAuthority(
    db: DbClient,
    scope: import('../application/ports').DirectAssignmentAuthority,
  ): Promise<boolean> {
    // Caller owns the transaction. Project/member locks serialize normal
    // staffing changes; the grant lock also fences a direct grant revocation.
    const { rows: actors } = await db.query<{ role: ProjectRole }>(
      `SELECT pm.role FROM projects p
       JOIN project_memberships pm ON pm.project_id=p.id AND pm.user_id=$3
       JOIN users u ON u.id=pm.user_id AND u.tenant_id=p.tenant_id
       JOIN companies c ON c.id=u.company_id AND c.tenant_id=p.tenant_id
       WHERE p.tenant_id=$1 AND p.id=$2 AND p.status='ACTIVE'
         AND pm.role=$4 AND pm.role IN ('SURVEY_MANAGER','SURVEY_SUPERINTENDENT')
         AND (u.deactivated_at IS NULL AND pm.access_disabled_at IS NULL) AND c.type<>'SUBCONTRACTOR'
         AND ($5::int IS NULL OR u.session_version=$5)
       FOR SHARE OF p,pm,u,c`,
      [scope.tenantId,scope.projectId,scope.actorId,scope.actorRole,scope.sessionVersion ?? null]);
    if (!actors[0]) return false;
    const { rows: nodes } = await db.query<{ id: UUID }>(
      `WITH RECURSIVE ancestors AS (
         SELECT id,parent_id FROM aor_nodes WHERE tenant_id=$1 AND project_id=$2 AND id=$3 AND retired_at IS NULL
         UNION
         SELECT n.id,n.parent_id FROM aor_nodes n JOIN ancestors a ON a.parent_id=n.id
         WHERE n.tenant_id=$1 AND n.project_id=$2 AND n.retired_at IS NULL
       ) SELECT n.id FROM aor_nodes n JOIN ancestors a ON a.id=n.id
         WHERE n.tenant_id=$1 AND n.project_id=$2 FOR SHARE OF n`,
      [scope.tenantId,scope.projectId,scope.aorNodeId]);
    if (!nodes.length) return false;
    if (actors[0].role === 'SURVEY_MANAGER') return true;
    const { rows: grants } = await db.query<{ id: UUID }>(
      `SELECT id FROM aor_assignments
       WHERE tenant_id=$1 AND project_id=$2 AND user_id=$3
         AND aor_node_id=ANY($4::uuid[]) AND deactivated_at IS NULL
       FOR SHARE`, [scope.tenantId,scope.projectId,scope.actorId,nodes.map(node => node.id)]);
    return grants.length > 0;
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

  async findProjectLeadTimeConfig(
    db: DbClient,
    tenantId: UUID,
    projectId: UUID,
  ): Promise<ProjectLeadTimeConfig | null> {
    const { rows } = await db.query<{
      lead_time_enforcement_enabled: boolean;
      lead_time_days: number;
    }>(
      `SELECT lead_time_enforcement_enabled, lead_time_days
       FROM projects
       WHERE tenant_id = $1
         AND id = $2
       LIMIT 1`,
      [tenantId, projectId],
    );
    if (!rows[0]) return null;
    return {
      enforcementEnabled: rows[0].lead_time_enforcement_enabled,
      leadTimeDays: rows[0].lead_time_days,
    };
  }
}
